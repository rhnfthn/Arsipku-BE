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
import { StorageService } from '../../storage/services/storage.service';
import { PositionStatus } from '../../../common/enums/position-status.enum';
import { NotificationService } from '../../notification/services/notification.service';
import { NotificationType } from '../../notification/entities/notification.entity';

/**
 * ID organization "Corporate Secretary Division" (TU)
 * Jika jenisBerkas = INAKTIF, divisi pemberi otomatis di-set ke divisi ini
 */
export const CORPORATE_SECRETARY_ORG_ID = 10002098;

/**
 * Sentinel date untuk `usulan_berkas.berlaku_hingga` saat berkas baru dipilih.
 * Dipakai karena kolom NOT NULL dan user DB tidak punya privilege ALTER.
 * Saat akses diterbitkan (`terbitkanAkses`), nilai ini di-overwrite dengan tanggal sebenarnya.
 */
export const BERLAKU_HINGGA_SENTINEL = '9999-12-31';

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
    private readonly storageService: StorageService,
    private readonly notificationService: NotificationService,
  ) {}

  // ── Helper: Generate Nomor Usulan ──────────────────────────────

  private async generateNomorUsulan(): Promise<string> {
    const year = new Date().getFullYear();
    // Pakai MAX dari sequence (bukan COUNT) agar tidak menghasilkan nomor
    // duplikat saat ada gap (mis. usulan dihapus). COUNT bisa "mundur" dan
    // bentrok dengan nomor yang sudah ada.
    const row = await this.usulanRepo
      .createQueryBuilder('u')
      .select('MAX(u.nomor_usulan)', 'max')
      .where('u.nomor_usulan LIKE :pattern', { pattern: `UAB-${year}-%` })
      .getRawOne();
    const maxNomor: string | null = row?.max ?? null;
    let seq = 1;
    if (maxNomor) {
      const match = maxNomor.match(/(\d+)$/);
      if (match) seq = Number(match[1]) + 1;
    }
    return `UAB-${year}-${String(seq).padStart(4, '0')}`;
  }

  // ── Helper: Auto-sort verifikator bottom-to-top ────────────────
  // Sort berdasarkan level (AVP=1, VP=2, EVP=3) ascending, lalu reassign
  // urutan berurutan 1, 2, 3, ... (max 3).
  // Contoh: [AVP, VP, EVP] → urutan [1, 2, 3]
  //         [EVP saja] → urutan [1] (bukan [3] lagi)
  //         [AVP, EVP] → urutan [1, 2]
  private sortVerifikator(
    verifikator: { persnum: number; levelJabatan: LevelJabatan; catatan?: string }[],
  ): { persnum: number; level_jabatan: LevelJabatan; urutan: number; catatan?: string }[] {
    return verifikator
      .map((v, index) => ({ ...v, _levelOrder: LEVEL_ORDER[v.levelJabatan] ?? 99, _originalIndex: index }))
      .sort((a, b) => {
        if (a._levelOrder !== b._levelOrder) {
          return a._levelOrder - b._levelOrder;
        }
        return a._originalIndex - b._originalIndex;
      })
      .slice(0, 3) // max 3 jenjang
      .map((v, index) => {
        const { _levelOrder, levelJabatan, ...rest } = v;
        return { ...rest, level_jabatan: levelJabatan, urutan: index + 1 };
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

  // ── Eligible penerima akses tambahan (orang di divisi pengusul) ──

  /**
   * List semua orang di DIREKTORAT yang sama dengan pengusul yang eligible
   * sebagai penerima akses tambahan.
   *
   * Logic:
   * 1. Cari pengusul di position_json → dapatkan direktorat_id
   * 2. Ambil SEMUA orang dengan direktorat_id yang sama
   * 3. Sertakan BOD juga (BOD, BOD-1, BOD-2, BOD-3)
   * 4. Exclude pengusul sendiri dari list
   */
  async getEligiblePenerimaTambahan(orgId: number, currentUser: any): Promise<any[]> {
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

    const userPersnum = Number(currentUser.persnum);

    // Step 1: Cari direktorat_id pengusul dari position_json
    // Cari orang yang organization_id = orgId → ambil direktorat_id-nya
    const pengusulEntry = positionJson.find(
      (x: any) => Number(x.organization_id) === Number(orgId) && Number(x.persnum_person) === userPersnum,
    );

    // Fallback: jika pengusul tidak ditemukan langsung, cari anyone di orgId yang punya direktorat_id
    const direktoratId = pengusulEntry?.direktorat_id
      ? Number(pengusulEntry.direktorat_id)
      : positionJson.find((x: any) => Number(x.organization_id) === Number(orgId) && x.direktorat_id)?.direktorat_id;

    if (!direktoratId) {
      // Fallback: jika tidak ada direktorat_id, kembalikan semua orang di divisi yang sama (orgId)
      // (backward compatibility untuk data lama)
      const peopleFallback = positionJson
        .filter((x: any) => {
          const xDivisi = Number(x.organization_id ?? x.divisi_id);
          if (xDivisi !== Number(orgId)) return false;
          if (!x.persnum_person) return false;
          if (Number(x.persnum_person) === userPersnum) return false;
          return true;
        })
        .map((v: any) => ({
          persnum: Number(v.persnum_person),
          nama: v.persnum_person_text || v.name || '',
          position_id: v.position,
          position_text: v.position_text || '',
          organization_id: Number(v.organization_id),
          organization_text: v.organization_text || v.divisi_name || '',
        }))
        .filter((item: any, idx: number, arr: any[]) =>
          arr.findIndex((x: any) => x.persnum === item.persnum) === idx,
        )
        .sort((a: any, b: any) => (a.nama || '').localeCompare(b.nama || ''));
      return peopleFallback;
    }

    // Step 2: Ambil SEMUA orang dengan direktorat_id yang sama
    const people = positionJson
      .filter((x: any) => {
        if (Number(x.direktorat_id) !== Number(direktoratId)) return false;
        if (!x.persnum_person) return false;
        // Exclude pengusul sendiri
        if (Number(x.persnum_person) === userPersnum) return false;
        return true;
      })
      .map((v: any) => ({
        persnum: Number(v.persnum_person),
        nama: v.persnum_person_text || v.name || '',
        position_id: v.position,
        position_text: v.position_text || '',
        organization_id: Number(v.organization_id),
        organization_text: v.organization_text || v.divisi_name || '',
        direktorat_id: Number(v.direktorat_id),
        // Tambahkan flag BOD untuk di-highlight di FE
        is_bod: !!(v.bod_tag && ['BOD', 'BOD-1', 'BOD-2', 'BOD-3'].includes(v.bod_tag)),
      }))
      // Dedup by persnum
      .filter(
        (item: any, idx: number, arr: any[]) =>
          arr.findIndex((x: any) => x.persnum === item.persnum) === idx,
      )
      // Sort: BOD dulu (by BOD tag), lalu by nama
      .sort((a: any, b: any) => {
        if (a.is_bod && !b.is_bod) return -1;
        if (!a.is_bod && b.is_bod) return 1;
        return (a.nama || '').localeCompare(b.nama || '');
      });

    return people;
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
        position_id: v.position,
        jabatan: v.position_text,
        bod_tag: v.bod_tag,
        level_jabatan: v.bod_tag,
        divisi_id: v.divisi_id ?? v.organization_id,
        divisi_nama: v.divisi_name ?? v.organization_text,
        is_delegasi: false,
        position_status: null,
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
          position_id: Number(d.as_position),
          jabatan: d.as_position_text,
          bod_tag: bodTag,
          level_jabatan: bodTag,
          divisi_id: Number(d.as_organization),
          divisi_nama: d.as_organization_text,
          is_delegasi: true,
          position_status: d.position_status,
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
    if (dto.jenis_berkas === JenisBerkas.INAKTIF) {
      // Otomatis set ke Corporate Secretary Division
      divisiPemberiId = CORPORATE_SECRETARY_ORG_ID;
    } else {
      if (!dto.divisi_pemberi_id) {
        throw new BadRequestException(
          'divisiPemberiId wajib diisi untuk jenisBerkas AKTIF',
        );
      }
      divisiPemberiId = Number(dto.divisi_pemberi_id);
    }

    // Validasi: divisi pemberi tidak boleh sama dengan divisi pengusul
    // Pengecualian untuk INAKTIF: TU (pengelola arsip inaktif) tetap bisa meminjam dari arsip inaktif yang mereka kelola sendiri (sesuai prosedur formal).
    if (divisiPemberiId === userOrgId && dto.jenis_berkas !== JenisBerkas.INAKTIF) {
      throw new BadRequestException(
        'Divisi pemberi tidak boleh sama dengan divisi pengusul',
      );
    }

    // Validasi: verifikator harus dari divisi yang sama dengan pengusul (BOD tags)
    const bodInDivisi = await this.getVerifikatorBod(userOrgId);
    const validPersnums = new Set(bodInDivisi.map((m) => m.persnum));
    for (const v of dto.verifikator_pengusul) {
      if (!validPersnums.has(v.persnum)) {
        throw new BadRequestException(
          `Verifikator persnum ${v.persnum} tidak ada di divisi Anda atau bukan BOD`,
        );
      }
    }

    // Auto-sort verifikator bottom-to-top (BOD-3 → BOD-2 → BOD-1 → BOD)
    // Pertahankan catatan per verifikator dari SE pengusul
    const sortedVerifikator = this.sortVerifikator(
      dto.verifikator_pengusul.map((v) => ({
        persnum: v.persnum,
        levelJabatan: v.level_jabatan as LevelJabatan,
        ...(v.catatan ? { catatan: v.catatan } : {}),
      })),
    );

    const nomorUsulan = await this.generateNomorUsulan();

    const usulan = this.usulanRepo.create({
      nomor_usulan: nomorUsulan,
      // Partition key — belum ada item berkas saat usulan dibuat, fallback ke hari ini
      tanggal: new Date(),
      jenis_berkas: dto.jenis_berkas,
      pengusul_persnum: userPersnum,
      divisi_pengusul_id: userOrgId,
      divisi_pemberi_id: divisiPemberiId,
      judul_usulan: dto.judul_usulan,
      tujuan_akses: dto.tujuan_akses,
      durasi_akses: dto.durasi_akses,
      custom_tanggal_selesai: dto.custom_tanggal_selesai ? new Date(dto.custom_tanggal_selesai) : null,
      jenis_akses: dto.jenis_akses as string[],
      penerima_akses_tambahan: dto.penerima_akses_tambahan || [],
      surat_usulan_file_id: dto.surat_usulan_file_id ?? null,
      verifikator_pengusul: sortedVerifikator,
      status: StatusUsulan.MENUNGGU_VERIFIKASI_PENGUSUL,
    }) as UsulanAksesBerkasEntity;

    const saved = await this.usulanRepo.save(usulan);
    this.logger.log(`Usulan created: ${saved.nomor_usulan} by persnum=${userPersnum}`);

    // Notifikasi ke Verifikator Pengusul Jenjang 1
    const v1 = saved.verifikator_pengusul?.find((v) => v.urutan === 1);
    if (v1) {
      try {
        await this.notificationService.createNotification({
          positionId: '0',
          userPersnum: v1.persnum,
          type: NotificationType.SYSTEM,
          title: 'Usulan Akses Berkas Menunggu Verifikasi',
          body: `Usulan ${saved.nomor_usulan} — ${saved.judul_usulan} menunggu verifikasi Anda.`,
          data: {
            action: 'OPEN_USULAN_AKSES',
            id: saved.id,
            nomorUsulan: saved.nomor_usulan,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to send create notification: ${err?.message}`);
      }
    }

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
      qb.where('u.pengusul_persnum = :userPersnum', { userPersnum });
      // Hide AKSES_DITERBITKAN from "Usulan Saya" — only visible in Pemberian page
      qb.andWhere('u.status != :excludedStatus', { excludedStatus: StatusUsulan.AKSES_DITERBITKAN });
    } else if (scope === 'verify-pemberi') {
      qb.where('u.divisi_pemberi_id = :userOrgId', { userOrgId });
    } else if (scope === 'verify-me') {
      qb.where(
        '(JSON_CONTAINS(u.verifikator_pengusul, JSON_OBJECT(\'persnum\', :userPersnum)) OR JSON_CONTAINS(u.verifikator_pemberi, JSON_OBJECT(\'persnum\', :userPersnum)))',
        { userPersnum },
      );
    } else {
      // Default: semua usulan yang user bisa lihat
      qb.where(
        '(u.pengusul_persnum = :userPersnum OR u.divisi_pemberi_id = :userOrgId OR JSON_CONTAINS(u.verifikator_pengusul, JSON_OBJECT(\'persnum\', :userPersnum)) OR JSON_CONTAINS(u.verifikator_pemberi, JSON_OBJECT(\'persnum\', :userPersnum)))',
        { userPersnum, userOrgId },
      );
    }

    if (status) {
      qb.andWhere('u.status = :status', { status });
    }

    // Search: cari di nomor_usulan, judul_usulan, tujuan_akses, jenis_berkas
    if (search) {
      qb.andWhere(
        '(u.nomor_usulan LIKE :search OR u.judul_usulan LIKE :search OR u.tujuan_akses LIKE :search OR u.jenis_berkas LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Sort
    const allowedSortFields = ['nomor_usulan', 'judul_usulan', 'jenis_berkas', 'tujuan_akses', 'durasi_akses', 'status', 'created_at', 'updated_at'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'updated_at';
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
          // Build lookup maps sekali untuk O(1) per usulan
          const orgMap = new Map<number, string>(); // orgId → organization_text
          const evpMap = new Map<number, string>(); // orgId → EVP nama
          for (const p of positionJson) {
            if (p.organization_id) {
              orgMap.set(Number(p.organization_id), p.organization_text);
              if (p.chief === 1 && (p.position_text || '').toUpperCase().includes('EVP')) {
                evpMap.set(Number(p.organization_id), p.persnum_person_text);
              }
            }
          }

          for (const usulan of data) {
            (usulan as any).divisi_pemberi_nama = orgMap.get(Number(usulan.divisi_pemberi_id)) || null;
            (usulan as any).evp_pemberi_nama = evpMap.get(Number(usulan.divisi_pemberi_id)) || null;
            (usulan as any).divisi_pengusul_nama = orgMap.get(Number(usulan.divisi_pengusul_id)) || null;
          }
        }
      }
    }

    // Inject isViewedByMe per item (untuk penanda icon mata biru/abu di FE)
    const userPersnumKey = String(user?.persnum);
    for (const item of data as any[]) {
      const viewed = item.viewed_by as Record<string, string> | null;
      (item as any).is_viewed_by_me = !!(viewed && viewed[userPersnumKey]);
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
    const isPengusul = Number(usulan.pengusul_persnum) === userPersnum;
    const isPemberiDivisi = Number(usulan.divisi_pemberi_id) === userOrgId;
    const isVerifikatorPengusul = (usulan.verifikator_pengusul || []).some(
      (v: any) => Number(v.persnum) === userPersnum,
    );
    const isVerifikatorPemberi = (usulan.verifikator_pemberi || []).some(
      (v: any) => Number(v.persnum) === userPersnum,
    );
    // Penerima akses tambahan — user yang terdaftar di penerima_akses_tambahan
    const isPenerimaTambahan = (usulan.penerima_akses_tambahan || []).some(
      (p: any) => Number(p) === userPersnum,
    );
    if (!isPengusul && !isPemberiDivisi && !isVerifikatorPengusul && !isVerifikatorPemberi && !isPenerimaTambahan) {
      throw new ForbiddenException('Anda tidak terlibat dalam usulan ini');
    }

    const steps = await this.stepRepo.find({
      where: { usulan_id: id },
      order: { verified_at: 'ASC' },
    });

    const selectedBerkas = await this.usulanBerkasRepo.find({
      where: { usulan_id: id },
    });

    // ── Enrich selectedBerkas dengan judulBerkas, kodeBerkas, klasifikasiTeks ──
    let enrichedSelectedBerkas: any[] = [];
    if (selectedBerkas.length > 0) {
      const berkasIds = selectedBerkas.map((b) => b.berkas_id);
      const berkasRecords = await this.berkasRepo.find({
        where: { id: In(berkasIds) },
        select: ['id', 'judulBerkas', 'kodeBerkas', 'klasifikasiTeks', 'status'] as any,
      });
      const berkasMap = new Map(berkasRecords.map((b) => [b.id, b]));

      // ── Enrich naskah per berkas dari berkas_naskah table ──
      let naskahByBerkas = new Map<string, any[]>();
      if (berkasIds.length > 0) {
        const berkasNaskahRows = await this.dataSource.query(
          `SELECT bn.id, bn.berkas_id, bn.naskah_id, bn.naskah_tipe, bn.sumber,
                  bn.perihal, bn.nomor_surat, bn.tanggal_naskah, bn.urutan
           FROM berkas_naskah bn
           WHERE bn.berkas_id IN (?)
           ORDER BY bn.urutan ASC, bn.created_at DESC`,
          [berkasIds],
        );

        if (berkasNaskahRows && berkasNaskahRows.length > 0) {
          // Ambil info naskah dari tabel naskah
          const naskahIds = [...new Set(berkasNaskahRows.map((bn: any) => bn.naskah_id))];
          const naskahRows = await this.dataSource.query(
            `SELECT id, jenis, sifat, perihal, nomor, tanggal, status
             FROM naskah
             WHERE id IN (?)`,
            [naskahIds],
          );
          const naskahMap = new Map<string, any>(naskahRows.map((n: any) => [n.id, n]));

          // Group naskah by berkas_id
          for (const bn of berkasNaskahRows) {
            if (!naskahByBerkas.has(bn.berkas_id)) {
              naskahByBerkas.set(bn.berkas_id, []);
            }
            const naskah = naskahMap.get(bn.naskah_id);
            naskahByBerkas.get(bn.berkas_id)!.push({
              naskahId: bn.naskah_id,
              naskahTipe: bn.naskah_tipe,
              sumber: bn.sumber,
              perihal: bn.perihal || naskah?.perihal || null,
              nomorSurat: bn.nomor_surat || naskah?.nomor || null,
              tanggalNaskah: bn.tanggal_naskah || naskah?.tanggal || null,
              urutan: bn.urutan,
              jenis: naskah?.jenis || null,
              sifat: naskah?.sifat || null,
              status: naskah?.status || null,
            });
          }
        }
      }

      enrichedSelectedBerkas = selectedBerkas.map((ub) => {
        const b = berkasMap.get(ub.berkas_id);
        return {
          ...ub,
          judul_berkas: b?.judulBerkas || null,
          kode_berkas: b?.kodeBerkas || null,
          klasifikasi_teks: b?.klasifikasiTeks || null,
          berkas_status: b?.status || null,
          naskah_list: naskahByBerkas.get(ub.berkas_id) || [],
        };
      });
    }

    // ── Enrich: tambah nama & posisi untuk pengusul, divisi, verifikator ──
    // Parse position_json sekali, build Map untuk lookup O(1)
    const orgData = await this.orgDataService.findLatestOrg();
    let pengusulInfo: any = null;
    let divisiPengusulNama: string | null = null;
    let divisiPemberiNama: string | null = null;

    let personMap = new Map<number, any>(); // persnum → position entry
    let orgMap = new Map<number, string>(); // orgId → organization_text

    if (orgData?.position_json) {
      const positionJson =
        typeof orgData.position_json === 'string'
          ? JSON.parse(orgData.position_json)
          : orgData.position_json;

      if (Array.isArray(positionJson)) {
        // Build lookup maps sekali
        for (const p of positionJson) {
          if (p.persnum_person) personMap.set(Number(p.persnum_person), p);
          if (p.organization_id) orgMap.set(Number(p.organization_id), p.organization_text);
        }

        // Cari info pengusul
        const pengusulPos = personMap.get(Number(usulan.pengusul_persnum));
        if (pengusulPos) {
          pengusulInfo = {
            nama: pengusulPos.persnum_person_text,
            jabatan: pengusulPos.position_text,
            organization: pengusulPos.organization_id,
            organization_text: pengusulPos.organization_text,
          };
        }

        // Cari nama divisi pengusul & pemberi
        divisiPengusulNama = orgMap.get(Number(usulan.divisi_pengusul_id)) || null;
        divisiPemberiNama = orgMap.get(Number(usulan.divisi_pemberi_id)) || null;
      }
    }

    // Enrich verifikator pengusul dengan nama & jabatan
    const enrichedVerifikatorPengusul = (usulan.verifikator_pengusul || []).map((v: any) => {
      const person = personMap.get(Number(v.persnum));
      if (person) {
        return {
          ...v,
          nama: person.persnum_person_text,
          jabatan: person.position_text,
          divisi_nama: person.organization_text,
        };
      }
      return v;
    });

    // Enrich verifikator pemberi dengan nama & jabatan
    const enrichedVerifikatorPemberi = (usulan.verifikator_pemberi || []).map((v: any) => {
      const person = personMap.get(Number(v.persnum));
      if (person) {
        return {
          ...v,
          nama: person.persnum_person_text,
          jabatan: person.position_text,
          divisi_nama: person.organization_text,
        };
      }
      return v;
    });

    // Enrich steps dengan nama verifier
    const enrichedSteps = steps.map((step: any) => {
      const person = personMap.get(Number(step.verifier_persnum));
      if (person) {
        return {
          ...step,
          verifier_nama: person.persnum_person_text,
          verifier_jabatan: person.position_text,
        };
      }
      return step;
    });

    // Enrich penerima akses tambahan dengan nama & jabatan
    const enrichedPenerimaTambahan = (usulan.penerima_akses_tambahan || []).map((persnum: number) => {
      const person = personMap.get(Number(persnum));
      if (person) {
        return {
          persnum,
          nama: person.persnum_person_text,
          jabatan: person.position_text,
          divisi_nama: person.organization_text,
        };
      }
      return { persnum, nama: null, jabatan: null, divisi_nama: null };
    });

    return {
      ...usulan,
      steps: enrichedSteps,
      selected_berkas: enrichedSelectedBerkas,
      pengusul_info: pengusulInfo,
      divisi_pengusul_nama: divisiPengusulNama,
      divisi_pemberi_nama: divisiPemberiNama,
      verifikator_pengusul: enrichedVerifikatorPengusul,
      verifikator_pemberi: enrichedVerifikatorPemberi,
      penerima_akses_tambahan: enrichedPenerimaTambahan,
      is_viewed_by_me: !!(usulan.viewed_by && (usulan.viewed_by as Record<string, string>)[String(user.persnum)]),
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
    const verifikator = usulan.verifikator_pengusul.find(
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
    if (dto.keputusan === Keputusan.REVISI && (!dto.catatan_revisi?.trim() || dto.catatan_revisi.trim().length < 5)) {
      throw new BadRequestException(
        'catatanRevisi wajib diisi (minimal 5 karakter) untuk keputusan REVISI',
      );
    }

    // Simpan verification step (checklist dihapus — cukup keputusan + catatan)
    const step = this.stepRepo.create({
      usulan_id: id,
      tanggal: usulan.tanggal ?? new Date(), // partition key, ikut tanggal usulan
      verifier_persnum: userPersnum,
      role_tahap: `VERIFIKATOR_PENGUSUL_J${jenjang}`,
      urutan_jenjang: jenjang,
      keputusan: dto.keputusan,
      catatan: dto.catatan || null,
      catatan_revisi: dto.catatan_revisi || null,
      catatan_ke_se: dto.catatan_ke_se || null,
      checklist: {},
    } as any);
    await this.stepRepo.save(step);

    // Tentukan next status
    const totalJenjang = usulan.verifikator_pengusul.length;

    if (dto.keputusan === Keputusan.TOLAK) {
      // Verifikator pengusul menolak = revisi untuk SE pengusul (bukan closed)
      usulan.status = StatusUsulan.REVISI_PENGUSUL;
      usulan.catatan_revisi_pengusul = dto.catatan_ke_se || dto.catatan || null;
    } else if (dto.keputusan === Keputusan.REVISI) {
      usulan.status = StatusUsulan.REVISI_PENGUSUL;
      usulan.catatan_revisi_pengusul = dto.catatan_revisi || null;
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

    // Kirim notifikasi sesuai keputusan & status baru
    try {
      if (dto.keputusan === Keputusan.TOLAK || dto.keputusan === Keputusan.REVISI) {
        // Notifikasi ke SE Pengusul
        await this.notificationService.createNotification({
          positionId: '0',
          userPersnum: saved.pengusul_persnum,
          type: NotificationType.SYSTEM,
          title: 'Usulan Akses Berkas Perlu Revisi',
          body: `Usulan ${saved.nomor_usulan} perlu revisi: ${dto.catatan_revisi || dto.catatan || 'Mohon disesuaikan.'}`,
          data: { action: 'OPEN_USULAN_AKSES', id: saved.id, nomorUsulan: saved.nomor_usulan },
        });
      } else if (dto.keputusan === Keputusan.SETUJU) {
        if (jenjang < totalJenjang) {
          // Notifikasi ke Verifikator Pengusul berikutnya
          const nextV = saved.verifikator_pengusul?.find((v) => v.urutan === jenjang + 1);
          if (nextV) {
            await this.notificationService.createNotification({
              positionId: '0',
              userPersnum: nextV.persnum,
              type: NotificationType.SYSTEM,
              title: 'Usulan Akses Berkas Menunggu Verifikasi',
              body: `Usulan ${saved.nomor_usulan} — ${saved.judul_usulan} menunggu verifikasi Anda.`,
              data: { action: 'OPEN_USULAN_AKSES', id: saved.id, nomorUsulan: saved.nomor_usulan },
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to send verifikasiPengusul notification: ${err?.message}`);
    }

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
    if (usulan.divisi_pemberi_id !== userOrgId) {
      throw new ForbiddenException(
        'Anda bukan Sekretaris di divisi pemberi',
      );
    }

    if (usulan.status !== StatusUsulan.TERKIRIM_KE_PEMBERI && usulan.status !== StatusUsulan.REVISI_PEMBERI) {
      throw new BadRequestException(
        'Status usulan tidak valid untuk verifikasi pemberi',
      );
    }

    // Validasi: keputusan untuk verifikasi pemberi hanya boleh TOLAK atau LANJUT
    if (dto.keputusan !== Keputusan.TOLAK && dto.keputusan !== Keputusan.LANJUT) {
      throw new BadRequestException(
        'Keputusan untuk verifikasi pemberi hanya boleh TOLAK atau LANJUT',
      );
    }

    // Validasi: catatanPerubahanDurasi opsional — jika durasi berubah dan tidak diisi,
    // pakai catatan umum sebagai fallback.
    const catatanDurasi =
      dto.catatan_perubahan_durasi?.trim() || dto.catatan?.trim() || null;

    // Simpan step (checklist dihapus — cukup keputusan + catatan + durasi)
    const step = this.stepRepo.create();
    step.usulan_id = id;
    step.tanggal = usulan.tanggal ?? new Date(); // partition key, ikut tanggal usulan
    step.verifier_persnum = Number(user.persnum);
    step.role_tahap = 'SEKRETARIS_PEMBERI';
    step.urutan_jenjang = 0; // sekretaris bukan jenjang managerial
    step.keputusan = dto.keputusan;
    step.catatan = dto.catatan || null;
    step.checklist = {};
    await this.stepRepo.save(step);

    if (dto.keputusan === Keputusan.TOLAK) {
      usulan.status = StatusUsulan.DITOLAK_PEMBERI;
    } else if (dto.keputusan === Keputusan.LANJUT) {
      usulan.status = StatusUsulan.PEMILIHAN_BERKAS;
      if (dto.durasi_akses_disetujui) {
        usulan.durasi_akses_disetujui = dto.durasi_akses_disetujui;
        // Jadikan durasi disetujui sebagai acuan utama
        usulan.durasi_akses = dto.durasi_akses_disetujui;
        if (dto.durasi_akses_disetujui === DurasiPreset.CUSTOM) {
          // Simpan custom tanggal dari SE pemberi, atau pertahankan dari pengusul
          if (dto.custom_tanggal_selesai) {
            usulan.custom_tanggal_selesai = new Date(dto.custom_tanggal_selesai);
          }
          // else: pertahankan customTanggalSelesai dari pengusul
        } else {
          usulan.custom_tanggal_selesai = null;
        }
      }
      usulan.catatan_perubahan_durasi = catatanDurasi;
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
    if (usulan.divisi_pemberi_id !== userOrgId) {
      throw new ForbiddenException('Anda bukan Sekretaris di divisi pemberi');
    }

    if (usulan.status !== StatusUsulan.PEMILIHAN_BERKAS && usulan.status !== StatusUsulan.REVISI_PEMBERI) {
      throw new BadRequestException('Status tidak valid untuk pemilihan berkas');
    }

    // Validasi: berkas harus milik divisi pemberi dan berstatus closed_retensi_aktif
    const berkasList = await this.berkasRepo.find({
      where: { id: In(dto.berkas_ids) },
    });
    if (berkasList.length !== dto.berkas_ids.length) {
      const foundIds = new Set(berkasList.map((b) => b.id));
      const missing = dto.berkas_ids.filter((id) => !foundIds.has(id));
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
      // Validasi kepemilikan per unit bisa ditambahkan setelah ada kolom divisi_id di berkas
    }

    // Hapus berkas lama jika ada (revisi case)
    // Simpan berkas baru — berlakuHingga pakai sentinel sampai akses diterbitkan.
    // Kolom DB NOT NULL, jadi kita tidak bisa null-kan (user tidak punya ALTER privilege).
    // Sentinel akan di-overwrite dengan tanggal sebenarnya saat terbitkanAkses().
    // Partition key `tanggal` mengikuti tanggal_dibuat berkas (berkasList sudah ada di scope).
    const tanggalDibuatByBerkas = new Map(
      berkasList.map((b) => [b.id, b.tanggalDibuat] as const),
    );
    const usulanBerkasItems = dto.berkas_ids.map((berkasId) => {
      const tanggalDibuat = tanggalDibuatByBerkas.get(berkasId);
      return this.usulanBerkasRepo.create({
        usulan_id: id,
        berkas_id: berkasId,
        tanggal: tanggalDibuat ? new Date(tanggalDibuat) : new Date(),
        jenis_akses_granted: usulan.jenis_akses,
        berlaku_hingga: BERLAKU_HINGGA_SENTINEL as any,
      });
    });

    // Auto-sort verifikator pemberi (pertahankan catatan per verifikator)
    const sortedVerifikatorPemberi = this.sortVerifikator(
      dto.verifikator_pemberi.map((v) => ({
        persnum: v.persnum,
        levelJabatan: v.level_jabatan as LevelJabatan,
        ...(v.catatan ? { catatan: v.catatan } : {}),
      })),
    );

    // Validasi: verifikator pemberi harus dari divisi pemberi (BOD tags)
    const bodPemberi = await this.getVerifikatorBod(usulan.divisi_pemberi_id);
    const validPersnumsPemberi = new Set(bodPemberi.map((m) => m.persnum));
    for (const v of sortedVerifikatorPemberi) {
      if (!validPersnumsPemberi.has(v.persnum)) {
        throw new BadRequestException(
          `Verifikator pemberi persnum ${v.persnum} tidak ada di divisi pemberi`,
        );
      }
    }

    usulan.verifikator_pemberi = sortedVerifikatorPemberi;
    usulan.status = StatusUsulan.MENUNGGU_PERSETUJUAN_PEMBERI;

    // Jalankan delete berkas lama + simpan berkas baru + update usulan dalam
    // satu transaksi agar tidak ada data setengah jadi jika gagal di tengah.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let saved: UsulanAksesBerkasEntity;
    try {
      await queryRunner.manager.delete(UsulanBerkasEntity, { usulan_id: id });
      await queryRunner.manager.save(usulanBerkasItems);
      saved = await queryRunner.manager.save(usulan);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    this.logger.log(`Pilih berkas: ${dto.berkas_ids.length} berkas by persnum=${user.persnum}`);

    // Notifikasi ke Verifikator Pemberi Jenjang 1
    const v1 = saved.verifikator_pemberi?.find((v) => v.urutan === 1);
    if (v1) {
      try {
        await this.notificationService.createNotification({
          positionId: '0',
          userPersnum: v1.persnum,
          type: NotificationType.SYSTEM,
          title: 'Usulan Akses Berkas Menunggu Persetujuan',
          body: `Usulan ${saved.nomor_usulan} — ${saved.judul_usulan} menunggu persetujuan Anda.`,
          data: { action: 'OPEN_USULAN_AKSES', id: saved.id, nomorUsulan: saved.nomor_usulan },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to send pilihBerkas notification: ${err?.message}`);
      }
    }

    return saved;
  }

  // ── Eligible berkas untuk modal Pilih Berkas (SE Pemberi) ──

  /**
   * Daftar berkas yang eligible untuk dipilih SE Pemberi pada modal
   * "Pilih Berkas & Verifikator".
   *
   * Aturan:
   * - Semua berkas berstatus closed_retensi_aktif (tertutup).
   * - Jika jenisBerkas = AKTIF: filter unitPenciptaId = divisiPemberiId
   *   (hanya berkas milik divisi pemberi).
   * - Jika jenisBerkas = INAKTIF: tidak ada filter unit (semua berkas tertutup).
   */
  async getEligibleBerkasForPemberi(
    user: any,
    jenisBerkas?: string,
    divisiPemberiId?: number,
  ): Promise<any[]> {
    this.logger.log(
      `[getEligibleBerkasForPemberi] jenisBerkas=${jenisBerkas}, divisiPemberiId=${divisiPemberiId}`,
    );

    // Build query — TypeORM find doesn't support __or, use QueryBuilder
    const qb = this.berkasRepo.createQueryBuilder('b');
    qb.where('b.status = :status', { status: StatusBerkas.CLOSED_RETENSI_AKTIF });
    qb.andWhere('b.deleted_at IS NULL');

    if (jenisBerkas === JenisBerkas.AKTIF && divisiPemberiId) {
      const orgData = await this.orgDataService.findLatestOrg();
      let divisiPersnums: number[] = [];
      if (orgData?.position_json) {
        const positionJson =
          typeof orgData.position_json === 'string'
            ? JSON.parse(orgData.position_json)
            : orgData.position_json;
        if (Array.isArray(positionJson)) {
          divisiPersnums = positionJson
            .filter((p: any) => Number(p.organization_id) === divisiPemberiId && p.persnum_person)
            .map((p: any) => Number(p.persnum_person));
        }
      }
      this.logger.log(
        `[getEligibleBerkasForPemberi] divisiPersnums=${JSON.stringify(divisiPersnums)}`,
      );

      if (divisiPersnums.length > 0) {
        qb.andWhere(
          '(b.unit_pencipta_id = :divisiPemberiId OR b.created_by IN (:...persnums))',
          { divisiPemberiId, persnums: divisiPersnums },
        );
      } else {
        qb.andWhere('b.unit_pencipta_id = :divisiPemberiId', { divisiPemberiId });
      }
    }

    qb.orderBy('b.judul_berkas', 'ASC');
    const rows = await qb.getMany();
    this.logger.log(
      `[getEligibleBerkasForPemberi] Found ${rows.length} berkas`,
    );
    return rows.map((b: any) => ({
      id: b.id,
      judul_berkas: b.judulBerkas,
      kode_berkas: b.kodeBerkas,
      klasifikasi: b.klasifikasi,
      klasifikasi_text: b.klasifikasiText,
      jenis: b.jenis,
      status: b.status,
      unit_pencipta_id: b.unitPenciptaId,
      retensi_aktif_tahun: b.retensiAktifTahun,
      retensi_inaktif_tahun: b.retensiInaktifTahun,
    }));
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
    if (!usulan.verifikator_pemberi) {
      throw new BadRequestException('Verifikator pemberi belum dipilih');
    }
    const verifikator = usulan.verifikator_pemberi.find(
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

    if (dto.keputusan === Keputusan.REVISI && (!dto.catatan_revisi?.trim() || dto.catatan_revisi.trim().length < 5)) {
      throw new BadRequestException(
        'catatanRevisi wajib diisi (minimal 5 karakter) untuk keputusan REVISI',
      );
    }

    // catatanPerubahanDurasi opsional — fallback ke catatan umum
    const catatanDurasiPemberi =
      dto.catatan_perubahan_durasi?.trim() || dto.catatan?.trim() || null;

    // Simpan step (checklist dihapus — cukup keputusan + catatan + durasi)
    const step = this.stepRepo.create();
    step.usulan_id = id;
    step.tanggal = usulan.tanggal ?? new Date(); // partition key, ikut tanggal usulan
    step.verifier_persnum = userPersnum;
    step.role_tahap = `VERIFIKATOR_PEMBERI_J${jenjang}`;
    step.urutan_jenjang = jenjang;
    step.keputusan = dto.keputusan;
    step.catatan = dto.catatan || null;
    step.catatan_revisi = dto.catatan_revisi || null;
    step.catatan_ke_se = dto.catatan_ke_se || null;
    step.checklist = {};
    await this.stepRepo.save(step);

    // Apply durasi adjustment dari verifikator berjenjang
    if (dto.durasi_akses_disetujui) {
      usulan.durasi_akses_disetujui = dto.durasi_akses_disetujui;
      // Jadikan durasi disetujui sebagai acuan utama
      usulan.durasi_akses = dto.durasi_akses_disetujui;
      if (dto.durasi_akses_disetujui !== DurasiPreset.CUSTOM) {
        usulan.custom_tanggal_selesai = null;
      }
      usulan.catatan_perubahan_durasi = catatanDurasiPemberi || usulan.catatan_perubahan_durasi || null;
    }

    const totalJenjang = usulan.verifikator_pemberi.length;

    if (dto.keputusan === Keputusan.TOLAK) {
      // Verifikator pemberi menolak = kembali ke SE pemberi untuk verifikasi ulang
      usulan.status = StatusUsulan.TERKIRIM_KE_PEMBERI;
      usulan.catatan_revisi_pemberi = dto.catatan_ke_se || dto.catatan || null;
    } else if (dto.keputusan === Keputusan.REVISI) {
      usulan.status = StatusUsulan.REVISI_PEMBERI;
      usulan.catatan_revisi_pemberi = dto.catatan_revisi || null;
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

    try {
      if (dto.keputusan === Keputusan.SETUJU) {
        if (jenjang < totalJenjang) {
          const nextV = saved.verifikator_pemberi?.find((v) => v.urutan === jenjang + 1);
          if (nextV) {
            await this.notificationService.createNotification({
              positionId: '0',
              userPersnum: nextV.persnum,
              type: NotificationType.SYSTEM,
              title: 'Usulan Akses Berkas Menunggu Persetujuan',
              body: `Usulan ${saved.nomor_usulan} — ${saved.judul_usulan} menunggu persetujuan Anda.`,
              data: { action: 'OPEN_USULAN_AKSES', id: saved.id, nomorUsulan: saved.nomor_usulan },
            });
          }
        } else {
          // Jenjang terakhir disetujui → Akses Diterbitkan! Notify pengusul & penerima tambahan
          const recipients = Array.from(new Set([saved.pengusul_persnum, ...(saved.penerima_akses_tambahan || [])]));
          await Promise.all(
            recipients.map((persnum) =>
              this.notificationService.createNotification({
                positionId: '0',
                userPersnum: persnum,
                type: NotificationType.SYSTEM,
                title: 'Akses Berkas Diterbitkan',
                body: `Akses untuk usulan ${saved.nomor_usulan} — ${saved.judul_usulan} telah diterbitkan dan dapat diakses.`,
                data: { action: 'OPEN_USULAN_AKSES', id: saved.id, nomorUsulan: saved.nomor_usulan },
              }),
            ),
          );
        }
      } else if (dto.keputusan === Keputusan.TOLAK || dto.keputusan === Keputusan.REVISI) {
        await this.notificationService.createNotification({
          positionId: '0',
          userPersnum: saved.pengusul_persnum,
          type: NotificationType.SYSTEM,
          title: 'Persetujuan Akses Berkas Ditolak / Perlu Revisi',
          body: `Usulan ${saved.nomor_usulan} permohonan akses berkas: ${dto.catatan_revisi || dto.catatan || 'Ditolak/perlu revisi.'}`,
          data: { action: 'OPEN_USULAN_AKSES', id: saved.id, nomorUsulan: saved.nomor_usulan },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to send persetujuanPemberi notification: ${err?.message}`);
    }

    try {
      this.notificationService
        .markByNaskahAsRead('0', saved.id, userPersnum)
        .catch(() => {});
    } catch (_) {}

    return saved;
  }

  // ── Terbitkan Akses (internal, dipanggil saat approval terakhir) ──

  private async terbitkanAkses(usulan: UsulanAksesBerkasEntity): Promise<void> {
    const tanggalMulai = new Date();
    let tanggalSelesai: Date;

    if (
      usulan.durasi_akses_disetujui === DurasiPreset.CUSTOM &&
      usulan.custom_tanggal_selesai
    ) {
      // Custom: pakai tanggal selesai yang dipilih pengusul
      tanggalSelesai = new Date(usulan.custom_tanggal_selesai);
    } else {
      // Jika verifikator mengubah durasi (durasiAksesDisetujui), pakai itu.
      // Jika tidak (null), pakai durasi asli pengusul (durasiAkses).
      const durasiPreset = usulan.durasi_akses_disetujui || usulan.durasi_akses;
      const durasiHari =
        durasiPreset && durasiPreset !== DurasiPreset.CUSTOM
          ? DURASI_PRESET_HARI[durasiPreset as Exclude<DurasiPreset, 'CUSTOM'>]
          : 365; // default 1 tahun
      tanggalSelesai = new Date(tanggalMulai);
      tanggalSelesai.setDate(tanggalSelesai.getDate() + durasiHari);
    }

    usulan.tanggal_mulai = tanggalMulai;
    usulan.tanggal_selesai = tanggalSelesai;
    usulan.status = StatusUsulan.AKSES_DITERBITKAN;

    // Ambil berkas yang dipilih
    const usulanBerkas = await this.usulanBerkasRepo.find({
      where: { usulan_id: usulan.id },
    });

    // Partition key entitlement: tanggal_dibuat dari berkas terkait (lookup sekali untuk semua entitlement)
    const berkasTanggalIds = usulanBerkas.map((ub) => ub.berkas_id);
    const berkasUntukTanggal = berkasTanggalIds.length
      ? await this.berkasRepo.find({
          where: { id: In(berkasTanggalIds) },
          select: ['id', 'tanggalDibuat'] as any,
        })
      : [];
    const tanggalDibuatByBerkas = new Map(
      berkasUntukTanggal.map((b) => [b.id, b.tanggalDibuat] as const),
    );

    // Buat entitlement untuk Sekretaris Pengusul (wajib)
    const entitlements: AksesBerkasEntity[] = [];

    for (const ub of usulanBerkas) {
      const tanggalDibuat = tanggalDibuatByBerkas.get(ub.berkas_id);
      const tanggal = tanggalDibuat ? new Date(tanggalDibuat) : new Date();
      // Sekretaris Pengusul
      entitlements.push(
        this.aksesRepo.create({
          usulan_id: usulan.id,
          tanggal,
          user_persnum: usulan.pengusul_persnum,
          berkas_id: ub.berkas_id,
          permissions: ub.jenis_akses_granted,
          tanggal_mulai: tanggalMulai,
          tanggal_selesai: tanggalSelesai,
          is_revoked: false,
          is_penerima_tambahan: false,
        }),
      );

      // Penerima akses tambahan
      if (usulan.penerima_akses_tambahan?.length) {
        for (const persnum of usulan.penerima_akses_tambahan) {
          entitlements.push(
            this.aksesRepo.create({
              usulan_id: usulan.id,
              tanggal,
              user_persnum: persnum,
              berkas_id: ub.berkas_id,
              permissions: ub.jenis_akses_granted,
              tanggal_mulai: tanggalMulai,
              tanggal_selesai: tanggalSelesai,
              is_revoked: false,
              is_penerima_tambahan: true,
            }),
          );
        }
      }

      // Update berlakuHingga di usulan_berkas
      ub.berlaku_hingga = tanggalSelesai;
    }

    // Jalankan seluruh penerbitan dalam satu transaksi agar tidak ada
    // entitlement yang terbit setengah-setengah jika gagal di tengah.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.save(entitlements);
      await queryRunner.manager.save(usulanBerkas);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    this.logger.log(
      `Akses diterbitkan: ${usulan.nomor_usulan}, ${entitlements.length} entitlements`,
    );
  }

  // ── Get Trail (audit trail) ───────────────────────────────────

  async getTrail(id: string, user: any): Promise<VerificationStepEntity[]> {
    // Actor-based: verifikasi user terlibat sebelum return trail
    const usulan = await this.usulanRepo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    const userPersnum = Number(user.persnum);
    const userOrgId = Number(user.organization);
    const isPengusul = Number(usulan.pengusul_persnum) === userPersnum;
    const isPemberiDivisi = Number(usulan.divisi_pemberi_id) === userOrgId;
    const isVerifikatorPengusul = (usulan.verifikator_pengusul || []).some(
      (v: any) => Number(v.persnum) === userPersnum,
    );
    const isVerifikatorPemberi = (usulan.verifikator_pemberi || []).some(
      (v: any) => Number(v.persnum) === userPersnum,
    );
    // Penerima akses tambahan
    const isPenerimaTambahan = (usulan.penerima_akses_tambahan || []).some(
      (p: any) => Number(p) === userPersnum,
    );
    if (!isPengusul && !isPemberiDivisi && !isVerifikatorPengusul && !isVerifikatorPemberi && !isPenerimaTambahan) {
      throw new ForbiddenException('Anda tidak terlibat dalam usulan ini');
    }

    return this.stepRepo.find({
      where: { usulan_id: id },
      order: { verified_at: 'ASC' },
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
    const userOrgId = Number(user.organization);
    const now = new Date();

    // Ambil entitlements yang belum revoked
    const entitlements = await this.aksesRepo.find({
      where: { user_persnum: userPersnum, is_revoked: false },
      order: { created_at: 'DESC' },
    });

    if (entitlements.length === 0) return [];

    // Ambil info berkas
    const berkasIds = [...new Set(entitlements.map((e) => e.berkas_id))];
    const berkasList = await this.berkasRepo.find({
      where: { id: In(berkasIds) },
    });
    const berkasMap = new Map(berkasList.map((b) => [b.id, b]));

    // Ambil info usulan (nomorUsulan, tujuanAkses, jenisBerkas)
    const usulanIds = [...new Set(entitlements.map((e) => e.usulan_id))];
    const usulanList = await this.usulanRepo.find({
      where: { id: In(usulanIds) },
    });
    const usulanMap = new Map(usulanList.map((u) => [u.id, u]));

    // Filter: hanya entitlement dari divisi pemberi LAIN (bukan divisi user sendiri).
    // Halaman Pemberian = akses yang diterima dari divisi lain, bukan dari divisi sendiri.
    const filteredEntitlements = entitlements.filter((e) => {
      const usulan = usulanMap.get(e.usulan_id);
      if (!usulan) return false;
      return Number(usulan.divisi_pemberi_id) !== userOrgId;
    });

    if (filteredEntitlements.length === 0) return [];

    // Group by berkasId — gabungkan entitlements untuk berkas yang sama
    const berkasGroups = new Map<string, any>();
    for (const e of filteredEntitlements) {
      const existing = berkasGroups.get(e.berkas_id);
      const isExpired = e.tanggal_selesai && new Date(e.tanggal_selesai) < now;
      if (!existing) {
        const berkas = berkasMap.get(e.berkas_id);
        const usulan = usulanMap.get(e.usulan_id);
        berkasGroups.set(e.berkas_id, {
          berkas_id: e.berkas_id,
          judul_berkas: berkas?.judulBerkas || '(Berkas tidak ditemukan)',
          klasifikasi: berkas?.klasifikasi || null,
          klasifikasi_teks: berkas?.klasifikasiTeks || null,
          lokasi: berkas?.lokasi || null,
          // Info dari usulan (judul usulan & jenis berkas)
          judul_usulan: usulan?.judul_usulan || null,
          jenis_berkas: usulan?.jenis_berkas || null,
          // Gabungkan permissions dari semua entitlement untuk berkas ini
          permissions: [...new Set([...(e.permissions || [])])],
          // Ambil tanggalMulai terbaru dan tanggalSelesai terlama
          tanggal_mulai: e.tanggal_mulai,
          tanggal_selesai: e.tanggal_selesai,
          is_expired: isExpired,
          // Info usulan terbaru
          usulan_ids: [e.usulan_id],
          nomor_usulan_terbaru: usulan?.nomor_usulan || null,
          is_penerima_tambahan: e.is_penerima_tambahan,
          is_read: e.is_read,
          entitlement_count: 1,
        });
      } else {
        // Merge permissions
        existing.permissions = [...new Set([...existing.permissions, ...(e.permissions || [])])];
        // Ambil tanggalMulai terbaru
        if (new Date(e.tanggal_mulai) > new Date(existing.tanggal_mulai)) {
          existing.tanggal_mulai = e.tanggal_mulai;
          // Update nomorUsulanTerbaru ke usulan dengan tanggalMulai terbaru
          const usulanFromMap = usulanMap.get(e.usulan_id);
          if (usulanFromMap?.nomor_usulan) existing.nomor_usulan_terbaru = usulanFromMap.nomor_usulan;
        }
        // Ambil tanggalSelesai terjauh (masa berlaku terpanjang yang masih aktif)
        // agar konsisten dengan is_expired (false jika ada satu yang aktif).
        if (new Date(e.tanggal_selesai) > new Date(existing.tanggal_selesai)) {
          existing.tanggal_selesai = e.tanggal_selesai;
        }
        // Update isExpired — kalau ada satu yang aktif, berkas ini aktif
        if (!isExpired) {
          existing.is_expired = false;
        }
        // isRead: true hanya jika SEMUA entitlement di group sudah dibaca
        if (!e.is_read) {
          existing.is_read = false;
        }
        // Tambah usulan
        if (!existing.usulan_ids.includes(e.usulan_id)) {
          existing.usulan_ids.push(e.usulan_id);
        }
        existing.entitlement_count++;
      }
    }

    // Enrich dengan divisi pemberi — pakai usulanMap yang sudah ada (hindari query ulang)
    const orgData = await this.orgDataService.findLatestOrg();
    let divisiNamaMap = new Map<number, string>();
    if (orgData?.position_json) {
      const positionJson =
        typeof orgData.position_json === 'string'
          ? JSON.parse(orgData.position_json)
          : orgData.position_json;
      if (Array.isArray(positionJson)) {
        for (const p of positionJson) {
          if (p.organization_id && p.organization_text) {
            divisiNamaMap.set(Number(p.organization_id), p.organization_text);
          }
        }
      }
    }

    for (const group of berkasGroups.values()) {
      const firstUsulanId = group.usulan_ids[0];
      const usulan = usulanMap.get(firstUsulanId);
      const divisiPemberiId = usulan?.divisi_pemberi_id;
      if (divisiPemberiId) {
        (group as any).divisi_pemberi_id = divisiPemberiId;
        (group as any).divisi_pemberi_nama = divisiNamaMap.get(Number(divisiPemberiId)) || null;
      }
    }

    return Array.from(berkasGroups.values());
  }

  /**
   * Detail naskah untuk SE pengusul yang punya entitlement.
   * Cek: naskah ini ada di berkas yang user punya entitlement-nya.
   * Mengembalikan rich detail (pengirim, penerima, tembusan, lampiran)
   * agar FE bisa render dengan komponen DetailNaskah yang sama dengan halaman kelola.
   */
  async getNaskahDetailForEntitlement(naskahId: string, user: any): Promise<any> {
    const userPersnum = Number(user.persnum);
    const userOrgId = Number(user.organization);

    // Cari berkas_naskah yang berisi naskah ini
    const berkasNaskahRows = await this.dataSource.query(
      `SELECT berkas_id FROM berkas_naskah WHERE naskah_id = ?`,
      [naskahId],
    );

    if (!berkasNaskahRows || berkasNaskahRows.length === 0) {
      throw new NotFoundException('Naskah tidak ditemukan di berkas manapun');
    }

    // Cek akses: entitlement atau role dalam usulan
    const berkasIds = berkasNaskahRows.map((bn: any) => bn.berkas_id);
    let accessResult = { allowed: false, usulanId: null as string | null };
    for (const bid of berkasIds) {
      accessResult = await this.hasUsulanBerkasAccess(bid, userPersnum, userOrgId);
      if (accessResult.allowed) break;
    }

    if (!accessResult.allowed) {
      throw new ForbiddenException('Anda tidak memiliki akses ke naskah ini');
    }

    // Ambil entitlement untuk permissions (jika ada)
    const entitlement = await this.aksesRepo.findOne({
      where: { user_persnum: userPersnum, berkas_id: In(berkasIds), is_revoked: false },
    });

    // Ambil detail naskah
    const naskahRows = await this.dataSource.query(
      `SELECT * FROM naskah WHERE id = ?`,
      [naskahId],
    );

    if (!naskahRows || naskahRows.length === 0) {
      throw new NotFoundException('Naskah tidak ditemukan');
    }

    const naskah = naskahRows[0] as any;

    // Pengirim (sirkulasi.sirkuler = 'pengirim')
    const pengirimRows = await this.dataSource.query(
      `SELECT * FROM naskah_sirkulasi
       WHERE id_naskah = ? AND sirkuler = 'pengirim'
       ORDER BY created_at ASC LIMIT 1`,
      [naskahId],
    );
    const pengirim = pengirimRows[0] || null;

    // Penerima & Tembusan
    const penerimaRows = await this.dataSource.query(
      `SELECT * FROM naskah_sirkulasi
       WHERE id_naskah = ? AND sirkuler = 'penerima'
       ORDER BY created_at ASC`,
      [naskahId],
    );
    const tembusanRows = await this.dataSource.query(
      `SELECT * FROM naskah_sirkulasi
       WHERE id_naskah = ? AND sirkuler = 'tembusan'
       ORDER BY created_at ASC`,
      [naskahId],
    );

    // Lampiran files
    const lampiranRows = await this.dataSource.query(
      `SELECT id, id_naskah, file_name, file_pdf, jenis, created_at
       FROM naskah_lampiran
       WHERE id_naskah = ? AND is_temporary = 0
       ORDER BY created_at ASC`,
      [naskahId],
    );

    // Resolve file URL via signed MinIO URL (konsisten dengan getBerkasNaskah),
    // bukan path relative /files/ yang butuh reverse proxy eksternal.
    const resolveFileUrl = async (key: string | null): Promise<string | null> => {
      if (!key) return null;
      if (key.startsWith('http')) return key;
      try {
        return await this.storageService.getFileUrl(key);
      } catch (e) {
        this.logger.warn(`[getNaskahDetailForEntitlement] Gagal resolve file URL untuk ${key}: ${e}`);
        return null;
      }
    };

    const lampiranFiles = await Promise.all(
      lampiranRows.map(async (l: any) => ({
        id: l.id,
        file_name: l.file_name,
        file_pdf: l.file_pdf,
        file_url: await resolveFileUrl(l.file_pdf),
      })),
    );

    const finalPdfUrl = await resolveFileUrl(naskah.final_pdf);

    return {
      ...naskah,
      pengirim: pengirim
        ? {
            id: pengirim.id,
            position_id: pengirim.position,
            position_text: pengirim.position_text,
            organization_text: pengirim.organization_text,
            nama_sirkuler: pengirim.nama_sirkuler,
          }
        : null,
      penerima: penerimaRows.map((p: any) => ({
        id: p.id,
        position_id: p.position,
        position_text: p.position_text,
        organization_text: p.organization_text,
        nama_sirkuler: p.nama_sirkuler,
      })),
      tembusan: tembusanRows.map((t: any) => ({
        id: t.id,
        position_id: t.position,
        position_text: t.position_text,
        organization_text: t.organization_text,
        nama_sirkuler: t.nama_sirkuler,
      })),
      lampiran_files: lampiranFiles,
      // Final pdf URL untuk preview iframe — signed URL MinIO (bisa diakses langsung)
      final_pdf_url: finalPdfUrl,
      // Siapkan juga 'jenis_label' untuk konsistensi dengan halaman kelola
      jenis_label: naskah.jenis || null,
      permissions: entitlement?.permissions || ['LIHAT'],
    };
  }

  // ── Detail Berkas untuk Pemberian (cek entitlement) ───────────

  /**
   * Detail berkas untuk SE pengusul yang punya entitlement.
   * Cek: user punya entitlement untuk berkas ini.
   */
  async getBerkasDetailForEntitlement(berkasId: string, user: any): Promise<any> {
    const userPersnum = Number(user.persnum);
    const userOrgId = Number(user.organization);

    // Cek akses: entitlement atau role dalam usulan
    const accessResult = await this.hasUsulanBerkasAccess(berkasId, userPersnum, userOrgId);
    if (!accessResult.allowed) {
      throw new ForbiddenException('Anda tidak memiliki akses ke berkas ini');
    }

    // Ambil entitlement untuk permissions (jika ada)
    const entitlement = await this.aksesRepo.findOne({
      where: { user_persnum: userPersnum, berkas_id: berkasId, is_revoked: false },
    });

    // Ambil detail berkas
    const berkas = await this.berkasRepo.findOne({ where: { id: berkasId } });
    if (!berkas) {
      throw new NotFoundException('Berkas tidak ditemukan');
    }

    // Ambil info usulan (untuk nomorUsulan, divisiPemberi, dll)
    const resolvedUsulanId = entitlement?.usulan_id || accessResult.usulanId;
    const usulan = resolvedUsulanId
      ? await this.usulanRepo.findOne({ where: { id: resolvedUsulanId } })
      : null;

    // Ambil nama divisi pemberi dari org_data
    let divisiPemberiNama: string | null = null;
    let evpPemberiNama: string | null = null;
    let pengusulInfo: any = null;
    let divisiPengusulNama: string | null = null;
    const orgData = await this.orgDataService.findLatestOrg();
    if (orgData?.position_json) {
      const positionJson =
        typeof orgData.position_json === 'string'
          ? JSON.parse(orgData.position_json)
          : orgData.position_json;
      if (Array.isArray(positionJson)) {
        const divisi = positionJson.find(
          (p: any) => Number(p.organization_id) === Number(usulan?.divisi_pemberi_id),
        );
        divisiPemberiNama = divisi?.organization_text || null;

        const evp = positionJson.find(
          (p: any) =>
            Number(p.organization_id) === Number(usulan?.divisi_pemberi_id) &&
            p.chief === 1 &&
            (p.position_text || '').toUpperCase().includes('EVP'),
        );
        evpPemberiNama = evp?.persnum_person_text || null;

        // Info pengusul (nama & jabatan)
        const pengusulPos = positionJson.find(
          (p: any) => Number(p.persnum_person) === Number(usulan?.pengusul_persnum),
        );
        if (pengusulPos) {
          pengusulInfo = {
            nama: pengusulPos.persnum_person_text || null,
            jabatan: pengusulPos.position_text || null,
          };
        }
        // Nama divisi pengusul
        const divisiPengusul = positionJson.find(
          (p: any) => Number(p.organization_id) === Number(usulan?.divisi_pengusul_id),
        );
        divisiPengusulNama = divisiPengusul?.organization_text || null;
      }
    }

    return {
      ...berkas,
      judul_berkas: berkas.judulBerkas,
      klasifikasi_teks: berkas.klasifikasiTeks,
      permissions: entitlement?.permissions || ['LIHAT'],
      tanggal_mulai: entitlement?.tanggal_mulai || usulan?.tanggal_mulai || null,
      tanggal_selesai: entitlement?.tanggal_selesai || usulan?.tanggal_selesai || null,
      usulan_id: resolvedUsulanId,
      nomor_usulan: usulan?.nomor_usulan || null,
      divisi_pemberi_id: usulan?.divisi_pemberi_id || null,
      divisi_pemberi_nama: divisiPemberiNama,
      evp_pemberi_nama: evpPemberiNama,
      tujuan_akses: usulan?.tujuan_akses || null,
      // Info pengusul
      pengusul_info: pengusulInfo,
      divisi_pengusul_nama: divisiPengusulNama,
      judul_usulan: usulan?.judul_usulan || null,
      jenis_berkas: usulan?.jenis_berkas || null,
    };
  }

  // ── Naskah by Berkas (untuk Pemberian — lihat naskah di dalam berkas) ──

  /**
   * List naskah di dalam berkas tertentu.
   * Cek entitlement user untuk berkas ini sebelum return.
   */
  async getNaskahByBerkas(berkasId: string, user: any): Promise<any[]> {
    const userPersnum = Number(user.persnum);
    const userOrgId = Number(user.organization);

    // Cek akses: entitlement atau role dalam usulan
    const accessResult = await this.hasUsulanBerkasAccess(berkasId, userPersnum, userOrgId);
    if (!accessResult.allowed) {
      throw new ForbiddenException('Anda tidak memiliki akses ke berkas ini');
    }

    // Ambil entitlement untuk permissions (jika ada)
    const entitlement = await this.aksesRepo.findOne({
      where: { user_persnum: userPersnum, berkas_id: berkasId, is_revoked: false },
    });

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

    // Gabungkan — ubah final_pdf (key MinIO) jadi URL yang bisa diakses langsung
    const result = await Promise.all(
      berkasNaskahRows.map(async (bn: any) => {
        const naskah = naskahMap.get(bn.naskah_id);
        const finalPdfKey = naskah?.final_pdf || null;
        const finalPdf = finalPdfKey
          ? await this.storageService.getFileUrl(finalPdfKey)
          : null;
        return {
          id: bn.id,
          naskah_id: bn.naskah_id,
          berkas_id: bn.berkas_id,
          naskah_tipe: bn.naskah_tipe,
          sumber: bn.sumber,
          perihal: bn.perihal || naskah?.perihal || null,
          nomor_surat: bn.nomor_surat || naskah?.nomor || null,
          tanggal_naskah: bn.tanggal_naskah || naskah?.tanggal || null,
          urutan: bn.urutan,
          jenis: naskah?.jenis || null,
          sifat: naskah?.sifat || null,
          final_pdf: finalPdf,
          status: naskah?.status || null,
          permissions: entitlement?.permissions || ['LIHAT'],
        };
      }),
    );
    return result;
  }

  // ── Helper: cek apakah user punya akses ke berkas dalam konteks usulan ──
  // Selain entitlement langsung, izinkan: verifikator pemberi, SE pemberi, pengusul, verifikator pengusul
  private async hasUsulanBerkasAccess(
    berkasId: string,
    userPersnum: number,
    userOrgId: number,
  ): Promise<{ allowed: boolean; usulanId: string | null }> {
    const now = new Date();

    // 1. Cek entitlement langsung (peminjam/pengusul yang sudah diterbitkan)
    const entitlement = await this.aksesRepo.findOne({
      where: { user_persnum: userPersnum, berkas_id: berkasId, is_revoked: false },
    });
    if (entitlement) {
      if (entitlement.tanggal_selesai && new Date(entitlement.tanggal_selesai) < now) {
        return { allowed: false, usulanId: entitlement.usulan_id };
      }
      return { allowed: true, usulanId: entitlement.usulan_id };
    }

    // 2. Jika tidak ada entitlement, cek apakah user adalah pengelola (SE Pemberi / Verifikator Pemberi)
    // yang sedang mereview usulan terkait berkas ini.
    const usulanBerkasList = await this.usulanBerkasRepo.find({ where: { berkas_id: berkasId } });
    for (const ub of usulanBerkasList) {
      const usulan = await this.usulanRepo.findOne({ where: { id: ub.usulan_id } });
      if (usulan) {
        // Jika user adalah dari divisi pemberi (SE Pemberi)
        if (Number(usulan.divisi_pemberi_id) === userOrgId) {
          return { allowed: true, usulanId: usulan.id };
        }
        // Jika user adalah verifikator pemberi
        const isVerifikator = (usulan.verifikator_pemberi || []).some(
          (v: any) => Number(v.persnum) === userPersnum,
        );
        if (isVerifikator) {
          return { allowed: true, usulanId: usulan.id };
        }
      }
    }

    return { allowed: false, usulanId: null };
  }

  // ── getCounts: badge notifikasi untuk sidebar ──────────────────
  async getCounts(user: any): Promise<{
    menunggu_verifikasi: number;
    pilih_berkas: number;
    akses_diterbitkan_baru: number;
  }> {
    const userPersnum = Number(user.persnum);
    const userOrgId = Number(user.organization);

    // 1. Menunggu verifikasi: usulan yang user jadi verifikator & status menunggu
    //    Hanya dihitung JIKA SEKARANG ADALAH GILIRANNYA (berdasarkan status dan urutan).
    const conditions: string[] = [];

    // Pengusul
    conditions.push(`(u.status = '${StatusUsulan.MENUNGGU_VERIFIKASI_PENGUSUL}' AND JSON_CONTAINS(u.verifikator_pengusul, JSON_OBJECT('persnum', :userPersnum, 'urutan', 1)))`);
    conditions.push(`(u.status = '${StatusUsulan.MENUNGGU_VERIFIKASI_AKHIR_PENGUSUL}' AND JSON_CONTAINS(u.verifikator_pengusul, JSON_OBJECT('persnum', :userPersnum, 'urutan', 2)))`);
    conditions.push(`(u.status = '${StatusUsulan.MENUNGGU_VERIFIKASI_EVP_PENGUSUL}' AND JSON_CONTAINS(u.verifikator_pengusul, JSON_OBJECT('persnum', :userPersnum, 'urutan', 3)))`);

    // Pemberi
    conditions.push(`(u.status = '${StatusUsulan.MENUNGGU_PERSETUJUAN_PEMBERI}' AND JSON_CONTAINS(u.verifikator_pemberi, JSON_OBJECT('persnum', :userPersnum, 'urutan', 1)))`);
    conditions.push(`(u.status = '${StatusUsulan.MENUNGGU_PERSETUJUAN_AKHIR_PEMBERI}' AND JSON_CONTAINS(u.verifikator_pemberi, JSON_OBJECT('persnum', :userPersnum, 'urutan', 2)))`);
    conditions.push(`(u.status = '${StatusUsulan.MENUNGGU_PERSETUJUAN_EVP_PEMBERI}' AND JSON_CONTAINS(u.verifikator_pemberi, JSON_OBJECT('persnum', :userPersnum, 'urutan', 3)))`);

    // Sekretaris Pemberi
    if (user.roles?.includes('sekretaris') || user.is_sekretaris) {
      conditions.push(`(u.status = '${StatusUsulan.TERKIRIM_KE_PEMBERI}' AND u.divisi_pemberi_id = :userOrgId)`);
    }

    const verifyQb = this.usulanRepo.createQueryBuilder('u');
    verifyQb.where(`(${conditions.join(' OR ')})`, { userPersnum, userOrgId });
    
    // Exclude yang sudah viewed: viewedBy[persnum] tidak ada / null
    verifyQb.andWhere(
      `(u.viewed_by IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(u.viewed_by, '$."${userPersnum}"')) IS NULL)`,
    );
    const menungguVerifikasi = await verifyQb.getCount();

    // 2. Pilih berkas: usulan yang masuk ke divisi user sebagai pemberi & status
    //    PEMILIHAN_BERKAS / REVISI_PEMBERI. Exclude yang sudah dibuka user.
    let pilihBerkas = 0;
    if (user.roles?.includes('sekretaris') || user.is_sekretaris) {
      const pilihBerkasStatuses: string[] = [
        StatusUsulan.PEMILIHAN_BERKAS,
        StatusUsulan.REVISI_PEMBERI,
      ];
      const pilihBerkasQb = this.usulanRepo.createQueryBuilder('u');
      pilihBerkasQb.where('u.divisi_pemberi_id = :userOrgId', { userOrgId });
      pilihBerkasQb.andWhere('u.status IN (:...statuses)', { statuses: pilihBerkasStatuses });
      pilihBerkasQb.andWhere(
        `(u.viewed_by IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(u.viewed_by, '$."${userPersnum}"')) IS NULL)`,
      );
      pilihBerkas = await pilihBerkasQb.getCount();
    }

    // 3. Akses diterbitkan baru: entitlement user yang isRead=false & belum revoked.
    //    Konsisten dengan getMyEntitlements: hanya dari divisi pemberi LAIN
    //    (bukan divisi user sendiri), agar badge cocok dengan halaman Pemberian.
    const aksesDiterbitkanBaru = await this.aksesRepo
      .createQueryBuilder('a')
      .innerJoin(UsulanAksesBerkasEntity, 'u', 'u.id = a.usulan_id')
      .where('a.user_persnum = :userPersnum', { userPersnum })
      .andWhere('a.is_revoked = false')
      .andWhere('a.is_read = false')
      .andWhere('u.divisi_pemberi_id != :userOrgId', { userOrgId })
      .getCount();

    return { menunggu_verifikasi: menungguVerifikasi, pilih_berkas: pilihBerkas, akses_diterbitkan_baru: aksesDiterbitkanBaru };
  }

  // ── markEntitlementsRead: tandai entitlement user sebagai sudah dibaca ──
  async markEntitlementsRead(user: any): Promise<{ updated: number }> {
    const userPersnum = Number(user.persnum);
    const result = await this.aksesRepo.update(
      { user_persnum: userPersnum, is_read: false },
      { is_read: true },
    );
    return { updated: result.affected || 0 };
  }

  // ── markBerkasRead: tandai entitlement user untuk satu berkas sebagai dibaca ──
  async markBerkasRead(
    berkasId: string,
    user: any,
  ): Promise<{ updated: number }> {
    const userPersnum = Number(user.persnum);
    const result = await this.aksesRepo.update(
      { user_persnum: userPersnum, berkas_id: berkasId, is_read: false },
      { is_read: true },
    );
    return { updated: result.affected || 0 };
  }

  // ── markViewed: tandai usulan sebagai sudah dibuka/dilihat oleh user ──
  // Disimpan di viewedBy[persnum] = ISO timestamp.
  // Dipanggil dari FE saat user masuk ke halaman detail usulan.
  // Counts badge akan auto-exclude usulan ini pada next fetchCounts.
  async markViewed(usulanId: string, user: any): Promise<{ success: boolean }> {
    const userPersnum = Number(user.persnum);
    const usulan = await this.usulanRepo.findOne({ where: { id: usulanId } });
    if (!usulan) {
      throw new NotFoundException('Usulan tidak ditemukan');
    }
    const existing = (usulan.viewed_by as Record<string, string>) || {};
    existing[String(userPersnum)] = new Date().toISOString();
    usulan.viewed_by = existing;
    await this.usulanRepo.save(usulan);
    return { success: true };
  }
}