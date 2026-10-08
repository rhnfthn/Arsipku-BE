import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager } from 'typeorm';
import { Berkas, StatusBerkas } from '../../berkas/entities/berkas.entity';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { BerkasNaskah } from '../entities/berkas-naskah.entity';
import { BerkasVerifikasi } from '../entities/berkas-verifikasi.entity';
import { BerkasRiwayatRetensi } from '../entities/berkas-riwayat-retensi.entity';
import { KlasifikasiEntity } from '../../klasifikasi/entities/klasifikasi.entity';
import { StorageService } from '../../storage/services/storage.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { NaskahService } from '../../naskah/services/naskah.service';
import { NotificationService } from '../../notification/services/notification.service';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';
import { NotificationType } from '../../notification/entities/notification.entity';
import {
  CreateArsipDinamisBerkasDto,
  AddNaskahToBerkasDto,
  AjukanTutupBerkasDto,
  VerifikasiBerkasDto,
} from '../dto';
import { PDFDocument } from 'pdf-lib';

@Injectable()
export class ArsipDinamisService {
  constructor(
    @InjectRepository(Berkas)
    private readonly berkasRepository: Repository<Berkas>,
    @InjectRepository(BerkasNaskah)
    private readonly berkasNaskahRepository: Repository<BerkasNaskah>,
    @InjectRepository(BerkasVerifikasi)
    private readonly berkasVerifikasiRepository: Repository<BerkasVerifikasi>,
    @InjectRepository(BerkasRiwayatRetensi)
    private readonly berkasRiwayatRetensiRepository: Repository<BerkasRiwayatRetensi>,
    @InjectRepository(KlasifikasiEntity)
    private readonly klasifikasiRepository: Repository<KlasifikasiEntity>,
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly orgDataService: OrgDataService,
    private readonly naskahService: NaskahService,
    private readonly notificationService: NotificationService,
    private readonly realtimeEmitService: RealtimeEmitService,
  ) {}

  // ── File pendukung berkas (foto lokasi fisik & dokumen pendukung) ──

  async uploadBerkasFile(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<{ key: string }> {
    const result = await this.storageService.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      'berkas',
    );
    return { key: result.key };
  }

  async getBerkasFile(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!key || !key.startsWith('berkas/') || key.includes('..')) {
      throw new ForbiddenException('Akses ditolak: key file tidak valid');
    }
    const { buffer, contentType } =
      await this.storageService.getFileWithMetadata(key);
    return { buffer, contentType };
  }

  // ── Helper: Generate Kode Berkas ────────────────────────────────

  // ponytail: gap-lock range TITELATUR-YYYY-% via FOR UPDATE on the unique index
  // to serialize concurrent createBerkas; switch to a counter table if
  // create throughput ever matters.
  // Format kode berkas: TITELATUR-TAHUN-NOMOR (mis. UC-2026-0001).
  // TITELATUR = abbreviation posisi user pembuat berkas (dari org_data).
  // Bila posisi user (staf) tidak punya abbreviation, ambil abbreviation
  // dari EVP divisi user (chief=1, position_text mengandung EVP, divisi sama).
  private async generateKodeBerkas(
    manager: EntityManager,
    user: {
      position?: string | number;
      organization?: string | number | null;
      divisiId?: string | number | null;
    },
  ): Promise<string> {
    const year = new Date().getFullYear();
    const titelatur = await this.resolveTitelatur(user);

    const rows = await manager
      .getRepository(Berkas)
      .createQueryBuilder('b')
      .select('b.kode_berkas', 'kode_berkas')
      .where('b.kode_berkas LIKE :pattern', {
        pattern: `${titelatur}-${year}-%`,
      })
      .setLock('pessimistic_write')
      .getRawMany();

    // Hitung MAX nomor urut, bukan count — kalau ada berkas dihapus di tengah
    // (gap), count tidak sesuai dengan nomor terbesar dan bisa duplicate.
    let maxSeq = 0;
    for (const row of rows) {
      const kode = String(row?.kode_berkas || '');
      const match = kode.match(new RegExp(`^${titelatur}-\\d+-(\\d+)$`));
      if (match) {
        const n = Number(match[1]);
        if (n > maxSeq) maxSeq = n;
      }
    }
    const seq = String(maxSeq + 1).padStart(4, '0');
    return `${titelatur}-${year}-${seq}`;
  }

  /**
   * Resolve kode titelatur untuk user pembuat berkas:
   * 1. abbreviation posisi user sendiri (dari org_data position_json).
   * 2. Bila kosong ('-'/null) → abbreviation EVP atasan user: EVP di unit
   *    kerja yang sama (organization_id ATAU divisi_id sama dengan
   *    organization JWT user), chief=1, position_text mengandung 'EVP'.
   * 3. Bila tetap kosong → fallback 'ARS'.
   */
  private async resolveTitelatur(user: {
    position?: string | number;
    organization?: string | number | null;
    divisiId?: string | number | null;
  }): Promise<string> {
    try {
      const org = await this.orgDataService.findLatestOrg();
      const positions: any[] = org?.position_json ?? [];
      if (!Array.isArray(positions) || positions.length === 0) return 'ARS';

      const userPosition = Number(user?.position);
      // JWT tidak membawa divisiId — pakai organization (unit kerja user)
      // sebagai kunci pencocokan EVP. divisiId tetap didukung bila ada.
      const userUnit = Number(user?.divisiId ?? user?.organization);

      const clean = (v: any) => {
        const s = String(v ?? '').trim();
        return s && s !== '-' ? s.toUpperCase() : '';
      };

      // 1. Abbreviation posisi user sendiri
      if (userPosition) {
        const pos = positions.find((p) => Number(p?.position) === userPosition);
        const abbr = clean(pos?.position_abbreviation);
        if (abbr) return abbr;
      }

      // 2. Staf tanpa abbreviation → abbreviation EVP di unit kerja yang sama.
      //    Staf divisi punya organization_id == divisi_id, jadi cek keduanya.
      if (userUnit) {
        const evp = positions.find(
          (p) =>
            (Number(p?.organization_id) === userUnit ||
              Number(p?.divisi_id) === userUnit) &&
            Number(p?.chief) === 1 &&
            /\bEVP\b/i.test(String(p?.position_text || '')),
        );
        const abbr = clean(evp?.position_abbreviation);
        if (abbr) return abbr;
      }

      return 'ARS';
    } catch {
      return 'ARS';
    }
  }

  // ── Helper: Hitung Tanggal Retensi ──────────────────────────────

  /** Kunci partisi tanggal tabel anak arsip-dinamis = tanggal_dibuat berkas.
   *  Fallback hari ini untuk berkas lama (tanggal_dibuat masih NULL). */
  private tanggalBerkas(berkas: Berkas): Date {
    return berkas.tanggalDibuat ? new Date(berkas.tanggalDibuat) : new Date();
  }

  private hitungTanggalRetensi(
    tanggalDibuat: string,
    tanggalDitutup: string | null,
    retensiAktifTahun: number,
    retensiInaktifTahun: number,
    hitungDari: string,
  ): { aktifBerakhir: string; inaktifBerakhir: string } {
    const baseDate =
      hitungDari === 'Sejak Berkas Dibuat' || !tanggalDitutup
        ? new Date(tanggalDibuat)
        : new Date(tanggalDitutup);

    const aktifBerakhir = new Date(baseDate);
    aktifBerakhir.setFullYear(aktifBerakhir.getFullYear() + retensiAktifTahun);

    const inaktifBerakhir = new Date(aktifBerakhir);
    inaktifBerakhir.setFullYear(
      inaktifBerakhir.getFullYear() + retensiInaktifTahun,
    );

    return {
      aktifBerakhir: aktifBerakhir.toISOString().split('T')[0],
      inaktifBerakhir: inaktifBerakhir.toISOString().split('T')[0],
    };
  }

  // ── CRUD Berkas ─────────────────────────────────────────────────

  async createBerkas(
    dto: CreateArsipDinamisBerkasDto,
    user: any,
  ): Promise<Berkas> {
    const userId = Number(user?.persnum ?? user);
    let klasifikasiTeks = dto.klasifikasi_text;
    let retensiAktif = dto.retensi_aktif_tahun;
    let retensiInaktif = dto.retensi_inaktif_tahun;

    if (dto.klasifikasi) {
      const klasifikasi = await this.klasifikasiRepository.findOne({
        where: { klasifikasi: dto.klasifikasi },
      });
      if (klasifikasi) {
        klasifikasiTeks = klasifikasi.klasifikasi_text;
        // Auto-fill retensi dari master klasifikasi (tidak bisa di-override)
        retensiAktif = klasifikasi.retensi_aktif_tahun || 0;
        retensiInaktif = klasifikasi.retensi_inaktif_tahun || 0;
      }
    }

    const tanggalDibuat = new Date().toISOString().split('T')[0];

    // Hitung tanggal retensi-end di saat create bila dasar "Sejak Berkas Dibuat".
    // Untuk "Sejak Berkas Ditutup", retensi-end dihitung saat close (approveVerifikasi) — spec §14.6.4
    let tanggalRetensiAktifBerakhir: string | undefined = undefined;
    let tanggalRetensiInaktifBerakhir: string | undefined = undefined;
    if (
      dto.hitung_waktu_retensi_dari === 'Sejak Berkas Dibuat' &&
      retensiAktif !== undefined &&
      retensiAktif > 0
    ) {
      const { aktifBerakhir, inaktifBerakhir } = this.hitungTanggalRetensi(
        tanggalDibuat,
        null,
        retensiAktif,
        retensiInaktif || 0,
        dto.hitung_waktu_retensi_dari,
      );
      tanggalRetensiAktifBerakhir = aktifBerakhir;
      tanggalRetensiInaktifBerakhir = inaktifBerakhir;
    }

    // Generate kode + insert dalam transaksi yang sama agar FOR UPDATE
    // pada generateKodeBerkas serialisasi terhadap createBerkas bersamaan.
    return this.dataSource.transaction(async (manager) => {
      const kodeBerkas = await this.generateKodeBerkas(manager, {
        position: (user as any)?.position,
        organization: (user as any)?.organization,
        divisiId: (user as any)?.divisiId ?? (user as any)?.divisi_id,
      });
      const berkas = manager.create(Berkas, {
        klasifikasi: dto.klasifikasi,
        klasifikasiTeks,
        judulBerkas: dto.judul_berkas,
        hitungWaktuRetensiDari: dto.hitung_waktu_retensi_dari,
        tindakanPenyusutanAkhir: dto.tindakan_penyusutan_akhir,
        lokasi: dto.lokasi,
        isiRingkas: dto.isi_ringkas,
        kategoriBerkas: dto.kategori_berkas,
        retensiAktifTahun: retensiAktif,
        retensiInaktifTahun: retensiInaktif,
        fotoLokasiFisik: dto.foto_lokasi_fisik,
        dokumenPendukung: dto.dokumen_pendukung,
        unitPenciptaId: dto.unit_pencipta_id,
        picPersnum: dto.pic_persnum,
        picPositionId: dto.pic_position_id,
        kodeBerkas,
        tanggalDibuat,
        tanggalRetensiAktifBerakhir,
        tanggalRetensiInaktifBerakhir,
        status: StatusBerkas.AKTIF,
        createdBy: userId,
        updatedBy: userId,
      });

      return manager.save(berkas);
    });
  }

  async findAllBerkas(
    userId: number,
    isTu: boolean,
    options: {
      status?: string;
      klasifikasi?: string;
      kategori?: string;
      tahun?: string;
      search?: string;
      page?: number;
      limit?: number;
      sortBy?: string; // judulBerkas | kodeBerkas | klasifikasiTeks | lokasi | status | updatedAt
      sortDir?: string; // asc | desc (default desc)
    } = {},
  ) {
    const {
      status,
      klasifikasi,
      kategori,
      tahun,
      search,
      page = 1,
      limit = 20,
      sortBy,
      sortDir,
    } = options;

    // Evaluasi retensi on-demand agar status di list selalu segar
    await this.tutupBerkasRetensiHabis();

    const qb = this.berkasRepository
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL');

    // Scope: user biasa hanya melihat berkas miliknya/unitnya. Berkas Tertutup
    // dan Retensi Inaktif tetap tampil untuk pembuatnya walau retensinya sudah
    // habis (status "Tertutup" + lanjut alur pemindahan inaktif). Berkas baru
    // disembunyikan setelah benar-benar diarsipkan/dimusnahkan (deleted_at).
    // TU (unit_dokumen) melihat semua berkas tertutup + retensi inaktif + berkas miliknya.
    if (isTu) {
      qb.andWhere(
        '(b.status = :closed OR b.status = :inaktif OR b.created_by = :userId OR b.pic_persnum = :userPersnum)',
        {
          closed: StatusBerkas.CLOSED_RETENSI_AKTIF,
          inaktif: StatusBerkas.RETAIL_INAKTIF,
          userId,
          userPersnum: String(userId),
        },
      );
    } else {
      qb.andWhere('(b.created_by = :userId OR b.pic_persnum = :userPersnum)', {
        userId,
        userPersnum: String(userId),
      });

      // Semua status berkas milik user tetap ditampilkan, termasuk berkas
      // yang sudah disetujui/ditutup dan berkas retensi inaktif. Penyembunyian
      // hanya berdasarkan deleted_at agar sekretaris tetap dapat melihat
      // berkas yang sudah selesai diverifikasi.
    }

    if (status) {
      qb.andWhere('b.status = :status', { status });
    }
    if (klasifikasi) {
      qb.andWhere('b.klasifikasi = :klasifikasi', { klasifikasi });
    }
    if (kategori) {
      qb.andWhere('b.kategori_berkas = :kategori', { kategori });
    }
    if (tahun) {
      qb.andWhere('YEAR(b.tanggal_dibuat) = :tahun', { tahun });
    }
    if (search) {
      qb.andWhere(
        '(b.judul_berkas LIKE :search OR b.kode_berkas LIKE :search OR b.kategori_berkas LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Sort whitelist (FE column key -> kolom DB) supaya sortBy tidak bisa jadi SQL injection.
    const SORT_MAP: Record<string, string> = {
      judulBerkas: 'b.judul_berkas',
      kodeBerkas: 'b.kode_berkas',
      klasifikasiTeks: 'b.klasifikasi_text',
      lokasi: 'b.lokasi',
      status: 'b.status',
      updatedAt: 'b.updated_at',
    };
    qb.orderBy(
      SORT_MAP[sortBy ?? ''] ?? 'b.updated_at',
      sortDir === 'asc' ? 'ASC' : 'DESC',
    );
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Daftar berkas milik user (Berkas Saya) dengan:
   * - status Tertutup (closed_retensi_aktif)
   * - retensi aktif sudah habis (tanggal_retensi_aktif_berakhir <= hari ini)
   * Dipakai oleh modul Pemindahan Arsip Aktif ke Inaktif.
   */
  async findBerkasRetensiHabis(
    userId: number,
    options: { search?: string; page?: number; limit?: number } = {},
  ) {
    const { search, page = 1, limit = 100 } = options;

    // Evaluasi retensi on-demand: berkas yang baru habis retensinya langsung
    // ikut masuk daftar, tanpa menunggu cron 2AM.
    await this.tutupBerkasRetensiHabis();

    const qb = this.berkasRepository
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL');

    // Scope: berkas milik user
    qb.andWhere('(b.created_by = :userId OR b.pic_persnum = :userPersnum)', {
      userId,
      userPersnum: String(userId),
    });

    // Status Tertutup
    qb.andWhere('b.status = :status', {
      status: StatusBerkas.CLOSED_RETENSI_AKTIF,
    });

    // Retensi aktif sudah habis
    qb.andWhere('b.tanggal_retensi_aktif_berakhir IS NOT NULL');
    qb.andWhere('b.tanggal_retensi_aktif_berakhir <= :today', {
      today: new Date().toISOString().split('T')[0],
    });

    if (search) {
      qb.andWhere(
        '(b.judul_berkas LIKE :search OR b.kode_berkas LIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('b.tanggal_retensi_aktif_berakhir', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneBerkas(id: string): Promise<Berkas> {
    // Evaluasi retensi on-demand: status berkas yang retensi aktifnya habis
    // langsung jadi closed_retensi_aktif, tidak menunggu cron 2AM.
    await this.tutupBerkasRetensiHabis();
    const berkas = await this.berkasRepository
      .createQueryBuilder('b')
      .where('b.id = :id', { id })
      .andWhere('b.deleted_at IS NULL')
      .getOne();
    if (!berkas) {
      throw new NotFoundException(`Berkas dengan ID ${id} tidak ditemukan`);
    }
    return berkas;
  }

  /**
   * Tutup otomatis berkas aktif yang masa retensi aktifnya sudah habis.
   * Dipanggil on-demand di jalur read retensi (status langsung segar, tanpa
   * menunggu cron 2AM) dan oleh RetensiSchedulerService sebagai safety net.
   * Idempotent: setelah status berubah jadi closed_retensi_aktif, tidak lagi
   * cocok dengan query, jadi tidak ada double-insert riwayat.
   */
  async tutupBerkasRetensiHabis(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];

    const expired = await this.berkasRepository
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL')
      .andWhere('b.status = :status', { status: StatusBerkas.AKTIF })
      .andWhere('b.tanggal_retensi_aktif_berakhir IS NOT NULL')
      .andWhere('b.tanggal_retensi_aktif_berakhir <= :today', { today })
      .getMany();

    if (expired.length === 0) return 0;

    for (const berkas of expired) {
      await this.berkasRepository.update(
        { id: berkas.id },
        { status: StatusBerkas.CLOSED_RETENSI_AKTIF },
      );
      // Naskah dalam berkas yang ditutup → inaktif (disembunyikan dari user biasa)
      await this.berkasNaskahRepository.update(
        { berkasId: berkas.id, status: 'aktif' },
        { status: 'inaktif' },
      );
      await this.berkasRiwayatRetensiRepository.insert({
        berkasId: berkas.id,
        tanggal: this.tanggalBerkas(berkas),
        statusSebelumnya: StatusBerkas.AKTIF,
        statusBaru: StatusBerkas.CLOSED_RETENSI_AKTIF,
        tanggalPerubahan: today,
        diprosesOleh: 0,
        keterangan: 'Auto-close: masa retensi aktif berakhir',
      });
    }

    return expired.length;
  }

  /**
   * Detail berkas + resolusi PIC & Unit Pencipta dari org_data.
   * Pencipta (pembuat berkas) = created_by (persnum) → sumber unit pencipta & fallback PIC.
   * PIC: pic_persnum bila ada, fallback ke pembuat berkas (form create tidak selalu mengisi PIC).
   */
  async getDetailBerkas(id: string): Promise<Berkas> {
    const berkas = await this.findOneBerkas(id);

    let pencipta: any = null;
    if (berkas.createdBy) {
      try {
        pencipta = await this.orgDataService.findByPersnum(
          Number(berkas.createdBy),
        );
      } catch {
        pencipta = null;
      }
    }
    (berkas as any).penciptaNama = pencipta?.nama || null;
    (berkas as any).unitPenciptaNama = pencipta?.organizationText || null;

    const picPersnum = berkas.picPersnum || berkas.createdBy;
    let pic: any = null;
    if (picPersnum) {
      try {
        pic = await this.orgDataService.findByPersnum(Number(picPersnum));
      } catch {
        pic = null;
      }
    }
    (berkas as any).picNama = pic?.nama || null;
    (berkas as any).picJabatan = pic?.positionText || null;

    return berkas;
  }

  async updateBerkas(
    id: string,
    dto: Partial<CreateArsipDinamisBerkasDto>,
    userId: number,
  ): Promise<Berkas> {
    const berkas = await this.findOneBerkas(id);

    if (
      berkas.status !== StatusBerkas.AKTIF &&
      berkas.status !== StatusBerkas.DITOLAK
    ) {
      throw new BadRequestException(
        'Berkas hanya bisa diubah saat status Terbuka atau Verifikasi Ditolak Managerial',
      );
    }

    // Update fields yang dikirim
    if (dto.judul_berkas) berkas.judulBerkas = dto.judul_berkas;
    if (dto.klasifikasi) {
      berkas.klasifikasi = dto.klasifikasi;
      const klasifikasi = await this.klasifikasiRepository.findOne({
        where: { klasifikasi: dto.klasifikasi },
      });
      if (klasifikasi) {
        berkas.klasifikasiTeks = klasifikasi.klasifikasi_text;
        // Retensi selalu ikut klasifikasi (read-only, tidak bisa di-override user) — spec §14.3
        berkas.retensiAktifTahun = klasifikasi.retensi_aktif_tahun || 0;
        berkas.retensiInaktifTahun = klasifikasi.retensi_inaktif_tahun || 0;
      }
    }
    if (dto.kategori_berkas !== undefined)
      berkas.kategoriBerkas = dto.kategori_berkas;
    // retensi_aktif_tahun & retensi_inaktif_tahun sengaja TIDAK dibaca dari dto
    // (read-only, hanya diisi dari klasifikasi) — spec §14.3.
    if (dto.lokasi) berkas.lokasi = dto.lokasi;
    if (dto.isi_ringkas) berkas.isiRingkas = dto.isi_ringkas;
    if (dto.foto_lokasi_fisik !== undefined)
      berkas.fotoLokasiFisik = dto.foto_lokasi_fisik;
    if (dto.dokumen_pendukung !== undefined)
      berkas.dokumenPendukung = dto.dokumen_pendukung;
    if (dto.pic_persnum !== undefined) berkas.picPersnum = dto.pic_persnum;
    if (dto.pic_position_id !== undefined)
      berkas.picPositionId = dto.pic_position_id;

    berkas.updatedBy = userId;

    return this.berkasRepository.save(berkas);
  }

  /** Aktifkan berkas (Draft → Aktif). */
  async activateBerkas(
    id: string,
    userId: number,
  ): Promise<{ message: string; statusBerkas: string }> {
    const berkas = await this.findOneBerkas(id);
    if (berkas.status !== StatusBerkas.DRAFT) {
      throw new BadRequestException(
        'Hanya berkas dengan status Draft yang dapat diaktifkan',
      );
    }
    berkas.status = StatusBerkas.AKTIF;
    berkas.updatedBy = userId;
    await this.berkasRepository.save(berkas);
    return {
      message: 'Berkas berhasil diaktifkan',
      statusBerkas: berkas.status,
    };
  }

  async softDeleteBerkas(
    id: string,
    userId: number,
  ): Promise<{ message: string }> {
    const berkas = await this.findOneBerkas(id);
    const berkasId = id;
    if (berkas.status !== StatusBerkas.AKTIF) {
      throw new BadRequestException('Hanya berkas Terbuka yang dapat dihapus');
    }
    const naskahCount = await this.berkasNaskahRepository.count({
      where: { berkasId } as any,
    });
    if (naskahCount > 0) {
      throw new BadRequestException(
        'Berkas Terbuka yang masih memiliki naskah tidak dapat dihapus. Lepaskan naskah terlebih dahulu.',
      );
    }
    berkas.deletedAt = new Date();
    berkas.updatedBy = userId;
    await this.berkasRepository.save(berkas);
    return { message: 'Berkas berhasil dihapus' };
  }

  // ── Statistik Berkas ────────────────────────────────────────────

  async getStatistikBerkas(userId: number, isTu: boolean) {
    const base = this.berkasRepository
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL')
      .andWhere('(b.created_by = :userId OR b.pic_persnum = :userPersnum)', {
        userId,
        userPersnum: String(userId),
      });

    // Berkas tertutup hanya dihitung untuk TU (unit_dokumen); user biasa
    // tidak melihatnya sama sekali.
    const [draft, aktif, menunggu, ditolak, closed] = await Promise.all([
      base.clone().andWhere('b.status = :s', { s: 'draft' }).getCount(),
      base.clone().andWhere('b.status = :s', { s: 'aktif' }).getCount(),
      base
        .clone()
        .andWhere('b.status = :s', { s: 'menunggu_verifikasi' })
        .getCount(),
      base.clone().andWhere('b.status = :s', { s: 'ditolak' }).getCount(),
      isTu
        ? base
            .clone()
            .andWhere('b.status = :s', { s: 'closed_retensi_aktif' })
            .getCount()
        : Promise.resolve(0),
    ]);

    return {
      draft,
      aktif,
      menunggu_verifikasi: menunggu,
      ditolak,
      closed_retensi_aktif: closed,
    };
  }

  // ── Naskah Berkas ───────────────────────────────────────────────

  async addNaskahToBerkas(
    berkasId: string,
    dto: AddNaskahToBerkasDto,
    userId: number,
    userPosition?: string,
    positions?: number[],
  ): Promise<{
    message: string;
    count: number;
    rejected?: string[];
    alreadyExists?: string[];
  }> {
    const berkas = await this.findOneBerkas(berkasId);

    if (
      berkas.status !== StatusBerkas.AKTIF &&
      berkas.status !== StatusBerkas.DITOLAK
    ) {
      throw new BadRequestException(
        'Naskah hanya bisa ditambahkan ke berkas dengan status Aktif atau Ditolak',
      );
    }

    const requestedIds = [...new Set(dto.naskah_ids.filter(Boolean))];
    if (requestedIds.length === 0) {
      return { message: 'Tidak ada naskah yang dipilih', count: 0 };
    }

    // Naskah konsep (jenis 'K') tidak boleh diberkaskan — hanya naskah final
    // yang sudah dikirim/diterima. Tolak lebih awal agar tidak lolos lewat
    // request manual (di luar daftar kandidat FE).
    const konsepRows: any[] = await this.dataSource.query(
      `SELECT id FROM naskah WHERE id IN (?) AND jenis = 'K'`,
      [requestedIds],
    );
    if (konsepRows.length > 0) {
      throw new BadRequestException(
        'Naskah konsep tidak dapat ditambahkan ke berkas',
      );
    }

    // Naskah yang sudah berada di berkas TERTUTUP (closed_retensi_aktif /
    // retensi_inaktif) tidak boleh dipindahkan ke berkas lain — arsipnya sudah
    // final. Naskah di berkas AKTIF boleh dipindah (pindah folder).
    const lockedRows: any[] = await this.dataSource.query(
      `SELECT DISTINCT bn.naskah_id, b.kode_berkas
       FROM berkas_naskah bn
       INNER JOIN berkas b ON b.id = bn.berkas_id
       WHERE bn.naskah_id IN (?)
         AND b.status IN ('closed_retensi_aktif', 'retensi_inaktif')
         AND b.deleted_at IS NULL`,
      [requestedIds],
    );
    if (lockedRows.length > 0) {
      const kode = lockedRows.map((r: any) => r.kode_berkas).join(', ');
      throw new BadRequestException(
        `Naskah sudah berada di berkas yang sudah ditutup (${kode}) dan tidak bisa dipindahkan`,
      );
    }

    // Konteks sirkulasi: naskah yang user (position) adalah pengirim/penerima.
    // Naskah yang sama boleh masuk ke berkas unit berbeda (per id_sirkuler).
    // Sekretaris (positions dari divisi/unitnya) boleh menambah atas nama seluruh
    // anggota unit — konsisten dengan daftar kandidat yang mereka lihat.
    // 'tembusan' ikut diterima: kandidat tampil di modal (sirkuler tembusan),
    // jadi harus bisa ditambahkan juga, bukan ditolak diam-diam.
    const scopePosition = positions?.length
      ? In(positions.map(String))
      : userPosition;
    const sirkulasiRows = scopePosition
      ? await this.dataSource.manager.find(NaskahSirkulasi, {
          where: {
            idNaskah: In(requestedIds),
            position: scopePosition,
            sirkuler: In(['pengirim', 'penerima', 'tembusan']),
          },
        })
      : [];
    const sirkulasiByNaskah = new Map<string, NaskahSirkulasi>();
    for (const s of sirkulasiRows) {
      if (!s.idNaskah) continue; // query filter idNaskah IN, guard null utk TS
      const existing = sirkulasiByNaskah.get(s.idNaskah);
      // prefer penerima, lalu pengirim, lalu tembusan (satu position bisa punya >1 sirkulasi)
      const rank = (v?: string | null) =>
        v === 'penerima' ? 3 : v === 'pengirim' ? 2 : 1;
      if (!existing || rank(s.sirkuler) > rank(existing.sirkuler)) {
        sirkulasiByNaskah.set(s.idNaskah, s);
      }
    }

    // ── Sumber naskah_lainnya: tidak lewat naskah_sirkulasi ──
    // Pemrakarsa disimpan di dikirim_oleh (JSON snapshot). Validasi: HANYA
    // persnum user = pemrakarsa (naskah pribadi — sekretaris pun tidak boleh
    // menambahkan naskah lainnya milik anggota divisi lain).
    let nlIds: string[] = [];
    if (dto.sumber === 'naskah_lainnya') {
      const placeholders = requestedIds.map(() => '?').join(',');
      const nlRows: any[] = await this.dataSource.query(
        `SELECT n.id FROM naskah n
         WHERE n.id IN (${placeholders})
           AND n.jenis IN ('PER','KEP','INS','SPR','EDR','SOP','MOU','PKS','PROC','PJJ','LOA','SKU','BAC','KET','SPE','RPT','PEN','PGM','LAP')
           AND JSON_EXTRACT(n.dikirim_oleh, '$.persnum') = ?`,
        [...requestedIds, String(userId)],
      );
      nlIds = nlRows.map((r: any) => r.id);
    }

    const allowedIds = requestedIds.filter(
      (id) => sirkulasiByNaskah.has(id) || nlIds.includes(id),
    );
    const rejectedIds = requestedIds.filter((id) => !allowedIds.includes(id));

    if (allowedIds.length === 0) {
      return {
        message:
          'Tidak ada naskah yang bisa ditambahkan: user bukan pengirim/penerima dari naskah yang dipilih',
        count: 0,
        rejected: rejectedIds,
      };
    }

    // Cek duplikasi per (berkas, naskah, id_sirkuler) — bukan per naskah saja
    const existing = await this.berkasNaskahRepository.find({
      where: {
        berkasId,
        naskahId: In(allowedIds),
      },
    });
    const existingKeys = new Set(
      existing.map((e) => `${e.naskahId}|${e.idSirkuler ?? ''}`),
    );
    const newEntries = allowedIds
      .map((naskahId) => {
        const s = sirkulasiByNaskah.get(naskahId);
        return { naskahId, s, key: `${naskahId}|${s?.idSirkuler ?? ''}` };
      })
      .filter((e) => !existingKeys.has(e.key));

    if (newEntries.length === 0) {
      return {
        message: 'Semua naskah sudah ada di berkas ini',
        count: 0,
        rejected: rejectedIds,
      };
    }

    // Ambil metadata naskah dari tabel naskah (raw query karena tidak ada FK)
    const naskahMeta: any[] = await this.dataSource.query(
      `SELECT id, perihal, nomor, tanggal, jenis FROM naskah WHERE id IN (?)`,
      [newEntries.map((e) => e.naskahId)],
    );
    const metaMap = new Map<string, any>(naskahMeta.map((n: any) => [n.id, n]));

    const entities = newEntries.map(({ naskahId, s }, idx) => {
      const meta = metaMap.get(naskahId) as any;
      return this.berkasNaskahRepository.create({
        berkasId,
        tanggal: this.tanggalBerkas(berkas),
        naskahId,
        naskahTipe: meta?.jenis || 'unknown',
        // Naskah Lainnya tidak punya sirkulasi → default 'pengirim' (pemrakarsa)
        sirkuler: (s?.sirkuler ?? 'pengirim') as 'pengirim' | 'penerima',
        idSirkuler: s?.idSirkuler ?? null,
        sumber: dto.sumber,
        perihal: meta?.perihal || null,
        nomorSurat: meta?.nomor || null,
        tanggalNaskah: meta?.tanggal || null,
        urutan: idx,
        createdBy: userId,
      });
    });

    const insertResult = await this.berkasNaskahRepository
      .createQueryBuilder()
      .insert()
      .into(BerkasNaskah)
      .values(entities)
      .orIgnore()
      .execute();

    const insertedCount = Number(insertResult.raw?.affectedRows ?? 0);
    const alreadyExistsCount = newEntries.length - insertedCount;

    // Emit realtime berkas:update ke semua position pemilik sirkulasi
    // naskah yang berhasil ditambahkan — agar kolom Status Berkas di
    // Kotak Masuk/Terkirim user lain (mis. sekretaris atas nama atasan)
    // langsung sinkron tanpa refresh manual. Fail-safe: gagal emit
    // tidak menggagalkan operasi.
    if (insertedCount > 0) {
      const positionsByNaskah = new Map<string, Set<string>>();
      for (const { naskahId } of newEntries) {
        const rows: any[] = await this.dataSource.query(
          `SELECT DISTINCT position FROM naskah_sirkulasi
           WHERE id_naskah = ?
             AND position IS NOT NULL
             AND sirkuler IN ('pengirim', 'penerima', 'tembusan')`,
          [naskahId],
        );
        const positions = positionsByNaskah.get(naskahId) ?? new Set<string>();
        rows.forEach((r: any) => positions.add(String(r.position)));
        positionsByNaskah.set(naskahId, positions);
      }
      const occurredAt = new Date().toISOString();
      for (const [naskahId, positions] of positionsByNaskah) {
        for (const positionId of positions) {
          this.realtimeEmitService.emitBerkasUpdate(positionId, {
            naskah_id: naskahId,
            action: 'add',
            berkas_id: berkas.id,
            kode_berkas: berkas.kodeBerkas,
            judul_berkas: berkas.judulBerkas,
            berkas_status: berkas.status,
            occurred_at: occurredAt,
          });
        }
      }
    }

    const message = [
      insertedCount > 0 ? `${insertedCount} naskah berhasil ditambahkan` : null,
      alreadyExistsCount > 0
        ? `${alreadyExistsCount} sudah ada di berkas`
        : null,
      rejectedIds.length > 0
        ? `${rejectedIds.length} ditolak (bukan pengirim/penerima)`
        : null,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      message: message || 'Tidak ada perubahan',
      count: insertedCount,
      rejected: rejectedIds,
      alreadyExists: alreadyExistsCount > 0 ? [] : undefined,
    };
  }

  async removeNaskahFromBerkas(
    berkasId: string,
    naskahId: string,
    userId: number,
  ): Promise<{ message: string }> {
    const berkas = await this.findOneBerkas(berkasId);

    if (
      berkas.status !== StatusBerkas.AKTIF &&
      berkas.status !== StatusBerkas.DITOLAK
    ) {
      throw new BadRequestException(
        'Naskah hanya bisa dihapus dari berkas Aktif atau Ditolak',
      );
    }

    // Naskah yang sama bisa tercatat >1 baris (id_sirkuler berbeda, unique
    // (berkas_id, naskah_id, id_sirkuler, tanggal)) — hapus semua, bukan satu.
    const relasi = await this.berkasNaskahRepository.find({
      where: { berkasId, naskahId },
    });
    if (relasi.length === 0) {
      throw new NotFoundException('Naskah tidak ditemukan di berkas ini');
    }

    await this.berkasNaskahRepository.remove(relasi);

    // Emit realtime berkas:update ke semua position pemilik sirkulasi agar
    // label Status Berkas kembali ke "Belum Diberkaskan" tanpa refresh.
    // Fail-safe: gagal emit tidak menggagalkan operasi.
    try {
      const positions: any[] = await this.dataSource.query(
        `SELECT DISTINCT position FROM naskah_sirkulasi
         WHERE id_naskah = ?
           AND position IS NOT NULL
           AND sirkuler IN ('pengirim', 'penerima', 'tembusan')`,
        [naskahId],
      );
      const occurredAt = new Date().toISOString();
      for (const row of positions) {
        this.realtimeEmitService.emitBerkasUpdate(String(row.position), {
          naskah_id: naskahId,
          action: 'remove',
          berkas_id: berkas.id,
          kode_berkas: berkas.kodeBerkas,
          judul_berkas: berkas.judulBerkas,
          berkas_status: berkas.status,
          occurred_at: occurredAt,
        });
      }
    } catch {
      // ignore — realtime sync best-effort
    }

    return { message: 'Naskah berhasil dihapus dari berkas' };
  }

  /** Count berkas yg sedang menunggu persetujuan user ini (giliran dia). */
  private async countMenungguSaya(persnum: string): Promise<number> {
    try {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*) AS total FROM berkas_verifikasi bv
         INNER JOIN berkas b ON b.id = bv.berkas_id
         WHERE bv.verifikator_persnum = ? AND b.deleted_at IS NULL
           AND bv.status = 'pending' AND b.status = 'menunggu_verifikasi'
           AND NOT EXISTS (SELECT 1 FROM berkas_verifikasi earlier
                           WHERE earlier.berkas_id = bv.berkas_id
                             AND earlier.status = 'pending'
                             AND earlier.urutan < bv.urutan)`,
        [String(persnum)],
      );
      return Number(row?.total || 0);
    } catch {
      return 0;
    }
  }

  /** Emit realtime count "menunggu saya" ke user (by persnum). */
  private async emitCountForVerifikator(persnum: string) {
    const waiting = await this.countMenungguSaya(persnum);
    this.realtimeEmitService.emitArsipPersetujuanCountUser(
      Number(persnum),
      waiting,
    );
  }

  async getDaftarNaskah(
    berkasId: string,
    options: { search?: string; page?: number; limit?: number } = {},
  ) {
    const { search, page = 1, limit = 20 } = options;

    const qb = this.berkasNaskahRepository
      .createQueryBuilder('bn')
      .where('bn.berkas_id = :berkasId', { berkasId });

    // Status inaktif hanya menandai retensi aktif berakhir. Selama relasi
    // masih ada di DB utama, naskah tetap dapat dilihat. Relasi dihapus saat
    // berkas benar-benar diarsipkan atau dimusnahkan.

    if (search) {
      qb.andWhere('(bn.perihal LIKE :search OR bn.nomor_surat LIKE :search)', {
        search: `%${search}%`,
      });
    }

    qb.orderBy('bn.urutan', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Jumlah pada daftar isi adalah jumlah halaman PDF final masing-masing naskah.
    // Gagal membaca satu PDF tidak boleh menggagalkan seluruh daftar naskah.
    const naskahIds = data.map((item) => item.naskahId).filter(Boolean);
    const jumlahHalamanMap = new Map<string, number | null>();
    if (naskahIds.length > 0) {
      const placeholders = naskahIds.map(() => '?').join(',');
      const fileRows: Array<{ id: string; file_key: string | null }> =
        await this.dataSource.query(
          `SELECT id, COALESCE(final_pdf, signed_lampiran) AS file_key
           FROM naskah WHERE id IN (${placeholders})`,
          naskahIds,
        );

      await Promise.all(
        fileRows.map(async (fileRow) => {
          if (!fileRow.file_key) {
            jumlahHalamanMap.set(fileRow.id, null);
            return;
          }
          try {
            const { buffer } = await this.storageService.getFileWithMetadata(
              fileRow.file_key,
            );
            const pdf = await PDFDocument.load(buffer, {
              ignoreEncryption: true,
            });
            jumlahHalamanMap.set(fileRow.id, pdf.getPageCount());
          } catch {
            jumlahHalamanMap.set(fileRow.id, null);
          }
        }),
      );
    }

    return {
      data: data.map((item) => ({
        ...item,
        jumlahHalaman: jumlahHalamanMap.get(item.naskahId) ?? null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Detail naskah + rangkaian (chain) dibuka dalam konteks berkas (sebagai
   * anggota pemberkasan/persetujuan), bukan sebagai peserta korespondensi.
   * Tampilan sama persis dengan detail naskah di kotak masuk/terkirim.
   * Akses dijaga guard PemeliharaanAccess di controller; di sini cukup pastikan
   * naskah memang tercatat di berkas ini (anti enumerasi id naskah sembarang).
   */
  async getNaskahDetailInBerkas(berkasId: string, naskahId: string) {
    const relasi = await this.berkasNaskahRepository.findOne({
      where: { berkasId, naskahId },
      select: ['naskahId', 'status'],
    });
    if (!relasi) {
      throw new NotFoundException('Naskah tidak ditemukan di berkas ini');
    }
    // Naskah tetap dapat dibuka selama relasinya masih ada di DB utama.
    return this.naskahService.getDetailWithChainForBerkas(naskahId);
  }

  /**
   * Presigned URL PDF final sebuah naskah (untuk preview di modal Tambah Naskah,
   * sebelum naskah masuk berkas). Naskah harus final/final_tte dan punya
   * final_pdf. Akses dijaga guard PemeliharaanAccess di controller.
   */
  async getNaskahPdfUrl(naskahId: string): Promise<{ url: string | null }> {
    const rows: any[] = await this.dataSource.query(
      `SELECT final_pdf, status FROM naskah WHERE id = ? LIMIT 1`,
      [naskahId],
    );
    const naskah = rows?.[0];
    if (!naskah) {
      throw new NotFoundException('Naskah tidak ditemukan');
    }
    if (!naskah.final_pdf) {
      return { url: null };
    }
    const url = await this.storageService.getPreviewUrl(naskah.final_pdf);
    return { url };
  }

  async getNaskahPdfFile(
    naskahId: string,
  ): Promise<{ buffer: Buffer; contentLength: number }> {
    const rows: any[] = await this.dataSource.query(
      `SELECT final_pdf FROM naskah WHERE id = ? LIMIT 1`,
      [naskahId],
    );
    const naskah = rows?.[0];
    if (!naskah) throw new NotFoundException('Naskah tidak ditemukan');
    if (!naskah.final_pdf) {
      throw new NotFoundException('Naskah tidak memiliki PDF final');
    }

    const { buffer, contentLength } =
      await this.storageService.getFileWithMetadata(naskah.final_pdf);
    return { buffer, contentLength };
  }

  // ── Naskah Siap Arsip (Tab Filtering) ───────────────────────────

  /**
   * Posisi yang boleh dilihat user pada pemilihan naskah (modal Tambah Naskah):
   * - Delegasi SE (sekretaris bertindak atas nama delegator, mis. EVP):
   *   SEMUA posisi di org delegator sendiri (termasuk posisi delegator) DAN
   *   SEMUA posisi di unit/divisi yang BERADA DI BAWAH delegator (descendant
   *   orgs dari org tempat delegator duduk) — sekretaris dapat memilih semua
   *   naskah dari divisi tersebut.
   * - Sekretaris role biasa (organization_tu 'sekretaris', non-delegasi):
   *   SEMUA posisi di divisi/unit yang sama (BOD, BOD-1, BOD-2, BOD-3, STAFF).
   * - Selain itu: undefined → query memakai subquery posisi pribadi (perilaku lama).
   */
  async resolveScopePositions(user: any): Promise<number[] | undefined> {
    const isDelegatedSekretaris = user?.position_status === 'SE';
    const isRoleSekretaris =
      !isDelegatedSekretaris &&
      Array.isArray(user?.tuRoles) &&
      user.tuRoles.includes('sekretaris');
    if (!isDelegatedSekretaris && !isRoleSekretaris) return undefined;
    const selfPosition = Number(user?.position);
    if (!Number.isFinite(selfPosition)) return undefined;

    try {
      const orgData = await this.orgDataService.findLatestOrg();

      // Delegasi SE: scope = descendant orgs dari org tempat delegator duduk.
      // Contoh: delegator = "EVP of Air Navigation Information Management"
      // (chief divisi) → scope = posisi di unit/divisi di bawah divisi tersebut,
      // BUKAN posisi di divisi delegator sendiri.
      if (isDelegatedSekretaris) {
        const scope = this.collectScopeTree(orgData, selfPosition);
        if (!scope || scope.positions.length === 0) return undefined;
        return [...new Set(scope.positions)];
      }

      // Sekretaris role biasa (non-delegasi): scope divisi sendiri (perilaku lama).
      const rows = Array.isArray(orgData?.position_json)
        ? orgData.position_json
        : typeof orgData?.position_json === 'string'
          ? JSON.parse(orgData.position_json)
          : [];
      if (!Array.isArray(rows)) return undefined;

      const self = rows.find((x: any) => Number(x.position) === selfPosition);
      if (!self) return undefined;
      const divisiId = Number(self?.divisi_id ?? self?.organization_id);
      if (!Number.isFinite(divisiId)) return undefined;

      const positions = rows
        .filter(
          (x: any) => Number(x.divisi_id ?? x.organization_id) === divisiId,
        )
        .map((x: any) => Number(x.position))
        .filter((p: number) => Number.isFinite(p));
      return positions.length > 0 ? [...new Set(positions)] : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Nama org (divisi/unit) dalam scope delegasi SE — untuk filter divisi modal
   * Tambah Naskah agar semua unit tampil walau tanpa naskah. Bukan SE → [].
   */
  async getScopeDivisi(user: any): Promise<string[]> {
    if (user?.position_status !== 'SE') return [];
    const selfPosition = Number(user?.position);
    if (!Number.isFinite(selfPosition)) return [];
    try {
      const orgData = await this.orgDataService.findLatestOrg();
      const scope = this.collectScopeTree(orgData, selfPosition);
      return scope ? [...new Set(scope.orgNames)] : [];
    } catch {
      return [];
    }
  }

  /**
   * Cari node org tempat delegator duduk lalu kumpulkan posisi & nama org
   * keturunan (descendants). Dipakai resolveScopePositions (posisi) dan
   * getScopeDivisi (nama divisi filter). Undefined bila posisi tidak ditemukan.
   */
  private collectScopeTree(
    orgData: any,
    selfPosition: number,
  ): { positions: number[]; orgNames: string[] } | undefined {
    const tree = Array.isArray(orgData?.organization_json)
      ? orgData.organization_json
      : typeof orgData?.organization_json === 'string'
        ? JSON.parse(orgData.organization_json)
        : [];
    if (!Array.isArray(tree)) return undefined;

    const findNode = (nodes: any[]): any | null => {
      for (const node of nodes) {
        if (
          Array.isArray(node?.positions) &&
          node.positions.some((p: any) => Number(p?.position) === selfPosition)
        ) {
          return node;
        }
        const found = findNode(
          Array.isArray(node?.children) ? node.children : [],
        );
        if (found) return found;
      }
      return null;
    };
    const delegatorNode = findNode(tree);
    if (!delegatorNode) return undefined;

    const positions: number[] = [];
    const orgNames: string[] = [];

    // SEMUA posisi di org delegator sendiri ikut scope (termasuk posisi delegator
    // sendiri) — sekretaris bisa memilih semua naskah dari divisi tersebut.
    for (const p of Array.isArray(delegatorNode?.positions)
      ? delegatorNode.positions
      : []) {
      const pid = Number(p?.position);
      if (Number.isFinite(pid)) positions.push(pid);
    }
    if (typeof delegatorNode?.name === 'string' && delegatorNode.name.trim()) {
      orgNames.push(delegatorNode.name);
    }

    const collectDescendants = (node: any) => {
      for (const child of Array.isArray(node?.children) ? node.children : []) {
        if (typeof child?.name === 'string' && child.name.trim()) {
          orgNames.push(child.name);
        }
        for (const p of Array.isArray(child?.positions)
          ? child.positions
          : []) {
          const pid = Number(p?.position);
          if (Number.isFinite(pid)) positions.push(pid);
        }
        collectDescendants(child);
      }
    };
    collectDescendants(delegatorNode);
    return { positions, orgNames };
  }

  /**
   * Posisi yang dipakai untuk menentukan atasan-managerial (verifikator) pengaju.
   * Delegasi SE (Sekretaris): user.position adalah jabatan yang didelegasikan
   * (mis. EVP), BUKAN jabatan asli pengaju — resolve jabatan asli via persnum,
   * sama seperti FE (GET /org-data/my-position). Delegasi lain (PT/PH/PS/VI)
   * tetap pakai jabatan yang didelegasikan.
   */
  private async resolvePengajuPositionId(user: any): Promise<number> {
    if (user?.position_status === 'SE') {
      try {
        const orgData = await this.orgDataService.findLatestOrg();
        const rows = Array.isArray(orgData?.position_json)
          ? orgData.position_json
          : typeof orgData?.position_json === 'string'
            ? JSON.parse(orgData.position_json)
            : [];
        const myRow = rows.find(
          (x: any) => Number(x.persnum_person) === Number(user?.persnum),
        );
        if (myRow?.position) return Number(myRow.position);
      } catch {
        // fallback ke posisi delegasi di bawah
      }
    }
    const position = Number(user?.position);
    return Number.isFinite(position) && position > 0 ? position : 0;
  }

  /**
   * Kandidat Naskah Lainnya (jenis PER/KEP/INS/... — workflow Naskah Lainnya)
   * untuk tab "Naskah Lainnya" di modal Tambah Naskah ke Berkas.
   * Naskah Lainnya tidak lewat naskah_sirkulasi — pemrakarsa disimpan di
   * dikirim_oleh (JSON snapshot). Hanya naskah final/final_tte dengan PDF.
   */
  async getNaskahLainnyaKandidat(
    userId: number,
    berkasId: string,
    options: { search?: string; page?: number; limit?: number } = {},
    positions?: number[],
  ) {
    const { search, page = 1, limit = 20 } = options;

    const jenisList = [
      'PER',
      'KEP',
      'INS',
      'SPR',
      'EDR',
      'SOP',
      'MOU',
      'PKS',
      'PROC',
      'PJJ',
      'LOA',
      'SKU',
      'BAC',
      'KET',
      'SPE',
      'RPT',
      'PEN',
      'PGM',
      'LAP',
    ];
    const jenisPlaceholders = jenisList.map(() => '?').join(',');

    // Scope posisi: sekretaris → seluruh posisi divisi/unit; lainnya → posisi pribadi.
    const positionClause = positions?.length
      ? `n.dikirim_oleh LIKE ? OR n.dikirim_oleh LIKE ?`
      : `n.dikirim_oleh LIKE ? OR n.dikirim_oleh LIKE ?`;
    // Match position_id ATAU persnum di JSON dikirim_oleh (sama dengan getList NL).
    const posId = positions?.length ? positions.map(String) : [String(userId)];

    let query = `
      SELECT
        n.id,
        n.nomor AS nomor_surat,
        n.perihal,
        n.tanggal AS tanggal_naskah,
        n.jenis AS naskah_tipe,
        n.status,
        COALESCE(n.signed_lampiran, n.final_pdf) AS final_pdf,
        COALESCE(
          JSON_UNQUOTE(JSON_EXTRACT(n.dikirim_oleh, '$.position_text')),
          n.created_by_position
        ) AS jabatan,
        COALESCE(
          JSON_UNQUOTE(JSON_EXTRACT(n.dikirim_oleh, '$.nama')),
          n.created_by_position
        ) AS nama,
        JSON_UNQUOTE(JSON_EXTRACT(n.dikirim_oleh, '$.organization')) AS divisi_id,
        'naskah_lainnya' AS sumber,
        0 AS sudah_masuk_berkas,
        NULL AS kode_berkas,
        NULL AS berkas_status
      FROM naskah n
      WHERE n.jenis IN (${jenisPlaceholders})
        AND n.status IN ('final', 'final_tte')
        AND (n.signed_lampiran IS NOT NULL OR n.final_pdf IS NOT NULL)
        AND (n.tahapan IS NULL OR n.tahapan NOT IN ('konsep', 'legal_drafting', 'blanko_verbal'))
    `;
    const params: any[] = [...jenisList];

    // Scope: HANYA pemrakarsa = user itu sendiri (persnum). Naskah Lainnya
    // adalah naskah pribadi pemrakarsa — tidak di-share ke divisi seperti
    // naskah dinas (kotak masuk/terkirim). Sekretaris pun tidak boleh melihat
    // naskah lainnya milik anggota divisi lain.
    query += ` AND JSON_EXTRACT(n.dikirim_oleh, '$.persnum') = ?`;
    params.push(String(userId));

    // Exclude naskah yang sudah di berkas ini
    const existingNaskah = await this.berkasNaskahRepository.find({
      where: { berkasId },
      select: ['naskahId'],
    });
    const excludeIds = existingNaskah.map((n) => n.naskahId);
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(',');
      query += ` AND n.id NOT IN (${placeholders})`;
      params.push(...excludeIds);
    }

    if (search) {
      query += ` AND (n.perihal LIKE ? OR n.nomor LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    // Count total
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS sub`;
    const [{ total }] = await this.dataSource.query(countQuery, params);

    // Paginate
    query += ` ORDER BY n.tanggal DESC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    const data = await this.dataSource.query(query, params);

    // Tandai naskah yang sudah masuk berkas lain (konsisten dengan tab Siap Arsip)
    let rows = data;
    if (rows.length) {
      const statusMap: any[] = await this.dataSource.query(
        `SELECT DISTINCT bn.naskah_id, b.kode_berkas, b.status AS berkas_status
         FROM berkas_naskah bn
         INNER JOIN berkas b ON b.id = bn.berkas_id
         WHERE bn.naskah_id IN (${rows.map(() => '?').join(',')})
           AND b.deleted_at IS NULL`,
        rows.map((r: any) => r.id),
      );
      const byId = new Map(statusMap.map((x: any) => [x.naskah_id, x]));
      rows = rows.map((r: any) => {
        const s = byId.get(r.id);
        return {
          ...r,
          sudah_masuk_berkas: s ? 1 : 0,
          kode_berkas: s?.kode_berkas || null,
          berkas_status: s?.berkas_status || null,
        };
      });
    }

    // Resolve nama divisi dari org_data (dikirim_oleh hanya menyimpan kode
    // organization, bukan nama — sama seperti kolom lain di modal).
    if (rows.length) {
      try {
        const orgData = await this.orgDataService.findLatestOrg();
        const barisData: any[] = Array.isArray(orgData?.position_json)
          ? orgData.position_json
          : [];
        // Map organization_id → organization_text (baris position_json punya
        // organization_id + organization_text per posisi).
        const orgNameMap = new Map<string, string>();
        for (const p of barisData) {
          const orgId = String(p.organization_id ?? '');
          const orgText = p.organization_text ?? '';
          if (orgId && orgText && !orgNameMap.has(orgId)) {
            orgNameMap.set(orgId, orgText);
          }
        }
        rows = rows.map((r: any) => ({
          ...r,
          divisi:
            orgNameMap.get(String(r.divisi_id ?? '')) ?? r.divisi_id ?? null,
        }));
      } catch {
        // Fallback: tampilkan kode apa adanya
        rows = rows.map((r: any) => ({
          ...r,
          divisi: r.divisi_id ?? null,
        }));
      }
    }

    return {
      data: rows,
      meta: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  async getNaskahSiapArsip(
    userId: number,
    berkasId: string,
    options: { search?: string; page?: number; limit?: number } = {},
    positions?: number[],
  ) {
    const { search, page = 1, limit = 20 } = options;

    // Scope posisi: sekretaris → seluruh posisi divisi/unit; lainnya → posisi
    // pribadi user (om_relation_sp: relasi person → position aktif hari ini).
    // NOTE: JANGAN pakai subquery pa_personal — tabel itu tidak punya kolom
    // position, dan MySQL me-resolve 'position' sebagai kolom outer (ns.position)
    // sehingga ns.position = ns.position selalu TRUE → semua naskah bocor.
    const positionClause = positions?.length
      ? `ns.position IN (${positions.map(() => '?').join(',')})`
      : `ns.position IN (SELECT position FROM om_relation_sp WHERE relation_persnum = ? AND end_date >= CURDATE())`;
    const positionParams: any[] = positions?.length
      ? positions.map(String)
      : [String(userId)];

    // Naskah yang sudah masuk berkas ini → exclude
    const existingNaskah = await this.berkasNaskahRepository.find({
      where: { berkasId },
      select: ['naskahId'],
    });
    const excludeIds = existingNaskah.map((n) => n.naskahId);

    // Satu baris per naskah. Kotak masuk minimal sudah dibaca, sedangkan
    // seluruh naskah terkirim yang final dapat dipilih.
    // Sekretaris: scope = seluruh posisi divisi/unitnya (resolveScopePositions),
    // bukan hanya posisi pribadi. Identitas partisipan utama (jabatan/nama/divisi)
    // diambil dari sirkulasi pengirim (fallback penerima/tembusan) — dipakai kolom
    // & filter di modal Tambah Naskah.
    let query = `
      SELECT
        n.id,
        n.nomor AS nomor_surat,
        n.perihal,
        n.tanggal AS tanggal_naskah,
        n.jenis AS naskah_tipe,
        n.status,
        n.final_pdf,
        -- Prefiks delegasi sementara (PT./PH.) dibuang agar naskah tampil atas
        -- nama jabatan utama (mis. "EVP of ..."), bukan varian pelaksana.
        COALESCE(
          MAX(CASE WHEN ns.sirkuler = 'pengirim' THEN REGEXP_REPLACE(ns.position_text, '^(PT|PH)\\.\\s*', '') END),
          MAX(CASE WHEN ns.sirkuler IN ('penerima', 'tembusan') THEN REGEXP_REPLACE(ns.position_text, '^(PT|PH)\\.\\s*', '') END)
        ) AS jabatan,
        COALESCE(
          MAX(CASE WHEN ns.sirkuler = 'pengirim' THEN ns.nama_sirkuler END),
          MAX(CASE WHEN ns.sirkuler IN ('penerima', 'tembusan') THEN ns.nama_sirkuler END)
        ) AS nama,
        COALESCE(
          MAX(CASE WHEN ns.sirkuler = 'pengirim' THEN ns.organization_text END),
          MAX(CASE WHEN ns.sirkuler IN ('penerima', 'tembusan') THEN ns.organization_text END)
        ) AS divisi,
        CASE
          WHEN MAX(CASE WHEN ns.sirkuler = 'pengirim' THEN 1 ELSE 0 END) = 1
            THEN 'pengirim'
          ELSE 'penerima'
        END AS sirkuler,
        CASE
          WHEN MAX(CASE WHEN ns.sirkuler = 'pengirim' THEN 1 ELSE 0 END) = 1
            THEN 'terkirim'
          ELSE 'kotak_masuk'
        END AS sumber
      FROM naskah n
      INNER JOIN naskah_sirkulasi ns ON ns.id_naskah = n.id
      WHERE ${positionClause}
        AND n.status IN ('final', 'final_tte')
        AND n.final_pdf IS NOT NULL
        AND n.jenis != 'K'
        AND ns.is_konsep = 0
        AND ns.is_draft = 0
        AND ns.sirkuler IN ('penerima', 'tembusan', 'pengirim')
        AND (
          ns.sirkuler = 'pengirim'
          OR (ns.sirkuler IN ('penerima', 'tembusan') AND ns.send_read_time IS NOT NULL)
        )
    `;
    const params: any[] = positionParams;

    // Exclude naskah yang sudah di berkas ini
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(',');
      query += ` AND n.id NOT IN (${placeholders})`;
      params.push(...excludeIds);
    }

    if (search) {
      query += ` AND (n.perihal LIKE ? OR n.nomor LIKE ? OR ns.nama_sirkuler LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` GROUP BY n.id, n.nomor, n.perihal, n.tanggal, n.jenis, n.status, n.final_pdf`;

    // Count total
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS sub`;
    const [{ total }] = await this.dataSource.query(countQuery, params);

    // Paginate
    query += ` ORDER BY n.tanggal DESC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    const data = await this.dataSource.query(query, params);

    return {
      data,
      meta: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  // ── Naskah Saya (semua status, untuk tab KM/Terkirim di modal Tambah Naskah) ──

  async getNaskahSaya(
    userId: number,
    tab: 'kotak_masuk' | 'terkirim',
    isTu: boolean,
    options: { search?: string; page?: number; limit?: number } = {},
    positions?: number[],
  ) {
    const { search, page = 1, limit = 50 } = options;
    const sirkulerFilter =
      tab === 'terkirim'
        ? `ns.sirkuler = 'pengirim'`
        : `ns.sirkuler IN ('penerima', 'tembusan')`;

    // Scope posisi: sekretaris → seluruh posisi divisi/unit; lainnya → posisi
    // pribadi user (om_relation_sp: relasi person → position aktif hari ini).
    // NOTE: JANGAN pakai subquery pa_personal — tabel itu tidak punya kolom
    // position, dan MySQL me-resolve 'position' sebagai kolom outer (ns.position)
    // sehingga ns.position = ns.position selalu TRUE → semua naskah bocor.
    const positionClause = positions?.length
      ? `ns.position IN (${positions.map(() => '?').join(',')})`
      : `ns.position IN (SELECT position FROM om_relation_sp WHERE relation_persnum = ? AND end_date >= CURDATE())`;
    const positionParams: any[] = positions?.length
      ? positions.map(String)
      : [String(userId)];

    // Naskah inaktif (berkas ditutup) tidak menampilkan status berkasnya ke
    // user biasa — hanya TU yang melihat asosiasi berkas tertutup.
    const joinBerkasNaskah = isTu
      ? 'LEFT JOIN berkas_naskah bn ON bn.naskah_id = n.id'
      : "LEFT JOIN berkas_naskah bn ON bn.naskah_id = n.id AND bn.status = 'aktif'";

    let query = `
      SELECT
        n.id,
        n.nomor AS nomor_surat,
        n.perihal,
        n.tanggal AS tanggal_naskah,
        n.jenis AS naskah_tipe,
        n.status,
        n.final_pdf,
        -- Prefiks delegasi sementara (PT./PH.) dibuang agar naskah tampil atas
        -- nama jabatan utama (mis. "EVP of ..."), bukan varian pelaksana.
        COALESCE(
          MAX(CASE WHEN ns.sirkuler = 'pengirim' THEN REGEXP_REPLACE(ns.position_text, '^(PT|PH)\\.\\s*', '') END),
          MAX(CASE WHEN ns.sirkuler IN ('penerima', 'tembusan') THEN REGEXP_REPLACE(ns.position_text, '^(PT|PH)\\.\\s*', '') END)
        ) AS jabatan,
        COALESCE(
          MAX(CASE WHEN ns.sirkuler = 'pengirim' THEN ns.nama_sirkuler END),
          MAX(CASE WHEN ns.sirkuler IN ('penerima', 'tembusan') THEN ns.nama_sirkuler END)
        ) AS nama,
        COALESCE(
          MAX(CASE WHEN ns.sirkuler = 'pengirim' THEN ns.organization_text END),
          MAX(CASE WHEN ns.sirkuler IN ('penerima', 'tembusan') THEN ns.organization_text END)
        ) AS divisi,
        MAX(CASE WHEN bn.naskah_id IS NOT NULL THEN 1 ELSE 0 END) AS sudah_masuk_berkas,
        GROUP_CONCAT(DISTINCT b.kode_berkas) AS kode_berkas,
        GROUP_CONCAT(DISTINCT b.status) AS berkas_status
      FROM naskah n
      INNER JOIN naskah_sirkulasi ns ON ns.id_naskah = n.id
      ${joinBerkasNaskah}
      LEFT JOIN berkas b ON b.id = bn.berkas_id AND b.deleted_at IS NULL
      WHERE ${positionClause}
        AND ${sirkulerFilter}
        AND n.jenis != 'K'
        AND ns.is_konsep = 0
    `;
    const params: any[] = positionParams;

    if (search) {
      query += ` AND (n.perihal LIKE ? OR n.nomor LIKE ? OR ns.nama_sirkuler LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` GROUP BY n.id, n.nomor, n.perihal, n.tanggal, n.jenis, n.status, n.final_pdf`;

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS sub`;
    const [{ total }] = await this.dataSource.query(countQuery, params);

    query += ` ORDER BY n.tanggal DESC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    const data = await this.dataSource.query(query, params);

    return {
      data,
      meta: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  // ── Penutupan & Verifikasi ──────────────────────────────────────

  async ajukanTutupBerkas(
    berkasId: string,
    dto: AjukanTutupBerkasDto,
    user: any,
  ): Promise<{ message: string }> {
    const userId = Number(user?.persnum);
    const berkas = await this.findOneBerkas(berkasId);

    if (
      berkas.status !== StatusBerkas.AKTIF &&
      berkas.status !== StatusBerkas.DITOLAK
    ) {
      throw new BadRequestException(
        'Hanya berkas Aktif atau Ditolak yang bisa diajukan penutupan',
      );
    }

    // Validasi: minimal 1 naskah sebelum penutupan
    const naskahCount = await this.berkasNaskahRepository.count({
      where: { berkasId } as any,
    });
    if (naskahCount < 1) {
      throw new BadRequestException(
        'Berkas belum memiliki naskah. Tambahkan minimal 1 naskah sebelum mengajukan penutupan.',
      );
    }

    // Validasi: minimal 1, maksimal 3 verifikator
    if (dto.verifikator.length < 1 || dto.verifikator.length > 3) {
      throw new BadRequestException('Jumlah verifikator harus 1-3 orang');
    }

    const persnums = dto.verifikator.map((item) => item.verifikator_persnum);
    if (new Set(persnums).size !== persnums.length) {
      throw new BadRequestException('Verifikator tidak boleh duplikat');
    }

    if (persnums.includes(String(userId))) {
      throw new BadRequestException('Pengaju tidak dapat menjadi verifikator');
    }

    // Validasi ulang: verifikator wajib atasan managerial pengaju (pola sama
    // dengan dropdown FE — getAtasanManagerial). Mencegah request termanipulasi
    // memasukkan verifikator di luar garis pelaporan.
    const pengajuPositionId = await this.resolvePengajuPositionId(user);
    if (pengajuPositionId <= 0) {
      throw new BadRequestException(
        'Posisi pengaju tidak ditemukan, tidak dapat memvalidasi verifikator',
      );
    }
    const atasanRes =
      await this.orgDataService.getAtasanManagerial(pengajuPositionId);
    const validPersnums = new Set(
      (atasanRes?.data ?? []).map((v: any) => String(v.persnum_person)),
    );
    const invalid = dto.verifikator.filter(
      (v) => !validPersnums.has(String(v.verifikator_persnum)),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Verifikator ${invalid
          .map((v) => v.verifikator_persnum)
          .join(', ')} bukan atasan managerial pengaju`,
      );
    }

    // Hapus baris verifikasi lama (penolakan sebelumnya) agar timeline pengajuan
    // ulang bersih, bukan menumpuk rejected-lama + pending-baru. Riwayat penolakan
    // tetap tersimpan di audit log (riwayat aksi status sebelumnya/baru).
    await this.berkasVerifikasiRepository.delete({ berkasId });

    // Simpan verifikator
    const verifikatorEntities = dto.verifikator.map((v, idx) =>
      this.berkasVerifikasiRepository.create({
        berkasId,
        tanggal: this.tanggalBerkas(berkas),
        urutan: idx + 1,
        verifikatorPersnum: v.verifikator_persnum,
        verifikatorPositionId: v.verifikator_position_id,
        jabatanVerifikator: v.jabatan_verifikator,
        status: 'pending',
      }),
    );
    await this.berkasVerifikasiRepository.save(verifikatorEntities);

    // Update status berkas
    berkas.catatanPenutupan = dto.catatan?.trim() || null;
    berkas.status = StatusBerkas.MENUNGGU_VERIFIKASI;
    berkas.updatedBy = userId;
    await this.berkasRepository.save(berkas);

    // Realtime + notifikasi ke verifikator aktif (urutan 1). Gagal tidak batalkan pengajuan.
    try {
      const aktif = verifikatorEntities[0];
      if (aktif) {
        await this.emitCountForVerifikator(aktif.verifikatorPersnum);
        await this.notificationService.createNotification(
          {
            positionId: String(aktif.verifikatorPositionId),
            userPersnum: Number(aktif.verifikatorPersnum),
            type: NotificationType.BERKAS_VERIFIKASI,
            title: 'Persetujuan penutupan berkas',
            body: `Berkas "${berkas.judulBerkas}" menunggu persetujuan Anda`,
            data: { berkasId, kodeBerkas: berkas.kodeBerkas },
          },
          false, // in-app only, no FCM
        );
      }
    } catch (err: any) {
      console.warn(
        '[arsip-dinamis] realtime/notif ajukan gagal:',
        err?.message,
      );
    }

    return { message: 'Pengajuan penutupan berkas berhasil dikirim' };
  }

  async approveVerifikasi(
    berkasId: string,
    verifikatorPersnum: string,
    dto: VerifikasiBerkasDto,
  ): Promise<{ message: string; statusBerkas: string }> {
    const berkas = await this.findOneBerkas(berkasId);

    if (berkas.status !== StatusBerkas.MENUNGGU_VERIFIKASI) {
      throw new BadRequestException(
        'Berkas tidak dalam status menunggu verifikasi',
      );
    }

    // Cek apakah user adalah verifikator yang sedang aktif (urutan terdepan)
    const currentVerifikator = await this.berkasVerifikasiRepository.findOne({
      where: { berkasId, status: 'pending' },
      order: { urutan: 'ASC' },
    });

    if (
      !currentVerifikator ||
      currentVerifikator.verifikatorPersnum !== verifikatorPersnum
    ) {
      throw new ForbiddenException('Anda bukan verifikator yang sedang aktif');
    }

    // Approve verifikator saat ini
    currentVerifikator.status = 'approved';
    currentVerifikator.catatan = dto.catatan;
    currentVerifikator.actionAt = new Date();
    await this.berkasVerifikasiRepository.save(currentVerifikator);

    // Cek apakah masih ada verifikator berikutnya
    const nextVerifikator = await this.berkasVerifikasiRepository.findOne({
      where: { berkasId, status: 'pending' },
      order: { urutan: 'ASC' },
    });

    // Realtime count update: approver (−) & next verifikator (+). Gagal tidak batalkan approve.
    try {
      await this.emitCountForVerifikator(verifikatorPersnum);
      if (nextVerifikator) {
        await this.emitCountForVerifikator(nextVerifikator.verifikatorPersnum);
      }
    } catch (err: any) {
      console.warn('[arsip-dinamis] realtime approve gagal:', err?.message);
    }

    if (nextVerifikator) {
      // Masih ada verifikator berikutnya → kirim notifikasi ke verifikator berikutnya
      try {
        await this.notificationService.createNotification(
          {
            positionId: String(nextVerifikator.verifikatorPositionId),
            userPersnum: Number(nextVerifikator.verifikatorPersnum),
            type: NotificationType.BERKAS_VERIFIKASI,
            title: 'Persetujuan penutupan berkas',
            body: `Berkas "${berkas.judulBerkas}" menunggu persetujuan Anda`,
            data: { berkasId, kodeBerkas: berkas.kodeBerkas },
          },
          false,
        );
      } catch (e) {
        console.warn(
          '[arsip-dinamis] failed to notify next verifikator:',
          (e as Error).message,
        );
      }

      return {
        message: 'Verifikasi berhasil, menunggu verifikator berikutnya',
        statusBerkas: berkas.status,
      };
    }

    // Semua verifikator sudah approve → berkas ditutup
    berkas.status = StatusBerkas.CLOSED_RETENSI_AKTIF;
    berkas.tanggalDitutup = new Date().toISOString().split('T')[0];
    berkas.updatedBy = parseInt(verifikatorPersnum, 10);

    // Hitung tanggal retensi
    if (berkas.retensiAktifTahun && berkas.tanggalDibuat) {
      const { aktifBerakhir, inaktifBerakhir } = this.hitungTanggalRetensi(
        berkas.tanggalDibuat,
        berkas.tanggalDitutup,
        berkas.retensiAktifTahun,
        berkas.retensiInaktifTahun || 0,
        berkas.hitungWaktuRetensiDari,
      );
      berkas.tanggalRetensiAktifBerakhir = aktifBerakhir;
      berkas.tanggalRetensiInaktifBerakhir = inaktifBerakhir;
    }

    await this.berkasRepository.save(berkas);

    // Notifikasi ke pembuat berkas bahwa penutupan disetujui
    try {
      if (berkas.createdBy) {
        await this.notificationService.createNotification(
          {
            positionId: '0',
            userPersnum: berkas.createdBy,
            type: NotificationType.BERKAS_VERIFIKASI,
            title: 'Penutupan Berkas Disetujui',
            body: `Pengajuan penutupan berkas "${berkas.judulBerkas}" telah disetujui.`,
            data: { berkasId, kodeBerkas: berkas.kodeBerkas },
          },
          false,
        );
      }
    } catch (e) {
      console.warn(
        '[arsip-dinamis] failed to notify owner:',
        (e as Error).message,
      );
    }

    // Catat riwayat retensi
    const riwayat = this.berkasRiwayatRetensiRepository.create({
      berkasId,
      tanggal: this.tanggalBerkas(berkas),
      statusSebelumnya: StatusBerkas.MENUNGGU_VERIFIKASI,
      statusBaru: StatusBerkas.CLOSED_RETENSI_AKTIF,
      tanggalPerubahan: new Date().toISOString().split('T')[0],
      diprosesOleh: parseInt(verifikatorPersnum, 10),
      keterangan: 'Semua verifikator menyetujui penutupan berkas',
    });
    await this.berkasRiwayatRetensiRepository.save(riwayat);

    return {
      message: 'Berkas berhasil ditutup — Retensi Aktif dimulai',
      statusBerkas: berkas.status,
    };
  }

  async rejectVerifikasi(
    berkasId: string,
    verifikatorPersnum: string,
    dto: VerifikasiBerkasDto,
  ): Promise<{ message: string }> {
    const berkas = await this.findOneBerkas(berkasId);

    if (berkas.status !== StatusBerkas.MENUNGGU_VERIFIKASI) {
      throw new BadRequestException(
        'Berkas tidak dalam status menunggu verifikasi',
      );
    }

    const currentVerifikator = await this.berkasVerifikasiRepository.findOne({
      where: { berkasId, status: 'pending' },
      order: { urutan: 'ASC' },
    });

    if (
      !currentVerifikator ||
      currentVerifikator.verifikatorPersnum !== verifikatorPersnum
    ) {
      throw new ForbiddenException('Anda bukan verifikator yang sedang aktif');
    }

    // Reject
    currentVerifikator.status = 'rejected';
    currentVerifikator.catatan = dto.catatan;
    currentVerifikator.actionAt = new Date();
    await this.berkasVerifikasiRepository.save(currentVerifikator);

    // Status berkas kembali ke Aktif
    berkas.status = StatusBerkas.DITOLAK;
    berkas.updatedBy = parseInt(verifikatorPersnum, 10);
    await this.berkasRepository.save(berkas);

    // Catat riwayat
    const riwayat = this.berkasRiwayatRetensiRepository.create({
      berkasId,
      tanggal: this.tanggalBerkas(berkas),
      statusSebelumnya: StatusBerkas.MENUNGGU_VERIFIKASI,
      statusBaru: StatusBerkas.DITOLAK,
      tanggalPerubahan: new Date().toISOString().split('T')[0],
      diprosesOleh: parseInt(verifikatorPersnum, 10),
      keterangan: dto.catatan,
    });
    await this.berkasRiwayatRetensiRepository.save(riwayat);

    // Realtime count update ke rejecter (−). Gagal tidak batalkan reject.
    try {
      await this.emitCountForVerifikator(verifikatorPersnum);
      if (berkas.createdBy) {
        await this.notificationService.createNotification(
          {
            positionId: '0',
            userPersnum: berkas.createdBy,
            type: NotificationType.BERKAS_VERIFIKASI,
            title: 'Penutupan Berkas Ditolak',
            body: `Pengajuan penutupan berkas "${berkas.judulBerkas}" ditolak: ${dto.catatan || 'Mohon disesuaikan.'}`,
            data: { berkasId, kodeBerkas: berkas.kodeBerkas },
          },
          false,
        );
      }
    } catch (err: any) {
      console.warn(
        '[arsip-dinamis] realtime reject / notif gagal:',
        err?.message,
      );
    }

    return { message: 'Penutupan berkas ditolak' };
  }

  // ── Detail Verifikasi (untuk halaman review) ────────────────────

  async getVerifikasiDetail(berkasId: string) {
    const verifikators = await this.berkasVerifikasiRepository.find({
      where: { berkasId },
      order: { urutan: 'ASC' },
    });

    return verifikators;
  }

  // ── Riwayat & Retensi (Manager View) ────────────────────────────

  async getRiwayatRetensi(
    options: { search?: string; page?: number; limit?: number } = {},
  ) {
    const { search, page = 1, limit = 20 } = options;

    const qb = this.berkasRepository
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL')
      .andWhere('b.status = :status', { status: 'closed_retensi_aktif' });

    if (search) {
      qb.andWhere(
        '(b.judul_berkas LIKE :search OR b.kode_berkas LIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('b.tanggal_ditutup', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Manager: Daftar Pengajuan Penutupan ─────────────────────────

  async getPengajuanPenutupan(
    verifikatorPersnum: string,
    options: { search?: string; page?: number; limit?: number } = {},
  ) {
    const { search, page = 1, limit = 20 } = options;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const params: any[] = [verifikatorPersnum];

    // Query raw dipakai agar join lintas metadata entity tidak bergantung pada
    // databaseName TypeORM. NOT EXISTS memastikan hanya verifikator pending
    // dengan urutan terdepan yang menerima pengajuan.
    let whereSql = `
      WHERE bv.verifikator_persnum = ?
        AND bv.status = 'pending'
        AND b.status = 'menunggu_verifikasi'
        AND b.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM berkas_verifikasi earlier
          WHERE earlier.berkas_id = bv.berkas_id
            AND earlier.status = 'pending'
            AND earlier.urutan < bv.urutan
        )
    `;

    if (search?.trim()) {
      whereSql += `
        AND (
          b.judul_berkas LIKE ?
          OR b.kode_berkas LIKE ?
          OR b.klasifikasi LIKE ?
          OR b.klasifikasi_text LIKE ?
        )
      `;
      const keyword = `%${search.trim()}%`;
      params.push(keyword, keyword, keyword, keyword);
    }

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM berkas_verifikasi bv
      INNER JOIN berkas b ON b.id = bv.berkas_id
      ${whereSql}
    `;
    const [countRow] = await this.dataSource.query(countQuery, params);
    const total = Number(countRow?.total || 0);

    const dataQuery = `
      SELECT
        bv.id,
        bv.berkas_id AS berkas_id,
        bv.urutan,
        bv.verifikator_persnum AS verifikator_persnum,
        bv.verifikator_position_id AS verifikator_position_id,
        bv.jabatan_verifikator AS jabatan_verifikator,
        bv.status,
        bv.catatan,
        bv.action_at AS action_at,
        bv.created_at AS created_at,
        b.judul_berkas AS berkas_judul_berkas,
        b.kode_berkas AS berkas_kode_berkas,
        b.klasifikasi AS berkas_klasifikasi,
        b.klasifikasi_text AS berkas_klasifikasi_teks,
        b.kategori_berkas AS berkas_kategori_berkas,
        b.lokasi AS berkas_lokasi,
        b.retensi_aktif_tahun AS berkas_retensi_aktif_tahun,
        b.retensi_inaktif_tahun AS berkas_retensi_inaktif_tahun,
        b.status AS berkas_status
      FROM berkas_verifikasi bv
      INNER JOIN berkas b ON b.id = bv.berkas_id
      ${whereSql}
      ORDER BY bv.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await this.dataSource.query(dataQuery, [
      ...params,
      safeLimit,
      (safePage - 1) * safeLimit,
    ]);

    const data = rows.map((row: any) => ({
      id: row.id,
      berkasId: row.berkas_id,
      urutan: row.urutan,
      verifikatorPersnum: row.verifikator_persnum,
      verifikatorPositionId: row.verifikator_position_id,
      jabatanVerifikator: row.jabatan_verifikator,
      status: row.status,
      catatan: row.catatan,
      actionAt: row.action_at,
      createdAt: row.created_at,
      berkas: {
        id: row.berkas_id,
        judulBerkas: row.berkas_judul_berkas,
        kodeBerkas: row.berkas_kode_berkas,
        klasifikasi: row.berkas_klasifikasi,
        klasifikasiTeks: row.berkas_klasifikasi_teks,
        kategoriBerkas: row.berkas_kategori_berkas,
        lokasi: row.berkas_lokasi,
        retensiAktifTahun: row.berkas_retensi_aktif_tahun,
        retensiInaktifTahun: row.berkas_retensi_inaktif_tahun,
        status: row.berkas_status,
      },
    }));

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  // ── Manager: Riwayat Persetujuan (keputusan lampau: approved + rejected) ──

  async getRiwayatPersetujuan(
    verifikatorPersnum: string,
    options: {
      search?: string;
      status?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { search, status, page = 1, limit = 20 } = options;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const params: any[] = [verifikatorPersnum];

    // Riwayat = semua keputusan lampau manager (approved + rejected).
    // Tanpa guard NOT EXISTS (beda dengan getPengajuanPenutupan): kita ingin
    // SEMUA baris yang sudah diberi aksi manager, terlepas urutan/keadaan berkas.
    let whereSql = `
      WHERE bv.verifikator_persnum = ?
        AND bv.status IN ('approved','rejected')
        AND b.deleted_at IS NULL
    `;

    if (status && status !== 'all') {
      whereSql += ` AND bv.status = ? `;
      params.push(status);
    }

    if (search?.trim()) {
      whereSql += `
        AND (
          b.judul_berkas LIKE ?
          OR b.kode_berkas LIKE ?
          OR b.klasifikasi LIKE ?
          OR b.klasifikasi_text LIKE ?
        )
      `;
      const keyword = `%${search.trim()}%`;
      params.push(keyword, keyword, keyword, keyword);
    }

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM berkas_verifikasi bv
      INNER JOIN berkas b ON b.id = bv.berkas_id
      ${whereSql}
    `;
    const [countRow] = await this.dataSource.query(countQuery, params);
    const total = Number(countRow?.total || 0);

    const dataQuery = `
      SELECT
        bv.id,
        bv.berkas_id AS berkas_id,
        bv.urutan,
        bv.verifikator_persnum AS verifikator_persnum,
        bv.verifikator_position_id AS verifikator_position_id,
        bv.jabatan_verifikator AS jabatan_verifikator,
        bv.status,
        bv.catatan,
        bv.action_at AS action_at,
        bv.created_at AS created_at,
        b.judul_berkas AS berkas_judul_berkas,
        b.kode_berkas AS berkas_kode_berkas,
        b.klasifikasi AS berkas_klasifikasi,
        b.klasifikasi_text AS berkas_klasifikasi_teks,
        b.kategori_berkas AS berkas_kategori_berkas,
        b.lokasi AS berkas_lokasi,
        b.retensi_aktif_tahun AS berkas_retensi_aktif_tahun,
        b.retensi_inaktif_tahun AS berkas_retensi_inaktif_tahun,
        b.status AS berkas_status
      FROM berkas_verifikasi bv
      INNER JOIN berkas b ON b.id = bv.berkas_id
      ${whereSql}
      ORDER BY bv.action_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await this.dataSource.query(dataQuery, [
      ...params,
      safeLimit,
      (safePage - 1) * safeLimit,
    ]);

    const data = rows.map((row: any) => ({
      id: row.id,
      berkasId: row.berkas_id,
      urutan: row.urutan,
      verifikatorPersnum: row.verifikator_persnum,
      verifikatorPositionId: row.verifikator_position_id,
      jabatanVerifikator: row.jabatan_verifikator,
      status: row.status,
      catatan: row.catatan,
      actionAt: row.action_at,
      createdAt: row.created_at,
      berkas: {
        id: row.berkas_id,
        judulBerkas: row.berkas_judul_berkas,
        kodeBerkas: row.berkas_kode_berkas,
        klasifikasi: row.berkas_klasifikasi,
        klasifikasiTeks: row.berkas_klasifikasi_teks,
        kategoriBerkas: row.berkas_kategori_berkas,
        lokasi: row.berkas_lokasi,
        retensiAktifTahun: row.berkas_retensi_aktif_tahun,
        retensiInaktifTahun: row.berkas_retensi_inaktif_tahun,
        status: row.berkas_status,
      },
    }));

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  // ── Manager: Persetujuan Saya (unified menunggu + approved + rejected + all) ──

  async getPersetujuanSaya(
    verifikatorPersnum: string,
    options: {
      search?: string;
      status?: string; // menunggu (default) | approved | rejected | all
      page?: number;
      limit?: number;
      sortBy?: string; // judulBerkas | kodeBerkas | status | actionAt
      sortDir?: string; // asc | desc (default desc)
    } = {},
  ) {
    const {
      search,
      status = 'menunggu',
      page = 1,
      limit = 20,
      sortBy,
      sortDir,
    } = options;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const params: any[] = [verifikatorPersnum];

    // Sort whitelist (map FE column key -> SQL expression) untuk hindari injection.
    const SORT_MAP: Record<string, string> = {
      judulBerkas: 'b.judul_berkas',
      kodeBerkas: 'b.kode_berkas',
      status: 'bv.status',
      actionAt: 'COALESCE(bv.action_at, bv.created_at)',
    };
    const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
    const orderExpr =
      sortBy && SORT_MAP[sortBy]
        ? SORT_MAP[sortBy]
        : 'COALESCE(bv.action_at, bv.created_at)';
    const orderBy = `ORDER BY ${orderExpr} ${dir}`;

    // menunggu = pending & giliran Anda (NOT EXISTS earlier pending).
    // approved/rejected = keputusan lampau Anda.
    // all = menunggu + approved + rejected (semua berkas persetujuan Anda).
    const menungguClause = `bv.status = 'pending' AND b.status = 'menunggu_verifikasi' AND NOT EXISTS (SELECT 1 FROM berkas_verifikasi earlier WHERE earlier.berkas_id = bv.berkas_id AND earlier.status = 'pending' AND earlier.urutan < bv.urutan)`;

    let whereSql = `
      WHERE bv.verifikator_persnum = ?
        AND b.deleted_at IS NULL
    `;
    if (status === 'menunggu') {
      whereSql += ` AND ${menungguClause}`;
    } else if (status === 'approved') {
      whereSql += ` AND bv.status = 'approved'`;
    } else if (status === 'rejected') {
      whereSql += ` AND bv.status = 'rejected'`;
    } else {
      whereSql += ` AND (${menungguClause} OR bv.status IN ('approved','rejected'))`;
    }

    if (search?.trim()) {
      whereSql += `
        AND (
          b.judul_berkas LIKE ?
          OR b.kode_berkas LIKE ?
          OR b.klasifikasi LIKE ?
          OR b.klasifikasi_text LIKE ?
        )
      `;
      const keyword = `%${search.trim()}%`;
      params.push(keyword, keyword, keyword, keyword);
    }

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM berkas_verifikasi bv
      INNER JOIN berkas b ON b.id = bv.berkas_id
      ${whereSql}
    `;
    const [countRow] = await this.dataSource.query(countQuery, params);
    const total = Number(countRow?.total || 0);

    const dataQuery = `
      SELECT
        bv.id,
        bv.berkas_id AS berkas_id,
        bv.urutan,
        bv.verifikator_persnum AS verifikator_persnum,
        bv.verifikator_position_id AS verifikator_position_id,
        bv.jabatan_verifikator AS jabatan_verifikator,
        bv.status,
        bv.catatan,
        bv.action_at AS action_at,
        bv.created_at AS created_at,
        b.judul_berkas AS berkas_judul_berkas,
        b.kode_berkas AS berkas_kode_berkas,
        b.klasifikasi AS berkas_klasifikasi,
        b.klasifikasi_text AS berkas_klasifikasi_teks,
        b.kategori_berkas AS berkas_kategori_berkas,
        b.lokasi AS berkas_lokasi,
        b.retensi_aktif_tahun AS berkas_retensi_aktif_tahun,
        b.retensi_inaktif_tahun AS berkas_retensi_inaktif_tahun,
        b.status AS berkas_status
      FROM berkas_verifikasi bv
      INNER JOIN berkas b ON b.id = bv.berkas_id
      ${whereSql}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;
    const rows = await this.dataSource.query(dataQuery, [
      ...params,
      safeLimit,
      (safePage - 1) * safeLimit,
    ]);

    const data = rows.map((row: any) => ({
      id: row.id,
      berkasId: row.berkas_id,
      urutan: row.urutan,
      verifikatorPersnum: row.verifikator_persnum,
      verifikatorPositionId: row.verifikator_position_id,
      jabatanVerifikator: row.jabatan_verifikator,
      status: row.status,
      catatan: row.catatan,
      actionAt: row.action_at,
      createdAt: row.created_at,
      berkas: {
        id: row.berkas_id,
        judulBerkas: row.berkas_judul_berkas,
        kodeBerkas: row.berkas_kode_berkas,
        klasifikasi: row.berkas_klasifikasi,
        klasifikasiTeks: row.berkas_klasifikasi_teks,
        kategoriBerkas: row.berkas_kategori_berkas,
        lokasi: row.berkas_lokasi,
        retensiAktifTahun: row.berkas_retensi_aktif_tahun,
        retensiInaktifTahun: row.berkas_retensi_inaktif_tahun,
        status: row.berkas_status,
      },
    }));

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  // ── Statistik Persetujuan (kartu dashboard manager) ──────────────

  async getStatistikPersetujuan(verifikatorPersnum: string) {
    const [menungguRows, disetujuiRows, ditolakRows] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*) AS c
         FROM berkas_verifikasi bv
         INNER JOIN berkas b ON b.id = bv.berkas_id
         WHERE bv.verifikator_persnum = ?
           AND bv.status = 'pending'
           AND b.status = 'menunggu_verifikasi'
           AND b.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM berkas_verifikasi earlier
             WHERE earlier.berkas_id = bv.berkas_id
               AND earlier.status = 'pending'
               AND earlier.urutan < bv.urutan
           )`,
        [verifikatorPersnum],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS c
         FROM berkas_verifikasi
         WHERE verifikator_persnum = ?
           AND status = 'approved'
           AND DATE(action_at) = CURDATE()`,
        [verifikatorPersnum],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS c
         FROM berkas_verifikasi
         WHERE verifikator_persnum = ? AND status = 'rejected'`,
        [verifikatorPersnum],
      ),
    ]);

    return {
      menunggu: Number(menungguRows?.[0]?.c || 0),
      disetujui_hari_ini: Number(disetujuiRows?.[0]?.c || 0),
      ditolak: Number(ditolakRows?.[0]?.c || 0),
    };
  }

  // ── Status Berkas per Naskah (untuk kolom Status Berkas KM/Terkirim) ──

  async getBerkasStatusByNaskah(naskahIds: string[], isTu: boolean) {
    const ids = [...new Set(naskahIds.filter(Boolean))];
    if (ids.length === 0) return [];
    // Naskah inaktif (berkas ditutup) tidak menampilkan status berkas ke user
    // biasa — hanya TU yang melihatnya.
    const statusFilter = isTu ? '' : " AND bn.status = 'aktif'";
    const rows: any[] = await this.dataSource.query(
      `SELECT
         bn.naskah_id AS naskah_id,
         b.id AS berkas_id,
         b.kode_berkas,
         b.judul_berkas,
         b.status AS berkas_status,
         b.pic_persnum
       FROM berkas_naskah bn
       INNER JOIN berkas b ON b.id = bn.berkas_id
       WHERE bn.naskah_id IN (?)${statusFilter}
         AND b.deleted_at IS NULL`,
      [ids],
    );
    return rows.map((r: any) => ({
      naskah_id: r.naskah_id,
      berkas_id: r.berkas_id,
      kode_berkas: r.kode_berkas,
      judul_berkas: r.judul_berkas,
      berkas_status: r.berkas_status,
      pic_persnum: r.pic_persnum,
    }));
  }
}
