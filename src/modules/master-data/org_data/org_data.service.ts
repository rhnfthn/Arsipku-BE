import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrgDatumDto } from './dto/create-org_datum.dto';
import { UpdateOrgDatumDto } from './dto/update-org_datum.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { OrgDatum } from './entities/org_datum.entity';
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { DelegasiEntity } from '../../delegasi/entities/delegasi.entity';
import { PositionStatus } from '../../../common/enums/position-status.enum';

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const ORG_CACHE_TTL_MS = 5 * 60_000; // 5 menit
const DELEGATION_CACHE_TTL_MS = 15_000;
const PERSNUM_CACHE_MAX = 5_000;

export type OrgPositionSnapshot = Pick<
  OrgDatum,
  'id' | 'tgl' | 'position_json'
>;

@Injectable()
export class OrgDataService {
  // Cache untuk findLatestOrg() — data sama untuk semua user
  private latestOrgCache: CacheEntry<OrgDatum | null> | null = null;

  // Lightweight cache for consumers that only need position data. Keeping it
  // separate prevents organization_json from being transferred and parsed.
  private latestPositionCache: CacheEntry<OrgPositionSnapshot | null> | null =
    null;
  private positionByDateCache = new Map<
    string,
    CacheEntry<OrgPositionSnapshot | null>
  >();

  // Cache findOrg(tgl) — per tanggal
  private orgByDateCache = new Map<string, CacheEntry<OrgDatum | null>>();

  // Cache findByPersnum(persnum) — per user
  private persnumCache = new Map<number, CacheEntry<any | null>>();
  private delegationByDateCache = new Map<
    string,
    CacheEntry<DelegasiEntity[]>
  >();

  constructor(
    @InjectRepository(OrgDatum)
    private readonly cRepo: Repository<OrgDatum>,
    @InjectRepository(DelegasiEntity)
    private readonly delegasiRepo: Repository<DelegasiEntity>,
  ) {}

  /** Bust seluruh cache (panggil saat data org_data berubah / regenerate) */
  invalidateCache() {
    this.latestOrgCache = null;
    this.latestPositionCache = null;
    this.orgByDateCache.clear();
    this.positionByDateCache.clear();
    this.persnumCache.clear();
    this.delegationByDateCache.clear();
  }

  /** Bust overlay saat konfigurasi delegasi dibuat, diubah, atau dihapus. */
  invalidateDelegationOverlayCache() {
    this.delegationByDateCache.clear();
  }

  private async getActivePositionDelegations(
    effectiveDate: string,
  ): Promise<DelegasiEntity[]> {
    const cached = this.delegationByDateCache.get(effectiveDate);
    if (cached && cached.expires > Date.now()) return cached.data;

    const data = await this.delegasiRepo.find({
      where: {
        position_status: In([
          PositionStatus.PT,
          PositionStatus.PH,
          PositionStatus.PS,
        ]),
        start_date: LessThanOrEqual(new Date(effectiveDate)),
        end_date: MoreThanOrEqual(new Date(effectiveDate)),
      },
      order: { update_at: 'DESC', create_at: 'DESC' },
    });
    this.delegationByDateCache.set(effectiveDate, {
      data,
      expires: Date.now() + DELEGATION_CACHE_TTL_MS,
    });
    return data;
  }

  /**
   * Isi pejabat efektif pada position_json dari delegasi PT/PH/PS aktif.
   * Position tetap jabatan yang didelegasikan; person dan nama menjadi aktor
   * delegasi agar dropdown, sirkulasi, preview, dan PDF memakai identitas sama.
   */
  private async withActiveDelegations<T extends { position_json?: any }>(
    orgData: T | null,
    effectiveDate?: string,
  ): Promise<T | null> {
    if (!orgData || !Array.isArray(orgData.position_json)) return orgData;
    const date =
      effectiveDate ||
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    const delegations = await this.getActivePositionDelegations(date);
    if (!delegations.length) return orgData;

    const byPosition = new Map<string, DelegasiEntity>();
    for (const delegation of delegations) {
      const positionId = String(delegation.as_position || '').trim();
      if (positionId && !byPosition.has(positionId)) {
        byPosition.set(positionId, delegation);
      }
    }
    if (!byPosition.size) return orgData;

    const positionJson = orgData.position_json.map((position: any) => {
      const delegation = byPosition.get(String(position?.position ?? ''));
      if (!delegation) return position;
      const persnum = Number(delegation.as_persnum);
      return {
        ...position,
        persnum_person: Number.isFinite(persnum) ? persnum : delegation.as_persnum,
        persnum_person_text: delegation.as_name || position.persnum_person_text,
        persnum: Number.isFinite(persnum) ? persnum : delegation.as_persnum,
        nama: delegation.as_name || position.nama,
        position_status: delegation.position_status,
        positionStatus: delegation.position_status,
        delegation_id: delegation.id,
        is_delegated: true,
      };
    });

    return { ...orgData, position_json: positionJson };
  }

  async findAll(): Promise<OrgDatum[]> {
    const rows = await this.cRepo.find({
      order: { createAt: 'DESC' },
    });
    if (!rows.length) return rows;
    const latest = await this.withActiveDelegations(rows[0]);
    return latest ? [latest as OrgDatum, ...rows.slice(1)] : rows;
  }

  findBodByCompany(
    rows: any[],
    // company tidak dipakai: direksi = semua baris bod_tag='BOD' di seluruh
    // org, tidak perlu filter per company. Param tetap di signature agar caller
    // (controller getBod & naskah getBodDirectors) tak berubah.
    company?: string | number,
    // bod_tag yang disertakan — default BOD (direksi); endpoint bod-bod1
    // memakai ['BOD','BOD-1'] untuk opsi pengganti penandatanga direksi.
    tags: string[] = ['BOD'],
  ): Array<{
    positionId: string;
    persnum?: number;
    nama: string;
    jabatan: string;
    bodTag: string;
  }> {
    void company;
    // rows = OrgDatum[] (findAll, createAt DESC). BOD bukan kolom OrgDatum —
    // ia bersar di position_json, yaitu array flat posisi (barisData) dari
    // flattenOrgTree: tiap elemen punya company/position/position_text/
    // persnum_person/persnum_person_text/bod_tag langsung. Sebelumnya filter
    // r.company/JSON.parse(r.position_json) di level OrgDatum → selalu kosong
    // karena field itu tidak ada di entity & position_json sudah ter-parse.
    const withJson = rows.filter(
      (r) => Array.isArray(r?.position_json) && r.position_json.length > 0,
    );
    const barisData: any[] = withJson[0]?.position_json ?? [];
    const isDirut = (text: string) => /direktur\s*utama/i.test(text || '');
    // Urutan kanonik direksi LPPNPI untuk "Sebelum ditetapkan diketahui oleh"
    // (docs/lembar_persetujuan_direksi.html). Dirut selalu terakhir — ia
    // penandatangan a.n DIREKSI, bukan baris paraf. Keyword unik per direktorat
    // agar robust terhadap variasi penulisan (koma, "&", "DAN").
    const BOD_ORDER = ['OPERASI', 'TEKNIK', 'KESELAMATAN', 'KEUANGAN', 'SDM'];
    const rankBod = (jabatan: string): number => {
      const t = String(jabatan || '').toUpperCase();
      if (isDirut(t)) return BOD_ORDER.length + 1;
      const idx = BOD_ORDER.findIndex((k) => t.includes(k));
      return idx >= 0 ? idx : BOD_ORDER.length;
    };
    const wanted = tags.map((t) => t.toUpperCase().trim());
    return barisData
      .filter(
        (x) =>
          x &&
          wanted.includes(String(x.bod_tag || '').toUpperCase().trim()),
      )
      .map((x) => ({
        positionId: String(x.position ?? ''),
        persnum: x.persnum_person ? Number(x.persnum_person) : undefined,
        nama: x.persnum_person_text || '',
        jabatan: x.position_text || '',
        bodTag: String(x.bod_tag || '').toUpperCase().trim(),
      }))
      .sort((a, b) => rankBod(a.jabatan) - rankBod(b.jabatan) || a.jabatan.localeCompare(b.jabatan));
  }

  async findOne(id: string): Promise<OrgDatum> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Data with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateOrgDatumDto): Promise<OrgDatum> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    const saved = await this.cRepo.save(newCompany);
    this.invalidateCache();
    return saved;
  }

  async update(id: string, dto: UpdateOrgDatumDto): Promise<OrgDatum> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    const saved = await this.cRepo.save(updated);
    this.invalidateCache();
    return saved;
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.cRepo.remove(company);
    this.invalidateCache();
    return { message: `Area ${id} deleted successfully` };
  }

  async createOrUpdate(
    tgl: string,
    organization_json: any,
    position_json: any,
  ) {
    if (!tgl) {
      throw new BadRequestException('Tanggal (tgl) is required');
    }

    const existing = await this.cRepo.findOne({ where: { tgl } });

    let result: OrgDatum;
    if (existing) {
      // UPDATE
      existing.organization_json = organization_json;
      existing.position_json = position_json;
      result = await this.cRepo.save(existing);
    } else {
      // INSERT
      const newData = this.cRepo.create({
        tgl,
        organization_json,
        position_json,
      });
      result = await this.cRepo.save(newData);
    }

    this.invalidateCache();
    return result;
  }

  async findOrg(tgl: string) {
    if (!tgl) {
      throw new BadRequestException('Tanggal (tgl) is required');
    }

    const now = Date.now();
    const cached = this.orgByDateCache.get(tgl);
    if (cached && cached.expires > now) {
      if (!cached.data) {
        throw new NotFoundException(
          `Data untuk tanggal ${tgl} tidak ditemukan`,
        );
      }
      return (await this.withActiveDelegations(cached.data, tgl))!;
    }

    const result = await this.cRepo.findOne({ where: { tgl } });
    this.orgByDateCache.set(tgl, {
      data: result || null,
      expires: now + ORG_CACHE_TTL_MS,
    });

    if (!result) {
      throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    }

    return (await this.withActiveDelegations(result, tgl))!;
  }

  /**
   * Find latest org data (most recent by tgl)
   * Used when exact date match is not required
   */
  async findLatestOrg(): Promise<OrgDatum | null> {
    const now = Date.now();
    if (this.latestOrgCache && this.latestOrgCache.expires > now) {
      const cached = this.latestOrgCache.data;
      return this.withActiveDelegations(cached);
    }

    const result = await this.cRepo
      .createQueryBuilder('organization_build')
      .orderBy('organization_build.tgl', 'DESC')
      .limit(1)
      .getOne();

    this.latestOrgCache = {
      data: result || null,
      expires: now + ORG_CACHE_TTL_MS,
    };

    return this.withActiveDelegations(result || null);
  }

  /** Lightweight organization snapshot for position-based routing/lookups. */
  async findPositionSnapshot(tgl: string): Promise<OrgPositionSnapshot | null> {
    if (!tgl) throw new BadRequestException('Tanggal (tgl) is required');
    const now = Date.now();
    const cached = this.positionByDateCache.get(tgl);
    if (cached && cached.expires > now)
      return this.withActiveDelegations(cached.data, tgl);

    const result = await this.cRepo
      .createQueryBuilder('organization_build')
      .select([
        'organization_build.id',
        'organization_build.tgl',
        'organization_build.position_json',
      ])
      .where('organization_build.tgl = :tgl', { tgl })
      .getOne();
    this.positionByDateCache.set(tgl, {
      data: result || null,
      expires: now + ORG_CACHE_TTL_MS,
    });
    return this.withActiveDelegations(result || null, tgl);
  }

  /** Latest lightweight snapshot without loading organization_json. */
  async findLatestPositionSnapshot(): Promise<OrgPositionSnapshot | null> {
    const now = Date.now();
    if (this.latestPositionCache && this.latestPositionCache.expires > now) {
      const cached = this.latestPositionCache.data;
      return this.withActiveDelegations(cached);
    }

    const result = await this.cRepo
      .createQueryBuilder('organization_build')
      .select([
        'organization_build.id',
        'organization_build.tgl',
        'organization_build.position_json',
      ])
      .orderBy('organization_build.tgl', 'DESC')
      .limit(1)
      .getOne();
    this.latestPositionCache = {
      data: result || null,
      expires: now + ORG_CACHE_TTL_MS,
    };
    return this.withActiveDelegations(result || null);
  }

  /**
   * Get all managerial positions (chief=1) from org_data
   * Returns all positions without any relational filters
   *
   * @param tgl - Optional date (default: today)
   * @returns Array of all managerial positions
   */
  async getAllManagerialPositions(tgl?: string): Promise<{
    success: boolean;
    data: any[];
    total: number;
    tanggal: string;
  }> {
    // Use today's date if not provided
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    // Cari org_data untuk tanggal spesifik; fallback ke data terbaru jika
    // tidak ada row untuk tanggal tersebut (org_data hanya di-generate untuk
    // tanggal tertentu, default 2025-01-01). Tanpa fallback, dropdown atasan
    // managerial di form usulan pindah selalu kosong.
    let orgData: any = null;
    try {
      orgData = await this.findOrg(tanggal);
    } catch {
      orgData = await this.findLatestOrg();
    }

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: any[] = orgData.position_json;

    // Filter only managerial positions (chief = 1)
    const managerialPositions = barisData.filter((x) => x.chief === 1);

    return {
      success: true,
      data: managerialPositions,
      total: managerialPositions.length,
      tanggal,
    };
  }

  /**
   * Get atasan (pejabat pemberi kuasa) untuk sebuah positionId — atasan di
   * direktorat + company SAMA dengan signer (untuk Garis Kewenangan a.n. SDE).
   * Return chief=1 (managerial) di direktorat yang sama, exclude signer sendiri.
   * Di-sort by level ascending (level lebih rendah = lebih senior di atas).
   * FE pakai untuk dropdown "atas nama" di form create SDE.
   */
  async getAtasanByPosition(
    positionId: number,
    tgl?: string,
  ): Promise<{
    success: boolean;
    data: any[];
    total: number;
    tanggal: string;
  }> {
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    // Cari org_data untuk tanggal spesifik; fallback ke data terbaru jika
    // tidak ada row untuk tanggal tersebut (org_data belum di-generate untuk
    // hari ini). Tanpa fallback, atasan selalu 404 di hari baru.
    let orgData: any = null;
    try {
      orgData = await this.findOrg(tanggal);
    } catch {
      orgData = await this.findLatestOrg();
    }

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: any[] = orgData.position_json;
    const signer = barisData.find(
      (x) => Number(x.position) === Number(positionId),
    );
    if (!signer) {
      throw new NotFoundException(
        `Position ${positionId} tidak ditemukan dalam org_data tanggal ${tanggal}.`,
      );
    }

    const signerDir = Number(signer.direktorat_id ?? null);
    const signerCompany = Number(signer.company ?? null);
    const isSignerDirut = /direktur\s+utama/i.test(signer.position_text || '');
    // ponytail: signer Direktur (BOD non-Utama) → a.n. + auto-CC = Direktur Utama
    // (company level), BUKAN bawahan di direktorat sendiri. Sebelumnya filter
    // direktorat-same return bawahan (BOD-1) untuk signer Direktur.
    const isSignerDirektur =
      String(signer.bod_tag || '').toUpperCase() === 'BOD' && !isSignerDirut;

    if (isSignerDirektur) {
      const dirut = barisData.find(
        (x) =>
          Number(x.company ?? null) === signerCompany &&
          /direktur\s+utama/i.test(x.position_text || ''),
      );
      return {
        success: true,
        data: dirut ? [dirut] : [],
        total: dirut ? 1 : 0,
        tanggal,
      };
    }

    // Signer EVP/bawah → atasan chief=1 di direktorat+company sama, exclude self.
    // Sort by level ascending (level lebih rendah = lebih senior di atas).
    const atasan = barisData
      .filter(
        (x) =>
          Number(x.position) !== Number(positionId) &&
          x.chief === 1 &&
          Number(x.direktorat_id ?? null) === signerDir &&
          Number(x.company ?? null) === signerCompany,
      )
      .sort((a, b) => Number(a.level ?? 99) - Number(b.level ?? 99));

    return {
      success: true,
      data: atasan,
      total: atasan.length,
      tanggal,
    };
  }

  /**
   * Atasan managerial dari sebuah positionId berdasarkan RANK jabatan
   * (Direktur > EVP > VP > AVP), bukan tree ancestry. AVP/VP/EVP di org_data
   * duduk sebagai posisi chief=1 di dalam Direktorat (level tree sama), jadi
   * walk organization_parent hanya nemu kepala org Direktur — rank VP/EVP/AVP
   * di-skip. Solusi: filter chief=1 di DIVISI+company sama dengan pengaju yang
   * rank-nya lebih senior, sort rank ascending (AVP → VP → EVP → Direktur).
   * Dipakai dropdown verifikator penutupan berkas.
   */
  async getAtasanManagerial(
    positionId: number,
    tgl?: string,
  ): Promise<{
    success: boolean;
    data: any[];
    total: number;
    tanggal: string;
  }> {
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    // Cari org_data untuk tanggal spesifik; fallback ke data terbaru jika
    // tidak ada row untuk tanggal tersebut (org_data belum di-generate untuk
    // hari ini). Tanpa fallback, atasan-managerial selalu 404 di hari baru.
    let orgData: any = null;
    try {
      orgData = await this.findOrg(tanggal);
    } catch {
      orgData = await this.findLatestOrg();
    }

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: any[] = orgData.position_json;
    const current = barisData.find(
      (x) => Number(x.position) === Number(positionId),
    );
    if (!current) {
      throw new NotFoundException(
        `Position ${positionId} tidak ditemukan dalam org_data tanggal ${tanggal}.`,
      );
    }

    // Rank dari position_text: Direktur(4) > EVP(3) > VP(2) > AVP(1) > lain(0).
    // Cek Direktur & EVP/AVP dulu sebelum VP (VP adalah substring EVP/AVP).
    const rankOf = (text: any): number => {
      const t = String(text || '').toUpperCase();
      if (/DIREKTUR/.test(t)) return 4;
      if (/\bEVP\b/.test(t)) return 3;
      if (/\bAVP\b/.test(t)) return 1;
      if (/\bVP\b/.test(t)) return 2;
      return 0;
    };

    // Normalisasi divisi dengan fallback organization_id — konsisten dengan
    // getVerifikatorBod & resolveScopePositions. Tanpa fallback, pengaju yang
    // barisnya tidak punya divisi_id (null) mencocokkan SEMUA baris ber-divisi
    // null di company → daftar verifikator melebar ke seluruh BOD.
    const signerDivisi = Number(
      current.divisi_id ?? current.organization_id ?? null,
    );
    const signerDivisiSafe =
      Number.isFinite(signerDivisi) && signerDivisi > 0 ? signerDivisi : null;
    const signerDir = Number(current.direktorat_id ?? null);
    const signerDirSafe =
      Number.isFinite(signerDir) && signerDir > 0 ? signerDir : null;
    const signerCompany = Number(current.company ?? null);
    const signerRank = rankOf(current.position_text);

    const atasan = barisData
      .filter((x) => {
        if (Number(x.position) === Number(positionId)) return false;
        if (x.chief !== 1) return false;
        if (Number(x.company ?? null) !== signerCompany) return false;
        const r = rankOf(x.position_text);
        if (r === 0 || r <= signerRank) return false;
        // Managerial di divisi sama (AVP/VP/EVP), ATAU Direktur (rank 4) di
        // direktorat yang sama dengan pengaju meskipun beda divisi. Kedua
        // pembanding dinormalisasi ke null agar Number(null)=0 tidak menyamakan
        // baris yang memang tidak punya divisi/direktorat.
        const xDivisi = Number(x.divisi_id ?? x.organization_id ?? null);
        if (
          signerDivisiSafe !== null &&
          Number.isFinite(xDivisi) &&
          xDivisi > 0 &&
          xDivisi === signerDivisiSafe
        ) {
          return true;
        }
        return (
          r === 4 &&
          signerDirSafe !== null &&
          Number(x.direktorat_id ?? null) === signerDirSafe
        );
      })
      .sort((a, b) => rankOf(a.position_text) - rankOf(b.position_text));

    // Direktur Utama wajib ada di daftar verifikator (otoritas tertinggi),
    // meskipun berada di direktorat berbeda dari pengaju — filter direktorat
    // di atas bisa mengecualikannya. Cari di company sama, chief=1, position_text
    // mengandung "Direktur Utama" / "President Director", bukan posisi pengaju.
    const isDirekturUtama = (text: any): boolean =>
      /DIREKTUR\s+UTAMA/i.test(String(text || '')) ||
      /PRESIDENT\s+DIRECTOR/i.test(String(text || ''));
    if (!atasan.some((x) => isDirekturUtama(x.position_text))) {
      const du = barisData.find(
        (x) =>
          Number(x.position) !== Number(positionId) &&
          x.chief === 1 &&
          Number(x.company ?? null) === signerCompany &&
          isDirekturUtama(x.position_text),
      );
      if (du) {
        atasan.push(du);
        atasan.sort(
          (a, b) => rankOf(a.position_text) - rankOf(b.position_text),
        );
      }
    }

    return {
      success: true,
      data: atasan,
      total: atasan.length,
      tanggal,
    };
  }

  /**
   * Pejabat managerial pada unit/divisi yang sama, tanpa membatasi arah hierarki.
   * Dipakai persetujuan lanjutan Naskah Lainnya: penerima aktif boleh meneruskan
   * ke pejabat yang lebih tinggi maupun lebih rendah, tetapi tidak keluar unit.
   */
  async getManagerialSameUnit(positionId: number, tgl?: string) {
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    let orgData: any = null;
    try {
      orgData = await this.findOrg(tanggal);
    } catch {
      orgData = await this.findLatestOrg();
    }
    const rows: any[] = orgData?.position_json ?? [];
    const current = rows.find(
      (row) => Number(row.position) === Number(positionId),
    );
    if (!current) {
      throw new NotFoundException(`Position ${positionId} tidak ditemukan.`);
    }

    // Gunakan sumber dan kriteria verifikator yang sama dengan form Naskah
    // Lainnya (position_json + chief=1), tetapi batasi pada unit evaluator.
    // Sebagian snapshot org tidak mengisi divisi_id pada posisi EVP; pada
    // kondisi itu direktorat adalah scope unit yang benar. organization_id
    // hanya menjadi fallback terakhir karena nilainya dapat berbeda pada
    // setiap sub-unit di bawah EVP.
    const currentDivision = Number(current.divisi_id ?? null);
    const currentDirectorate = Number(current.direktorat_id ?? null);
    const currentOrganization = Number(current.organization_id ?? null);
    const company = Number(current.company ?? null);
    const data = rows.filter((row) => {
      const sameUnit =
        Number.isFinite(currentDivision) && currentDivision > 0
          ? Number(row.divisi_id ?? null) === currentDivision
          : Number.isFinite(currentDirectorate) && currentDirectorate > 0
            ? Number(row.direktorat_id ?? null) === currentDirectorate
            : Number.isFinite(currentOrganization) && currentOrganization > 0
              ? Number(row.organization_id ?? null) === currentOrganization
              : false;
      return (
        Number(row.position) !== Number(positionId) &&
        row.chief === 1 &&
        Number(row.company ?? null) === company &&
        sameUnit &&
        row.persnum_person != null
      );
    });

    return { success: true, data, total: data.length, tanggal };
  }

  /**
   * Find user by persnum from organization_json
   * Used for SSO authentication
   *
   * Structure: organization_json is nested hierarchy
   * User data is in: positions[].person.persnum
   *
   * Cached per persnum (5 menit) — payload organization_json bisa puluhan MB
   * jadi caching menghindari hit DB + JSON parse berulang.
   */
  async findByPersnum(persnum: number): Promise<any | null> {
    const now = Date.now();
    const cached = this.persnumCache.get(persnum);
    if (cached && cached.expires > now) {
      return cached.data;
    }

    try {
      // Reuse latest org data dengan cache (juga akan ter-cache 5 menit)
      const latestOrgData = await this.findLatestOrg();

      if (!latestOrgData || !latestOrgData.organization_json) {
        this.setPersnumCache(persnum, null);
        return null;
      }

      const orgJson = latestOrgData.organization_json;
      if (!Array.isArray(orgJson)) {
        this.setPersnumCache(persnum, null);
        return null;
      }

      // Helper mapper: flatten shape user/atasan response
      const mapPositionWithOrg = (org: any, position: any) => ({
        persnum: position.person?.persnum ?? null,
        nama: position.person?.persnum_text ?? null,
        company: org.company,
        companyText: org.company_name,
        area: org.area,
        areaText: org.area_text,
        subArea: org.sub_area,
        subAreaText: org.sub_area_text,
        organization: org.id,
        organizationText: org.name,
        organizationAbbreviation: org.abbreviation,
        position: position.position,
        positionText: position.position_text,
        positionAbbreviation: position.abbreviation,
        abbreviation: position.abbreviation || '', // Use position abbreviation
        isChief: position.chief === 1,
        bodTag: position.bod_tag,
      });

      // Recursive function to search user in nested structure
      const searchPersnum = parseInt(String(persnum));

      const findUserInOrg = (
        orgs: any[],
        parentOrg: any | null = null,
      ): any | null => {
        for (const org of orgs) {
          if (org.positions && Array.isArray(org.positions)) {
            for (const position of org.positions) {
              if (position.person && position.person.persnum) {
                const positionPersnum = parseInt(
                  String(position.person.persnum),
                );

                if (positionPersnum === searchPersnum) {
                  const userData = mapPositionWithOrg(org, position);

                  // Atasan langsung: position di organization parent (1 level di atas)
                  let atasanLangsung: any = null;
                  if (
                    parentOrg?.positions &&
                    Array.isArray(parentOrg.positions)
                  ) {
                    const parentChief = parentOrg.positions.find(
                      (p: any) => p?.person?.persnum && p?.chief === 1,
                    );

                    if (parentChief) {
                      atasanLangsung = mapPositionWithOrg(
                        parentOrg,
                        parentChief,
                      );
                    }
                  }

                  return {
                    ...userData,
                    atasan_langsung: atasanLangsung,
                  };
                }
              }
            }
          }

          if (org.children && Array.isArray(org.children)) {
            const found = findUserInOrg(org.children, org);
            if (found) return found;
          }
        }
        return null;
      };

      const userOrg = findUserInOrg(orgJson);
      this.setPersnumCache(persnum, userOrg || null);
      return userOrg || null;
    } catch (error) {
      console.error('[OrgDataService] Error in findByPersnum:', error);
      throw error;
    }
  }

  /** Helper LRU-ish set untuk persnumCache (cap to PERSNUM_CACHE_MAX) */
  private setPersnumCache(persnum: number, data: any | null) {
    if (this.persnumCache.size >= PERSNUM_CACHE_MAX) {
      this.persnumCache.clear();
    }
    this.persnumCache.set(persnum, {
      data,
      expires: Date.now() + ORG_CACHE_TTL_MS,
    });
  }
}
