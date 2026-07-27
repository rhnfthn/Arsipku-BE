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
import { Berkas } from '../../berkas/entities/berkas.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';

/**
 * ID organization "Corporate Secretary Division" (TU)
 * Jika jenisBerkas = INAKTIF, divisi pemberi otomatis di-set ke divisi ini
 */
export const CORPORATE_SECRETARY_ORG_ID = 10002098;

/**
 * Level jabatan mapping (diparse dari position_text di position_json)
 */
type LevelJabatan = 'AVP' | 'VP' | 'EVP';
const LEVEL_ORDER: Record<LevelJabatan, number> = { AVP: 1, VP: 2, EVP: 3 };

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

  private sortVerifikator(
    verifikator: { persnum: number; levelJabatan: LevelJabatan }[],
  ): { persnum: number; levelJabatan: LevelJabatan; urutan: 1 | 2 | 3 }[] {
    return verifikator
      .map((v) => ({ ...v, urutan: LEVEL_ORDER[v.levelJabatan] as 1 | 2 | 3 }))
      .sort((a, b) => a.urutan - b.urutan);
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
    return managerial
      .map((v: any) => {
        const levelJabatan = this.parseLevelJabatan(v.position_text || '');
        if (!levelJabatan) return null;
        return {
          persnum: v.persnum_person,
          nama: v.persnum_person_text,
          positionId: v.position,
          jabatan: v.position_text,
          levelJabatan,
          urutan: LEVEL_ORDER[levelJabatan],
          divisiId: v.organization_id,
          divisiNama: v.organization_text,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.urutan - b.urutan);
  }

  // ── Endpoint: GET /verifikator ─────────────────────────────────

  async getVerifikator(userOrgId: number): Promise<any[]> {
    return this.getManagerialInDivisi(userOrgId);
  }

  // ── CREATE: Buat usulan baru ───────────────────────────────────

  async create(
    dto: CreateUsulanAksesBerkasDto,
    user: any,
  ): Promise<UsulanAksesBerkasEntity> {
    const userOrgId = Number(user.organization);
    const userPersnum = Number(user.persnum);

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

    // Validasi: verifikator harus dari divisi yang sama dengan pengusul
    const managerialInDivisi = await this.getManagerialInDivisi(userOrgId);
    const validPersnums = new Set(managerialInDivisi.map((m) => m.persnum));
    for (const v of dto.verifikatorPengusul) {
      if (!validPersnums.has(v.persnum)) {
        throw new BadRequestException(
          `Verifikator persnum ${v.persnum} tidak ada di divisi Anda atau bukan managerial`,
        );
      }
    }

    // Auto-sort verifikator bottom-to-top
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
    const { status, page = 1, limit = 20 } = params || {};
    const userPersnum = Number(user.persnum);
    const userOrgId = Number(user.organization);

    const qb = this.usulanRepo.createQueryBuilder('u');

    // Scope: user bisa lihat usulan yang dia buat ATAU yang masuk ke divisinya sebagai pemberi
    // ATAU yang dia jadi verifikator
    qb.where(
      '(u.pengusulPersnum = :userPersnum OR u.divisiPemberiId = :userOrgId)',
      { userPersnum, userOrgId },
    );

    if (status) {
      qb.andWhere('u.status = :status', { status });
    }

    qb.orderBy('u.updatedAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  // ── READ: Detail usulan ───────────────────────────────────────

  async findOne(id: string): Promise<any> {
    const usulan = await this.usulanRepo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    const steps = await this.stepRepo.find({
      where: { usulanId: id },
      order: { verifiedAt: 'ASC' },
    });

    const selectedBerkas = await this.usulanBerkasRepo.find({
      where: { usulanId: id },
    });

    return { ...usulan, steps, selectedBerkas };
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

    // Validasi: catatanRevisi wajib jika REVISI
    if (dto.keputusan === Keputusan.REVISI && !dto.catatanRevisi?.trim()) {
      throw new BadRequestException(
        'catatanRevisi wajib diisi untuk keputusan REVISI',
      );
    }

    // Simpan verification step
    const step = this.stepRepo.create({
      usulanId: id,
      verifierPersnum: userPersnum,
      roleTahap: `VERIFIKATOR_PENGUSUL_J${jenjang}`,
      urutanJenjang: jenjang,
      keputusan: dto.keputusan,
      catatan: dto.catatan || null,
      catatanRevisi: dto.catatanRevisi || null,
      checklist: {
        kelengkapanBerkas: dto.kelengkapanBerkas,
        kesesuaianTujuan: dto.kesesuaianTujuan,
        periodeWajar: dto.periodeWajar,
        suratSah: dto.suratSah,
        tidakDuplikasi: dto.tidakDuplikasi,
      },
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

    // Validasi: catatanPerubahanDurasi wajib jika durasi berubah
    if (
      dto.durasiAksesDisetujui !== usulan.durasiAkses &&
      !dto.catatanPerubahanDurasi?.trim()
    ) {
      throw new BadRequestException(
        'catatanPerubahanDurasi wajib diisi jika durasi diubah',
      );
    }

    // Simpan step
    const step = this.stepRepo.create();
    step.usulanId = id;
    step.verifierPersnum = Number(user.persnum);
    step.roleTahap = 'SEKRETARIS_PEMBERI';
    step.urutanJenjang = 0; // sekretaris bukan jenjang managerial
    step.keputusan = dto.keputusan;
    step.catatan = dto.catatan || null;
    step.checklist = {
      berkasTersedia: dto.berkasTersedia,
      tidakAdaPembatasan: dto.tidakAdaPembatasan,
      tujuanMemadai: dto.tujuanMemadai,
      tidakBentrokRetensi: dto.tidakBentrokRetensi,
      disetujuiLanjut: dto.disetujuiLanjut,
    };
    await this.stepRepo.save(step);

    if (dto.keputusan === Keputusan.TOLAK) {
      usulan.status = StatusUsulan.DITOLAK_PEMBERI;
    } else if (dto.keputusan === Keputusan.LANJUT) {
      usulan.status = StatusUsulan.PEMILIHAN_BERKAS;
      usulan.durasiAksesDisetujui = dto.durasiAksesDisetujui;
      usulan.catatanPerubahanDurasi = dto.catatanPerubahanDurasi || null;
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

    // Validasi: berkas harus milik divisi pemberi
    const berkasList = await this.berkasRepo.find({
      where: { id: In(dto.berkasIds) },
    });
    for (const b of berkasList) {
      // Cek kepemilikan: created_by atau pic_persnum harus di divisi pemberi
      // Untuk simplicity, kita cek via unit_pencipta_id atau pic
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

    // Validasi: verifikator pemberi harus dari divisi pemberi
    const managerialPemberi = await this.getManagerialInDivisi(usulan.divisiPemberiId);
    const validPersnumsPemberi = new Set(managerialPemberi.map((m) => m.persnum));
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

    if (dto.keputusan === Keputusan.REVISI && !dto.catatanRevisi?.trim()) {
      throw new BadRequestException(
        'catatanRevisi wajib diisi untuk keputusan REVISI',
      );
    }

    // Simpan step
    const step = this.stepRepo.create();
    step.usulanId = id;
    step.verifierPersnum = userPersnum;
    step.roleTahap = `VERIFIKATOR_PEMBERI_J${jenjang}`;
    step.urutanJenjang = jenjang;
    step.keputusan = dto.keputusan;
    step.catatan = dto.catatan || null;
    step.catatanRevisi = dto.catatanRevisi || null;
    step.checklist = {
      berkasSesuai: dto.berkasSesuai,
      tidakMelanggarKebijakan: dto.tidakMelanggarKebijakan,
      peminjamanTidakBerlebihan: dto.peminjamanTidakBerlebihan,
      sudahDiverifikasiSekretaris: dto.sudahDiverifikasiSekretaris,
      disetujuiDiberikan: dto.disetujuiDiberikan,
    };
    await this.stepRepo.save(step);

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
    const durasiHari =
      usulan.durasiAksesDisetujui &&
      usulan.durasiAksesDisetujui !== DurasiPreset.CUSTOM
        ? DURASI_PRESET_HARI[usulan.durasiAksesDisetujui]
        : 14; // default 14 hari
    const tanggalSelesai = new Date(tanggalMulai);
    tanggalSelesai.setDate(tanggalSelesai.getDate() + durasiHari);

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

  async getTrail(id: string): Promise<VerificationStepEntity[]> {
    return this.stepRepo.find({
      where: { usulanId: id },
      order: { verifiedAt: 'ASC' },
    });
  }
}