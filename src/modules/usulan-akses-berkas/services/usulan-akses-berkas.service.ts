import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  UsulanAksesBerkasEntity,
  VerificationStepEntity,
  UsulanBerkasEntity,
  AksesBerkasEntity,
} from '../entities';
import {
  CreateUsulanAksesBerkasDto,
  VerifikasiPengusulDto,
  VerifikasiPemberiDto,
  PilihBerkasDto,
  PersetujuanPemberiDto,
} from '../dto';
import {
  StatusUsulan,
  JenisBerkas,
  DurasiPreset,
  DURASI_PRESET_HARI,
  Keputusan,
} from '../enums';
import { StatusBerkas, Berkas } from '../../berkas/entities/berkas.entity';
import { DelegasiEntity } from '../../delegasi/entities/delegasi.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { PositionStatus } from '../../../common/enums/position-status.enum';

/**
 * ID organization "Corporate Secretary Division" (TU)
 * Jika jenisBerkas = INAKTIF, divisi pemberi otomatis di-set ke divisi ini
 */
export const CORPORATE_SECRETARY_ORG_ID = 10002098;

/**
 * Level jabatan mapping — support BOD tags (BOD, BOD-1, BOD-2, BOD-3)
 * dan legacy AVP/VP/EVP. Sort bottom-to-top: BOD-3 → BOD-2 → BOD-1 → BOD.
 */
type LevelJabatan = 'AVP' | 'VP' | 'EVP' | 'BOD' | 'BOD-1' | 'BOD-2' | 'BOD-3';
const LEVEL_ORDER: Record<LevelJabatan, number> = {
  // BOD tags (baru) — bottom-to-top
  'BOD-3': 1,
  'BOD-2': 2,
  'BOD-1': 3,
  BOD: 4,
  // Legacy AVP/VP/EVP (backward compat)
  AVP: 5,
  VP: 6,
  EVP: 7,
};

@Injectable()
export class UsulanAksesBerkasService {
  private readonly logger = new Logger(UsulanAksesBerkasService.name);

  constructor(
    @InjectRepository(UsulanAksesBerkasEntity)
    private readonly usulanRepo: Repository<UsulanAksesBerkasEntity>,
    @InjectRepository(VerificationStepEntity)
    private readonly stepRepo: Repository<VerificationStepEntity>,
    @InjectRepository(UsulanBerkasEntity)
    private readonly usulanBerkasRepo: Repository<UsulanBerkasEntity>,
    @InjectRepository(AksesBerkasEntity)
    private readonly aksesRepo: Repository<AksesBerkasEntity>,
    @InjectRepository(Berkas)
    private readonly berkasRepo: Repository<Berkas>,
    @InjectRepository(DelegasiEntity)
    private readonly delegasiRepo: Repository<DelegasiEntity>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
  ) {}

  // ── Helper: Generate Nomor Usulan ──────────────────────────────

  private async generateNomorUsulan(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.usulanRepo
      .createQueryBuilder('u')
      .where('u.nomorUsulan LIKE :pattern', { pattern: `UAB-${year}-%` })
      .getCount();
    const seq = String(count + 1).padStart(4, '0');
    return `UAB-${year}-${seq}`;
  }

  // ── Helper: Auto-sort verifikator bottom-to-top ────────────────
  // Sort berdasarkan level (AVP=1, VP=2, EVP=3) ascending, lalu reassign
  // urutan berurutan 1, 2, 3, ... (max 3).
  // Contoh: [AVP, VP, EVP] → urutan [1, 2, 3]
  //         [EVP saja] → urutan [1] (bukan [3] lagi)
  //         [AVP, EVP] → urutan [1, 2]
  private sortVerifikator(
    verifikator: { persnum: number; levelJabatan: LevelJabatan }[],
  ): { persnum: number; levelJabatan: LevelJabatan; urutan: number }[] {
    return verifikator
      .map((v) => ({ ...v, _levelOrder: LEVEL_ORDER[v.levelJabatan] ?? 99 }))
      .sort((a, b) => a._levelOrder - b._levelOrder)
      .slice(0, 3) // max 3 jenjang
      .map((v, index) => {
        const { _levelOrder, ...rest } = v;
        return { ...rest, urutan: index + 1 };
      });
  }

  // ── Helper: Parse level jabatan dari position_text ──────────────

  private parseLevelJabatan(positionText: string): LevelJabatan | null {
    if (!positionText) return null;
    const upper = positionText.toUpperCase();
    if (upper.includes('EVP')) return 'EVP';
    if (upper.includes('VP') && !upper.includes('EVP')) return 'VP';
    if (upper.includes('AVP')) return 'AVP';
    return null;
  }

  // ── Helper: Ambil managerial di divisi tertentu dari position_json ──

  async getManagerialInDivisi(orgId: number): Promise<any[]> {
    const orgData = await this.orgDataService.findLatestOrg();
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException('Data organisasi tidak ditemukan');
    }

    const positionJson =
      typeof orgData.position_json === 'string'
        ? JSON.parse(orgData.position_json)
        : orgData.position_json;

    if (!Array.isArray(positionJson)) {
      throw new BadRequestException('Format data organisasi tidak valid');
    }

    // Filter: chief = 1 AND organization_id = orgId
    const managerial = positionJson.filter(
      (x: any) => x.chief === 1 && Number(x.organization_id) === Number(orgId),
    );

    // Map dan parse level jabatan
    const mapped = managerial
      .map((v: any) => {
        const levelJabatan = this.parseLevelJabatan(v.position_text || '');
        if (!levelJabatan) return null;
        return {
          persnum: v.persnum_person,
          nama: v.persnum_person_text,
          positionId: v.position,
          jabatan: v.position_text,
          levelJabatan,
          _levelOrder: LEVEL_ORDER[levelJabatan],
          divisiId: v.organization_id,
          divisiNama: v.organization_text,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a._levelOrder - b._levelOrder);

    // Reassign urutan berurutan (1, 2, 3, ...) untuk FE display
    return mapped.map((v: any, index: number) => {
      const { _levelOrder, ...rest } = v;
      return { ...rest, urutan: index + 1 };
    });
  }

  // ── Endpoint: GET /verifikator ─────────────────────────────────

  async getVerifikator(userOrgId: number): Promise<any[]> {
    return this.getManagerialInDivisi(userOrgId);
  }

  // ── Endpoint: GET /verifikator-bod ──────────────────────────────
  // Return BOD (BOD, BOD-1, BOD-2, BOD-3) di divisi tertentu dari position_json,
  // digabung dengan managerial yang sedang didelegasikan (PT/PH/PS aktif) di
  // divisi tersebut. Sort: BOD → BOD-1 → BOD-2 → BOD-3.

  private static readonly BOD_TAG_ORDER: Record<string, number> = {
    BOD: 1,
    'BOD-1': 2,
    'BOD-2': 3,
    'BOD-3': 4,
  };

  async getVerifikatorBod(divisiId: number): Promise<any[]> {
    const orgData = await this.orgDataService.findLatestOrg();
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException('Data organisasi tidak ditemukan');
    }

    const positionJson =
      typeof orgData.position_json === 'string'
        ? JSON.parse(orgData.position_json)
        : orgData.position_json;

    if (!Array.isArray(positionJson)) {
      throw new BadRequestException('Format data organisasi tidak valid');
    }

    // 1. Filter BOD dari position_json: bod_tag IN (BOD, BOD-1, BOD-2, BOD-3)
    //    AND divisi_id (atau organization_id) = divisiId
    const bodList = positionJson
      .filter((x: any) => {
        const tag = x.bod_tag || '';
        const isBod = !!UsulanAksesBerkasService.BOD_TAG_ORDER[tag];
        const xDivisi = Number(x.divisi_id ?? x.organization_id);
        return isBod && xDivisi === Number(divisiId);
      })
      .map((v: any) => ({
        persnum: v.persnum_person,
        nama: v.persnum_person_text,
        positionId: v.position,
        jabatan: v.position_text,
        bodTag: v.bod_tag,
        levelJabatan: v.bod_tag,
        divisiId: v.divisi_id ?? v.organization_id,
        divisiNama: v.divisi_name ?? v.organization_text,
        isDelegasi: false,
        positionStatus: null,
        _order: UsulanAksesBerkasService.BOD_TAG_ORDER[v.bod_tag] ?? 99,
      }));

    // 2. Fetch delegasi aktif (PT/PH/PS) di divisi target
    const today = new Date();
    const delegasiAktif = await this.delegasiRepo
      .createQueryBuilder('d')
      .where('d.as_organization = :divisiId', { divisiId: String(divisiId) })
      .andWhere('d.start_date <= :today', { today })
      .andWhere('d.end_date >= :today', { today })
      .andWhere('d.position_status IN (:...statuses)', {
        statuses: [PositionStatus.PT, PositionStatus.PH, PositionStatus.PS],
      })
      .getMany();

    // Lookup bod_tag untuk setiap delegasi dari position_json by as_position
    const delegasiMapped = delegasiAktif
      .map((d) => {
        const posMatch = positionJson.find(
          (p: any) => String(p.position) === String(d.as_position),
        );
        const bodTag = posMatch?.bod_tag ?? null;
        const order = UsulanAksesBerkasService.BOD_TAG_ORDER[bodTag] ?? 99;
        // Skip jika bukan BOD (delegasi non-managerial tidak masuk verifikator)
        if (!order || order === 99) return null;
        return {
          persnum: Number(d.as_persnum),
          nama: d.as_name,
          positionId: Number(d.as_position),
          jabatan: d.as_position_text,
          bodTag,
          levelJabatan: bodTag,
          divisiId: Number(d.as_organization),
          divisiNama: d.as_organization_text,
          isDelegasi: true,
          positionStatus: d.position_status,
          _order: order,
        };
      })
      .filter(Boolean) as any[];

    // 3. Gabung + dedup by persnum (BOD definitif prioritas, delegasi sebagai tambahan)
    const seen = new Set<number>();
    const merged = [...bodList, ...delegasiMapped].filter((v) => {
      if (seen.has(v.persnum)) return false;
      seen.add(v.persnum);
      return true;
    });

    // 4. Sort by BOD tag order, reassign urutan
    return merged
      .sort((a, b) => a._order - b._order)
      .map((v, index) => {
        const { _order, ...rest } = v;
        return { ...rest, urutan: index + 1 };
      });
  }

  // ── CREATE: Buat usulan baru ───────────────────────────────────

  async create(
    dto: CreateUsulanAksesBerkasDto,
    user: any,
  ): Promise<UsulanAksesBerkasEntity> {
    const userOrgId = Number(user.organization);
    const userPersnum = Number(user.persnum);

    // Validasi: hanya Sekretaris yang didelegasikan (position_status = SE) yang
    // dapat membuat usulan peminjaman berkas. Tidak ada pengecualian — bahkan
    // SUPERADMIN tidak bisa membuat usulan (hanya SE yang didelegasikan).
    const positionStatus = user.position_status as string | undefined;
    if (positionStatus !== PositionStatus.SE) {
      throw new ForbiddenException(
        'Hanya Sekretaris yang didelegasikan yang dapat membuat usulan peminjaman berkas.',
      );
    }

    // Validasi: jika AKTIF, divisiPemberiId wajib
    let divisiPemberiId: number;
    if (dto.jenisBerkas === JenisBerkas.INAKTIF) {
      // Otomatis set ke Corporate Secretary Division
      divisiPemberiId = CORPORATE_SECRETARY_ORG_ID;
    } else {
      if (!dto.divisiPemberiId) {
        throw new BadRequestException(
          'divisiPemberiId wajib diisi untuk jenisBerkas AKTIF',
        );
      }
      divisiPemberiId = Number(dto.divisiPemberiId);
    }

    // Validasi: divisi pemberi tidak boleh sama dengan divisi pengusul
    if (divisiPemberiId === userOrgId) {
      throw new BadRequestException(
        'Divisi pemberi tidak boleh sama dengan divisi pengusul',
      );
    }

    // Validasi: verifikator harus dari divisi yang sama dengan pengusul (BOD tags)
    const bodInDivisi = await this.getVerifikatorBod(userOrgId);
    const validPersnums = new Set(bodInDivisi.map((m) => m.persnum));
    for (const v of dto.verifikatorPengusul) {
      if (!validPersnums.has(v.persnum)) {
        throw new BadRequestException(
          `Verifikator persnum ${v.persnum} tidak ada di divisi Anda atau bukan BOD`,
        );
      }
    }

    // Auto-sort verifikator bottom-to-top (BOD-3 → BOD-2 → BOD-1 → BOD)
    const sortedVerifikator = this.sortVerifikator(
      dto.verifikatorPengusul.map((v) => ({
        persnum: v.persnum,
        levelJabatan: v.levelJabatan as LevelJabatan,
      })),
    );

    const nomorUsulan = await this.generateNomorUsulan();

    const usulan = this.usulanRepo.create({
      nomorUsulan,
      jenisBerkas: dto.jenisBerkas,
      pengusulPersnum: userPersnum,
      divisiPengusulId: userOrgId,
      divisiPemberiId,
      tujuanAkses: dto.tujuanAkses,
      durasiAkses: dto.durasiAkses,
      customTanggalSelesai: dto.customTanggalSelesai ? new Date(dto.customTanggalSelesai) : null,
      jenisAkses: dto.jenisAkses as string[],
      penerimaAksesTambahan: dto.penerimaAksesTambahan || [],
      suratUsulanFileId: dto.suratUsulanFileId ?? null,
      verifikatorPengusul: sortedVerifikator,
      status: StatusUsulan.MENUNGGU_VERIFIKASI_PENGUSUL,
    }) as UsulanAksesBerkasEntity;

    const saved = await this.usulanRepo.save(usulan);
    this.logger.log(`Usulan created: ${saved.nomorUsulan} by persnum=${userPersnum}`);
    return saved;
  }

  // ── READ: List usulan ─────────────────────────────────────────

  async findAll(user: any, params?: any): Promise<any> {
    const { status, page = 1, limit = 20, scope, search, sortBy, sortDir } = params || {};
    const userPersnum = Number(user.persnum);
    const userOrgId = Number(user.organization);

    const qb = this.usulanRepo.createQueryBuilder('u');

    // Scope filter:
    // - 'mine': hanya usulan yang user buat (SE pengusul)
    // - 'verify-pemberi': hanya usulan yang masuk ke divisinya sebagai pemberi (SE pemberi)
    // - 'verify-me': hanya usulan yang dia jadi verifikator (managerial)
    // - default: semua usulan yang user bisa lihat (pengusul + pemberi + verifikator)
    if (scope === 'mine') {
      qb.where('u.pengusulPersnum = :userPersnum', { userPersnum });
    } else if (scope === 'verify-pemberi') {
      qb.where('u.divisiPemberiId = :userOrgId', { userOrgId });
    } else if (scope === 'verify-me') {
      qb.where(
        '(JSON_CONTAINS(u.verifikatorPengusul, JSON_OBJECT(\'persnum\', :userPersnum)) OR JSON_CONTAINS(u.verifikatorPemberi, JSON_OBJECT(\'persnum\', :userPersnum)))',
        { userPersnum },
      );
    } else {
      // Default: semua usulan yang user bisa lihat
      qb.where(
        '(u.pengusulPersnum = :userPersnum OR u.divisiPemberiId = :userOrgId OR JSON_CONTAINS(u.verifikatorPengusul, JSON_OBJECT(\'persnum\', :userPersnum)) OR JSON_CONTAINS(u.verifikatorPemberi, JSON_OBJECT(\'persnum\', :userPersnum)))',
        { userPersnum, userOrgId },
      );
    }

    if (status) {
      qb.andWhere('u.status = :status', { status });
    }

    // Search: cari di nomorUsulan, tujuanAkses, jenisBerkas
    if (search) {
      qb.andWhere(
        '(u.nomorUsulan LIKE :search OR u.tujuanAkses LIKE :search OR u.jenisBerkas LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Sort
    const allowedSortFields = ['nomorUsulan', 'jenisBerkas', 'tujuanAkses', 'durasiAkses', 'status', 'createdAt', 'updatedAt'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'updatedAt';
    const sortDirection = sortDir === 'asc' ? 'ASC' : 'DESC';
    qb.orderBy(`u.${sortField}`, sortDirection);

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // ── Enrich: tambah divisiPemberiNama & EVP pemberi nama ──
    if (data.length > 0) {
      const orgData = await this.orgDataService.findLatestOrg();
      if (orgData?.position_json) {
        const positionJson =
          typeof orgData.position_json === 'string'
            ? JSON.parse(orgData.position_json)
            : orgData.position_json;

        if (Array.isArray(positionJson)) {
          for (const usulan of data) {
            // Nama divisi pemberi
            const divisiPemberi = positionJson.find(
              (p: any) => Number(p.organization_id) === Number(usulan.divisiPemberiId),
            );
            (usulan as any).divisiPemberiNama = divisiPemberi?.organization_text || null;

            // Nama EVP pemberi (chief=1 di divisi pemberi, level EVP)
            const evpPemberi = positionJson.find(
              (p: any) =>
                Number(p.organization_id) === Number(usulan.divisiPemberiId) &&
                p.chief === 1 &&
                (p.position_text || '').toUpperCase().includes('EVP'),
            );
            (usulan as any).evpPemberiNama = evpPemberi?.persnum_person_text || null;

            // Nama divisi pengusul
            const divisiPengusul = positionJson.find(
              (p: any) => Number(p.organization_id) === Number(usulan.divisiPengusulId),
            );
            (usulan as any).divisiPengusulNama = divisiPengusul?.organization_text || null;
          }
        }
      }
    }

    return { data, total, page: Number(page), limit: Number(limit) };
  }

  // ── READ: Detail usulan ───────────────────────────────────────

  /**
   * Actor-based access control: hanya user yang terlibat dalam usulan
   * (pengusul, SE pemberi, atau verifikator) yang dapat melihat detail.
   */
  async findOne(id: string, user: any): Promise<any> {
    const usulan = await this.usulanRepo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    // ── Actor-based check: user harus terlibat dalam usulan ──
    const userPersnum = Number(user.persnum);
    const userOrgId = Number(user.organization);
    const isPengusul = Number(usulan.pengusulPersnum) === userPersnum;
    const isPemberiDivisi = Number(usulan.divisiPemberiId) === userOrgId;
    const isVerifikatorPengusul = (usulan.verifikatorPengusul || []).some(
      (v: any) => Number(v.persnum) === userPersnum,
    );
    const isVerifikatorPemberi = (usulan.verifikatorPemberi || []).some(
      (v: any) => Number(v.persnum) === userPersnum,
    );
    if (!isPengusul && !isPemberiDivisi && !isVerifikatorPengusul && !isVerifikatorPemberi) {
      throw new ForbiddenException('Anda tidak terlibat dalam usulan ini');
    }

    const steps = await this.stepRepo.find({
      where: { usulanId: id },
      order: { verifiedAt: 'ASC' },
    });

    const selectedBerkas = await this.usulanBerkasRepo.find({
      where: { usulanId: id },
    });

    // ── Enrich selectedBerkas dengan judulBerkas, kodeBerkas, klasifikasiTeks ──
    let enrichedSelectedBerkas: any[] = [];
    if (selectedBerkas.length > 0) {
      const berkasIds = selectedBerkas.map((b) => b.berkasId);
      const berkasRecords = await this.berkasRepo.find({
        where: { id: In(berkasIds) },
        select: ['id', 'judulBerkas', 'kodeBerkas', 'klasifikasiTeks', 'status'] as any,
      });
      const berkasMap = new Map(berkasRecords.map((b) => [b.id, b]));
      enrichedSelectedBerkas = selectedBerkas.map((ub) => {
        const b = berkasMap.get(ub.berkasId);
        return {
          ...ub,
          judulBerkas: b?.judulBerkas || null,
          kodeBerkas: b?.kodeBerkas || null,
          klasifikasiTeks: b?.klasifikasiTeks || null,
          berkasStatus: b?.status || null,
        };
      });
    }

    // ── Enrich: tambah nama & posisi untuk pengusul, divisi, verifikator ──
    const orgData = await this.orgDataService.findLatestOrg();
    let pengusulInfo: any = null;
    let divisiPengusulNama: string | null = null;
    let divisiPemberiNama: string | null = null;

    if (orgData?.position_json) {
      const positionJson =
        typeof orgData.position_json === 'string'
          ? JSON.parse(orgData.position_json)
          : orgData.position_json;

      if (Array.isArray(positionJson)) {
        // Cari info pengusul
        const pengusulPos = positionJson.find(
          (p: any) => Number(p.persnum_person) === Number(usulan.pengusulPersnum),
        );
        if (pengusulPos) {
          pengusulInfo = {
            nama: pengusulPos.persnum_person_text,
            jabatan: pengusulPos.position_text,
            organization: pengusulPos.organization_id,
            organizationText: pengusulPos.organization_text,
          };
        }

        // Cari nama divisi pengusul & pemberi
        const divisiPengusul = positionJson.find(
          (p: any) => Number(p.organization_id) === Number(usulan.divisiPengusulId),
        );
        if (divisiPengusul) {
          divisiPengusulNama = divisiPengusul.organization_text;
        }

        const divisiPemberi = positionJson.find(
          (p: any) => Number(p.organization_id) === Number(usulan.divisiPemberiId),
        );
        if (divisiPemberi) {
          divisiPemberiNama = divisiPemberi.organization_text;
        }
      }
    }

    // Enrich verifikator pengusul dengan nama & jabatan
    const enrichedVerifikatorPengusul = (usulan.verifikatorPengusul || []).map((v: any) => {
      if (orgData?.position_json) {
        const positionJson =
          typeof orgData.position_json === 'string'
            ? JSON.parse(orgData.position_json)
            : orgData.position_json;
        if (Array.isArray(positionJson)) {
          const person = positionJson.find(
            (p: any) => Number(p.persnum_person) === Number(v.persnum),
          );
          if (person) {
            return {
              ...v,
              nama: person.persnum_person_text,
              jabatan: person.position_text,
              divisiNama: person.organization_text,
            };
          }
        }
      }
      return v;
    });

    // Enrich verifikator pemberi dengan nama & jabatan
    const enrichedVerifikatorPemberi = (usulan.verifikatorPemberi || []).map((v: any) => {
      if (orgData?.position_json) {
        const positionJson =
          typeof orgData.position_json === 'string'
            ? JSON.parse(orgData.position_json)
            : orgData.position_json;
        if (Array.isArray(positionJson)) {
          const person = positionJson.find(
            (p: any) => Number(p.persnum_person) === Number(v.persnum),
          );
          if (person) {
            return {
              ...v,
              nama: person.persnum_person_text,
              jabatan: person.position_text,
              divisiNama: person.organization_text,
            };
          }
        }
      }
      return v;
    });

    // Enrich steps dengan nama verifier
    const enrichedSteps = steps.map((step: any) => {
      if (orgData?.position_json) {
        const positionJson =
          typeof orgData.position_json === 'string'
            ? JSON.parse(orgData.position_json)
            : orgData.position_json;
        if (Array.isArray(positionJson)) {
          const person = positionJson.find(
            (p: any) => Number(p.persnum_person) === Number(step.verifierPersnum),
          );
          if (person) {
            return {
              ...step,
              verifierNama: person.persnum_person_text,
              verifierJabatan: person.position_text,
            };
          }
        }
      }
      return step;
    });

    return {
      ...usulan,
      steps: enrichedSteps,
      selectedBerkas: enrichedSelectedBerkas,
      pengusulInfo,
      divisiPengusulNama,
      divisiPemberiNama,
      verifikatorPengusul: enrichedVerifikatorPengusul,
      verifikatorPemberi: enrichedVerifikatorPemberi,
    };
  }

  // ── Verifikasi Pengusul (AVP/VP/EVP) ──────────────────────────

  async verifikasiPengusul(
    id: string,
    dto: VerifikasiPengusulDto,
    user: any,
    jenjang: 1 | 2 | 3,
  ): Promise<UsulanAksesBerkasEntity> {
    const usulan = await this.usulanRepo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    const userPersnum = Number(user.persnum);

    // Cek apakah user adalah verifikator di jenjang ini
    const verifikator = usulan.verifikatorPengusul.find(
      (v) => v.urutan === jenjang,
    );
    if (!verifikator || verifikator.persnum !== userPersnum) {
      throw new ForbiddenException(
        'Anda bukan verifikator untuk jenjang ini',
      );
    }

    // Validasi status
    const expectedStatusMap: Record<number, StatusUsulan> = {
      1: StatusUsulan.MENUNGGU_VERIFIKASI_PENGUSUL,
      2: StatusUsulan.MENUNGGU_VERIFIKASI_AKHIR_PENGUSUL,
      3: StatusUsulan.MENUNGGU_VERIFIKASI_EVP_PENGUSUL,
    };
    if (usulan.status !== expectedStatusMap[jenjang]) {
      throw new BadRequestException(
        `Status usulan tidak valid untuk verifikasi jenjang ${jenjang}`,
      );
    }

    // Validasi: catatanRevisi wajib (min 5 char) jika REVISI
    if (dto.keputusan === Keputusan.REVISI && (!dto.catatanRevisi?.trim() || dto.catatanRevisi.trim().length < 5)) {
      throw new BadRequestException(
        'catatanRevisi wajib diisi (minimal 5 karakter) untuk keputusan REVISI',
      );
    }

    // Simpan verification step (checklist dihapus — cukup keputusan + catatan)
    const step = this.stepRepo.create({
      usulanId: id,
      verifierPersnum: userPersnum,
      roleTahap: `VERIFIKATOR_PENGUSUL_J${jenjang}`,
      urutanJenjang: jenjang,
      keputusan: dto.keputusan,
      catatan: dto.catatan || null,
      catatanRevisi: dto.catatanRevisi || null,
      checklist: {},
    } as any);
    await this.stepRepo.save(step);

    // Tentukan next status
    const totalJenjang = usulan.verifikatorPengusul.length;

    if (dto.keputusan === Keputusan.TOLAK) {
      usulan.status = StatusUsulan.DITOLAK_PENGUSUL;
    } else if (dto.keputusan === Keputusan.REVISI) {
      usulan.status = StatusUsulan.REVISI_PENGUSUL;
      usulan.catatanRevisiPengusul = dto.catatanRevisi || null;
    } else if (dto.keputusan === Keputusan.SETUJU) {
      // Jika ada jenjang berikutnya
      if (jenjang < totalJenjang) {
        const nextStatusMap: Record<number, StatusUsulan> = {
          1: StatusUsulan.MENUNGGU_VERIFIKASI_AKHIR_PENGUSUL,
          2: StatusUsulan.MENUNGGU_VERIFIKASI_EVP_PENGUSUL,
        };
        usulan.status = nextStatusMap[jenjang];
      } else {
        // Jenjang terakhir → kirim ke pemberi
        usulan.status = StatusUsulan.TERKIRIM_KE_PEMBERI;
      }
    }

    const saved = await this.usulanRepo.save(usulan);
    this.logger.log(
      `Verifikasi pengusul jenjang ${jenjang}: ${dto.keputusan} by persnum=${userPersnum}`,
    );
    return saved;
  }

  // ── Verifikasi Pemberi (Sekretaris Pemberi) ───────────────────

  async verifikasiPemberi(
    id: string,
    dto: VerifikasiPemberiDto,
    user: any,
  ): Promise<UsulanAksesBerkasEntity> {
    const usulan = await this.usulanRepo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    const userOrgId = Number(user.organization);

    // Cek apakah user adalah Sekretaris di divisi pemberi
    if (usulan.divisiPemberiId !== userOrgId) {
      throw new ForbiddenException(
        'Anda bukan Sekretaris di divisi pemberi',
      );
    }

    if (usulan.status !== StatusUsulan.TERKIRIM_KE_PEMBERI) {
      throw new BadRequestException(
        'Status usulan tidak valid untuk verifikasi pemberi',
      );
    }

    // Validasi: catatanPerubahanDurasi opsional — jika durasi berubah dan tidak diisi,
    // pakai catatan umum sebagai fallback.
    const catatanDurasi =
      dto.catatanPerubahanDurasi?.trim() || dto.catatan?.trim() || null;

    // Simpan step (checklist dihapus — cukup keputusan + catatan + durasi)
    const step = this.stepRepo.create();
    step.usulanId = id;
    step.verifierPersnum = Number(user.persnum);
    step.roleTahap = 'SEKRETARIS_PEMBERI';
    step.urutanJenjang = 0; // sekretaris bukan jenjang managerial
    step.keputusan = dto.keputusan;
    step.catatan = dto.catatan || null;
    step.checklist = {};
    await this.stepRepo.save(step);

    if (dto.keputusan === Keputusan.TOLAK) {
      usulan.status = StatusUsulan.DITOLAK_PEMBERI;
    } else if (dto.keputusan === Keputusan.LANJUT) {
      usulan.status = StatusUsulan.PEMILIHAN_BERKAS;
      if (dto.durasiAksesDisetujui) {
        usulan.durasiAksesDisetujui = dto.durasiAksesDisetujui;
      }
      usulan.catatanPerubahanDurasi = catatanDurasi;
    }

    const saved = await this.usulanRepo.save(usulan);
    this.logger.log(
      `Verifikasi pemberi: ${dto.keputusan} by persnum=${user.persnum}`,
    );
    return saved;
  }

  // ── Pilih Berkas (Sekretaris Pemberi) ──────────────────────────

  async pilihBerkas(
    id: string,
    dto: PilihBerkasDto,
    user: any,
  ): Promise<UsulanAksesBerkasEntity> {
    const usulan = await this.usulanRepo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    const userOrgId = Number(user.organization);
    if (usulan.divisiPemberiId !== userOrgId) {
      throw new ForbiddenException('Anda bukan Sekretaris di divisi pemberi');
    }

    if (usulan.status !== StatusUsulan.PEMILIHAN_BERKAS) {
      throw new BadRequestException('Status tidak valid untuk pemilihan berkas');
    }

    // Validasi: berkas harus milik divisi pemberi dan berstatus closed_retensi_aktif
    const berkasList = await this.berkasRepo.find({
      where: { id: In(dto.berkasIds) },
    });
    if (berkasList.length !== dto.berkasIds.length) {
      const foundIds = new Set(berkasList.map((b) => b.id));
      const missing = dto.berkasIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Berkas tidak ditemukan: ${missing.join(', ')}`,
      );
    }
    for (const b of berkasList) {
      if (b.status !== StatusBerkas.CLOSED_RETENSI_AKTIF) {
        throw new BadRequestException(
          `Berkas "${b.judulBerkas}" tidak dapat dipilih karena statusnya "${b.status}". Hanya berkas berstatus "closed_retensi_aktif" yang boleh dipinjamkan.`,
        );
      }
      // TODO: validasi kepemilikan lebih ketat setelah ada kolom divisi_id di berkas
    }

    // Hapus berkas lama jika ada (revisi case)
    await this.usulanBerkasRepo.delete({ usulanId: id });

    // Simpan berkas baru
    const usulanBerkasItems = dto.berkasIds.map((berkasId) =>
      this.usulanBerkasRepo.create({
        usulanId: id,
        berkasId,
        jenisAksesGranted: usulan.jenisAkses,
        berlakuHingga: new Date(), // akan di-update saat akses diterbitkan
      }),
    );
    await this.usulanBerkasRepo.save(usulanBerkasItems);

    // Auto-sort verifikator pemberi
    const sortedVerifikatorPemberi = this.sortVerifikator(
      dto.verifikatorPemberi.map((v) => ({
        persnum: v.persnum,
        levelJabatan: v.levelJabatan as LevelJabatan,
      })),
    );

    // Validasi: verifikator pemberi harus dari divisi pemberi (BOD tags)
    const bodPemberi = await this.getVerifikatorBod(usulan.divisiPemberiId);
    const validPersnumsPemberi = new Set(bodPemberi.map((m) => m.persnum));
    for (const v of sortedVerifikatorPemberi) {
      if (!validPersnumsPemberi.has(v.persnum)) {
        throw new BadRequestException(
          `Verifikator pemberi persnum ${v.persnum} tidak ada di divisi pemberi`,
        );
      }
    }

    usulan.verifikatorPemberi = sortedVerifikatorPemberi;
    usulan.status = StatusUsulan.MENUNGGU_PERSETUJUAN_PEMBERI;

    const saved = await this.usulanRepo.save(usulan);
    this.logger.log(`Pilih berkas: ${dto.berkasIds.length} berkas by persnum=${user.persnum}`);
    return saved;
  }

  // ── Persetujuan Pemberi (AVP/VP/EVP) ───────────────────────────

  async persetujuanPemberi(
    id: string,
    dto: PersetujuanPemberiDto,
    user: any,
    jenjang: 1 | 2 | 3,
  ): Promise<UsulanAksesBerkasEntity> {
    const usulan = await this.usulanRepo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    const userPersnum = Number(user.persnum);

    // Cek apakah user adalah verifikator pemberi di jenjang ini
    if (!usulan.verifikatorPemberi) {
      throw new BadRequestException('Verifikator pemberi belum dipilih');
    }
    const verifikator = usulan.verifikatorPemberi.find(
      (v) => v.urutan === jenjang,
    );
    if (!verifikator || verifikator.persnum !== userPersnum) {
      throw new ForbiddenException(
        'Anda bukan verifikator pemberi untuk jenjang ini',
      );
    }

    // Validasi status
    const expectedStatusMap: Record<number, StatusUsulan> = {
      1: StatusUsulan.MENUNGGU_PERSETUJUAN_PEMBERI,
      2: StatusUsulan.MENUNGGU_PERSETUJUAN_AKHIR_PEMBERI,
      3: StatusUsulan.MENUNGGU_PERSETUJUAN_EVP_PEMBERI,
    };
    if (usulan.status !== expectedStatusMap[jenjang]) {
      throw new BadRequestException(
        `Status usulan tidak valid untuk persetujuan jenjang ${jenjang}`,
      );
    }

    if (dto.keputusan === Keputusan.REVISI && (!dto.catatanRevisi?.trim() || dto.catatanRevisi.trim().length < 5)) {
      throw new BadRequestException(
        'catatanRevisi wajib diisi (minimal 5 karakter) untuk keputusan REVISI',
      );
    }

    // catatanPerubahanDurasi opsional — fallback ke catatan umum
    const catatanDurasiPemberi =
      dto.catatanPerubahanDurasi?.trim() || dto.catatan?.trim() || null;

    // Simpan step (checklist dihapus — cukup keputusan + catatan + durasi)
    const step = this.stepRepo.create();
    step.usulanId = id;
    step.verifierPersnum = userPersnum;
    step.roleTahap = `VERIFIKATOR_PEMBERI_J${jenjang}`;
    step.urutanJenjang = jenjang;
    step.keputusan = dto.keputusan;
    step.catatan = dto.catatan || null;
    step.catatanRevisi = dto.catatanRevisi || null;
    step.checklist = {};
    await this.stepRepo.save(step);

    // Apply durasi adjustment dari verifikator berjenjang
    if (dto.durasiAksesDisetujui) {
      usulan.durasiAksesDisetujui = dto.durasiAksesDisetujui;
      usulan.catatanPerubahanDurasi = catatanDurasiPemberi || usulan.catatanPerubahanDurasi || null;
    }

    const totalJenjang = usulan.verifikatorPemberi.length;

    if (dto.keputusan === Keputusan.TOLAK) {
      usulan.status = StatusUsulan.DITOLAK_PEMBERI;
    } else if (dto.keputusan === Keputusan.REVISI) {
      usulan.status = StatusUsulan.REVISI_PEMBERI;
      usulan.catatanRevisiPemberi = dto.catatanRevisi || null;
    } else if (dto.keputusan === Keputusan.SETUJU) {
      if (jenjang < totalJenjang) {
        const nextStatusMap: Record<number, StatusUsulan> = {
          1: StatusUsulan.MENUNGGU_PERSETUJUAN_AKHIR_PEMBERI,
          2: StatusUsulan.MENUNGGU_PERSETUJUAN_EVP_PEMBERI,
        };
        usulan.status = nextStatusMap[jenjang];
      } else {
        // Jenjang terakhir → terbitkan akses
        await this.terbitkanAkses(usulan);
      }
    }

    const saved = await this.usulanRepo.save(usulan);
    this.logger.log(
      `Persetujuan pemberi jenjang ${jenjang}: ${dto.keputusan} by persnum=${userPersnum}`,
    );
    return saved;
  }

  // ── Terbitkan Akses (internal, dipanggil saat approval terakhir) ──

  private async terbitkanAkses(usulan: UsulanAksesBerkasEntity): Promise<void> {
    const tanggalMulai = new Date();
    let tanggalSelesai: Date;

    if (
      usulan.durasiAksesDisetujui === DurasiPreset.CUSTOM &&
      usulan.customTanggalSelesai
    ) {
      // Custom: pakai tanggal selesai yang dipilih pengusul
      tanggalSelesai = new Date(usulan.customTanggalSelesai);
    } else {
      const durasiHari =
        usulan.durasiAksesDisetujui &&
        usulan.durasiAksesDisetujui !== DurasiPreset.CUSTOM
          ? DURASI_PRESET_HARI[usulan.durasiAksesDisetujui]
          : 365; // default 1 tahun
      tanggalSelesai = new Date(tanggalMulai);
      tanggalSelesai.setDate(tanggalSelesai.getDate() + durasiHari);
    }

    usulan.tanggalMulai = tanggalMulai;
    usulan.tanggalSelesai = tanggalSelesai;
    usulan.status = StatusUsulan.AKSES_DITERBITKAN;

    // Ambil berkas yang dipilih
    const usulanBerkas = await this.usulanBerkasRepo.find({
      where: { usulanId: usulan.id },
    });

    // Buat entitlement untuk Sekretaris Pengusul (wajib)
    const entitlements: AksesBerkasEntity[] = [];

    for (const ub of usulanBerkas) {
      // Sekretaris Pengusul
      entitlements.push(
        this.aksesRepo.create({
          usulanId: usulan.id,
          userPersnum: usulan.pengusulPersnum,
          berkasId: ub.berkasId,
          permissions: ub.jenisAksesGranted,
          tanggalMulai,
          tanggalSelesai,
          isRevoked: false,
          isPenerimaTambahan: false,
        }),
      );

      // Penerima akses tambahan
      if (usulan.penerimaAksesTambahan?.length) {
        for (const persnum of usulan.penerimaAksesTambahan) {
          entitlements.push(
            this.aksesRepo.create({
              usulanId: usulan.id,
              userPersnum: persnum,
              berkasId: ub.berkasId,
              permissions: ub.jenisAksesGranted,
              tanggalMulai,
              tanggalSelesai,
              isRevoked: false,
              isPenerimaTambahan: true,
            }),
          );
        }
      }

      // Update berlakuHingga di usulan_berkas
      ub.berlakuHingga = tanggalSelesai;
      await this.usulanBerkasRepo.save(ub);
    }

    await this.aksesRepo.save(entitlements);
    this.logger.log(
      `Akses diterbitkan: ${usulan.nomorUsulan}, ${entitlements.length} entitlements`,
    );
  }

  // ── Get Trail (audit trail) ───────────────────────────────────

  async getTrail(id: string, user: any): Promise<VerificationStepEntity[]> {
    // Actor-based: verifikasi user terlibat sebelum return trail
    const usulan = await this.usulanRepo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    const userPersnum = Number(user.persnum);
    const userOrgId = Number(user.organization);
    const isPengusul = Number(usulan.pengusulPersnum) === userPersnum;
    const isPemberiDivisi = Number(usulan.divisiPemberiId) === userOrgId;
    const isVerifikatorPengusul = (usulan.verifikatorPengusul || []).some(
      (v: any) => Number(v.persnum) === userPersnum,
    );
    const isVerifikatorPemberi = (usulan.verifikatorPemberi || []).some(
      (v: any) => Number(v.persnum) === userPersnum,
    );
    if (!isPengusul && !isPemberiDivisi && !isVerifikatorPengusul && !isVerifikatorPemberi) {
      throw new ForbiddenException('Anda tidak terlibat dalam usulan ini');
    }

    return this.stepRepo.find({
      where: { usulanId: id },
      order: { verifiedAt: 'ASC' },
    });
  }

  // ── My Entitlements (akses berkas yang sudah diterbitkan) ─────

  /**
   * List entitlement untuk user yang login.
   * Hanya yang belum revoked dan belum kadaluarsa.
   * Enrich dengan judulBerkas dari tabel berkas + nomorUsulan dari tabel usulan.
   * Di-group by berkasId (distinct berkas), dengan info usulan terbaru.
   */
  async getMyEntitlements(user: any): Promise<any[]> {
    const userPersnum = Number(user.persnum);
    const now = new Date();

    // Ambil entitlements yang belum revoked
    const entitlements = await this.aksesRepo.find({
      where: { userPersnum, isRevoked: false },
      order: { createdAt: 'DESC' },
    });

    if (entitlements.length === 0) return [];

    // Ambil info berkas
    const berkasIds = [...new Set(entitlements.map((e) => e.berkasId))];
    const berkasList = await this.berkasRepo.find({
      where: { id: In(berkasIds) },
    });
    const berkasMap = new Map(berkasList.map((b) => [b.id, b]));

    // Ambil info usulan (nomorUsulan, tujuanAkses, jenisBerkas)
    const usulanIds = [...new Set(entitlements.map((e) => e.usulanId))];
    const usulanList = await this.usulanRepo.find({
      where: { id: In(usulanIds) },
    });
    const usulanMap = new Map(usulanList.map((u) => [u.id, u]));

    // Group by berkasId — gabungkan entitlements untuk berkas yang sama
    const berkasGroups = new Map<string, any>();
    for (const e of entitlements) {
      const existing = berkasGroups.get(e.berkasId);
      const isExpired = e.tanggalSelesai && new Date(e.tanggalSelesai) < now;
      if (!existing) {
        const berkas = berkasMap.get(e.berkasId);
        const usulan = usulanMap.get(e.usulanId);
        berkasGroups.set(e.berkasId, {
          berkasId: e.berkasId,
          judulBerkas: berkas?.judulBerkas || '(Berkas tidak ditemukan)',
          klasifikasi: berkas?.klasifikasi || null,
          klasifikasiTeks: berkas?.klasifikasiTeks || null,
          lokasi: berkas?.lokasi || null,
          // Gabungkan permissions dari semua entitlement untuk berkas ini
          permissions: [...new Set([...(e.permissions || [])])],
          // Ambil tanggalMulai terbaru dan tanggalSelesai terlama
          tanggalMulai: e.tanggalMulai,
          tanggalSelesai: e.tanggalSelesai,
          isExpired,
          // Info usulan terbaru
          usulanIds: [e.usulanId],
          nomorUsulanTerbaru: usulan?.nomorUsulan || null,
          isPenerimaTambahan: e.isPenerimaTambahan,
          entitlementCount: 1,
        });
      } else {
        // Merge permissions
        existing.permissions = [...new Set([...existing.permissions, ...(e.permissions || [])])];
        // Ambil tanggalMulai terbaru
        if (new Date(e.tanggalMulai) > new Date(existing.tanggalMulai)) {
          existing.tanggalMulai = e.tanggalMulai;
          // Update nomorUsulanTerbaru ke usulan dengan tanggalMulai terbaru
          const usulanFromMap = usulanMap.get(e.usulanId);
          if (usulanFromMap?.nomorUsulan) existing.nomorUsulanTerbaru = usulanFromMap.nomorUsulan;
        }
        // Ambil tanggalSelesai terlama (yang masih aktif)
        if (new Date(e.tanggalSelesai) < new Date(existing.tanggalSelesai)) {
          existing.tanggalSelesai = e.tanggalSelesai;
        }
        // Update isExpired — kalau ada satu yang aktif, berkas ini aktif
        if (!isExpired) {
          existing.isExpired = false;
        }
        // Tambah usulan
        if (!existing.usulanIds.includes(e.usulanId)) {
          existing.usulanIds.push(e.usulanId);
        }
        existing.entitlementCount++;
      }
    }

    return Array.from(berkasGroups.values());
  }

  /**
   * Detail naskah untuk SE pengusul yang punya entitlement.
   * Cek: naskah ini ada di berkas yang user punya entitlement-nya.
   */
  async getNaskahDetailForEntitlement(naskahId: string, user: any): Promise<any> {
    const userPersnum = Number(user.persnum);

    // Cari berkas_naskah yang berisi naskah ini
    const berkasNaskahRows = await this.dataSource.query(
      `SELECT berkas_id FROM berkas_naskah WHERE naskah_id = ?`,
      [naskahId],
    );

    if (!berkasNaskahRows || berkasNaskahRows.length === 0) {
      throw new NotFoundException('Naskah tidak ditemukan di berkas manapun');
    }

    // Cek apakah user punya entitlement untuk salah satu berkas ini
    const berkasIds = berkasNaskahRows.map((bn: any) => bn.berkas_id);
    const entitlement = await this.aksesRepo.findOne({
      where: {
        userPersnum,
        berkasId: In(berkasIds),
        isRevoked: false,
      },
    });

    if (!entitlement) {
      throw new ForbiddenException('Anda tidak memiliki akses ke naskah ini');
    }

    // Ambil detail naskah
    const naskahRows = await this.dataSource.query(
      `SELECT * FROM naskah WHERE id = ?`,
      [naskahId],
    );

    if (!naskahRows || naskahRows.length === 0) {
      throw new NotFoundException('Naskah tidak ditemukan');
    }

    const naskah = naskahRows[0] as any;
    return {
      ...naskah,
      permissions: entitlement.permissions,
    };
  }

  // ── Detail Berkas untuk Pemberian (cek entitlement) ───────────

  /**
   * Detail berkas untuk SE pengusul yang punya entitlement.
   * Cek: user punya entitlement untuk berkas ini.
   */
  async getBerkasDetailForEntitlement(berkasId: string, user: any): Promise<any> {
    const userPersnum = Number(user.persnum);

    // Cek entitlement
    const entitlement = await this.aksesRepo.findOne({
      where: { userPersnum, berkasId, isRevoked: false },
    });
    if (!entitlement) {
      throw new ForbiddenException('Anda tidak memiliki akses ke berkas ini');
    }

    // Ambil detail berkas
    const berkas = await this.berkasRepo.findOne({ where: { id: berkasId } });
    if (!berkas) {
      throw new NotFoundException('Berkas tidak ditemukan');
    }

    // Ambil info usulan (untuk nomorUsulan, divisiPemberi, dll)
    const usulan = await this.usulanRepo.findOne({ where: { id: entitlement.usulanId } });

    // Ambil nama divisi pemberi dari org_data
    let divisiPemberiNama: string | null = null;
    let evpPemberiNama: string | null = null;
    const orgData = await this.orgDataService.findLatestOrg();
    if (orgData?.position_json) {
      const positionJson =
        typeof orgData.position_json === 'string'
          ? JSON.parse(orgData.position_json)
          : orgData.position_json;
      if (Array.isArray(positionJson)) {
        const divisi = positionJson.find(
          (p: any) => Number(p.organization_id) === Number(usulan?.divisiPemberiId),
        );
        divisiPemberiNama = divisi?.organization_text || null;

        const evp = positionJson.find(
          (p: any) =>
            Number(p.organization_id) === Number(usulan?.divisiPemberiId) &&
            p.chief === 1 &&
            (p.position_text || '').toUpperCase().includes('EVP'),
        );
        evpPemberiNama = evp?.persnum_person_text || null;
      }
    }

    return {
      ...berkas,
      permissions: entitlement.permissions,
      tanggalMulai: entitlement.tanggalMulai,
      tanggalSelesai: entitlement.tanggalSelesai,
      usulanId: entitlement.usulanId,
      nomorUsulan: usulan?.nomorUsulan || null,
      divisiPemberiId: usulan?.divisiPemberiId || null,
      divisiPemberiNama,
      evpPemberiNama,
      tujuanAkses: usulan?.tujuanAkses || null,
    };
  }

  // ── Naskah by Berkas (untuk Pemberian — lihat naskah di dalam berkas) ──

  /**
   * List naskah di dalam berkas tertentu.
   * Cek entitlement user untuk berkas ini sebelum return.
   */
  async getNaskahByBerkas(berkasId: string, user: any): Promise<any[]> {
    const userPersnum = Number(user.persnum);

    // Cek apakah user punya entitlement untuk berkas ini
    const entitlement = await this.aksesRepo.findOne({
      where: { userPersnum, berkasId, isRevoked: false },
    });
    if (!entitlement) {
      throw new ForbiddenException('Anda tidak memiliki akses ke berkas ini');
    }

    // Ambil naskah dari berkas_naskah via raw query (lebih reliable)
    const berkasNaskahRows = await this.dataSource.query(
      `SELECT bn.id, bn.berkas_id, bn.naskah_id, bn.naskah_tipe, bn.sumber,
              bn.perihal, bn.nomor_surat, bn.tanggal_naskah, bn.urutan
       FROM berkas_naskah bn
       WHERE bn.berkas_id = ?
       ORDER BY bn.urutan ASC, bn.created_at DESC`,
      [berkasId],
    );

    if (!berkasNaskahRows || berkasNaskahRows.length === 0) return [];

    // Ambil info naskah dari tabel naskah via raw query
    const naskahIds = berkasNaskahRows.map((bn: any) => bn.naskah_id);
    const naskahRows = await this.dataSource.query(
      `SELECT id, jenis, sifat, perihal, nomor, tanggal, final_pdf, status
       FROM naskah
       WHERE id IN (?)`,
      [naskahIds],
    );

    const naskahMap = new Map<string, any>(naskahRows.map((n: any) => [n.id, n]));

    // Gabungkan
    return berkasNaskahRows.map((bn: any) => {
      const naskah = naskahMap.get(bn.naskah_id);
      return {
        id: bn.id,
        naskahId: bn.naskah_id,
        berkasId: bn.berkas_id,
        naskahTipe: bn.naskah_tipe,
        sumber: bn.sumber,
        perihal: bn.perihal || naskah?.perihal || null,
        nomorSurat: bn.nomor_surat || naskah?.nomor || null,
        tanggalNaskah: bn.tanggal_naskah || naskah?.tanggal || null,
        urutan: bn.urutan,
        jenis: naskah?.jenis || null,
        sifat: naskah?.sifat || null,
        finalPdf: naskah?.final_pdf || null,
        status: naskah?.status || null,
        permissions: entitlement.permissions,
      };
    });
  }
}