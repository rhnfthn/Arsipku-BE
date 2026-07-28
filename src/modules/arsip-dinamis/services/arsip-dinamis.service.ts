import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager } from 'typeorm';
import { Berkas, StatusBerkas } from '../../berkas/entities/berkas.entity';
import { BerkasNaskah } from '../entities/berkas-naskah.entity';
import { BerkasVerifikasi } from '../entities/berkas-verifikasi.entity';
import { BerkasRiwayatRetensi } from '../entities/berkas-riwayat-retensi.entity';
import { KlasifikasiEntity } from '../../klasifikasi/entities/klasifikasi.entity';
import { StorageService } from '../../storage/services/storage.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import {
  CreateArsipDinamisBerkasDto,
  AddNaskahToBerkasDto,
  AjukanTutupBerkasDto,
  VerifikasiBerkasDto,
} from '../dto';

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
  ) {}

  // ── File pendukung berkas (foto lokasi fisik & dokumen pendukung) ──

  async uploadBerkasFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<{ key: string }> {
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

  // ponytail: gap-lock range ARK-YYYY-% via FOR UPDATE on the unique index
  // to serialize concurrent createBerkas; switch to a counter table if
  // create throughput ever matters.
  private async generateKodeBerkas(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await manager
      .getRepository(Berkas)
      .createQueryBuilder('b')
      .select('b.id', 'id')
      .where('b.kode_berkas LIKE :pattern', { pattern: `ARK-${year}-%` })
      .setLock('pessimistic_write')
      .getRawMany();
    const seq = String(rows.length + 1).padStart(4, '0');
    return `ARK-${year}-${seq}`;
  }

  // ── Helper: Hitung Tanggal Retensi ──────────────────────────────

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
    userId: number,
  ): Promise<Berkas> {
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
      const kodeBerkas = await this.generateKodeBerkas(manager);
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
    options: {
      status?: string;
      klasifikasi?: string;
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
      tahun,
      search,
      page = 1,
      limit = 20,
      sortBy,
      sortDir,
    } = options;

    const qb = this.berkasRepository
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL');

    // Scope: user hanya melihat berkas miliknya / unitnya
    qb.andWhere('(b.created_by = :userId OR b.pic_persnum = :userPersnum)', {
      userId,
      userPersnum: String(userId),
    });

    if (status) {
      qb.andWhere('b.status = :status', { status });
    }
    if (klasifikasi) {
      qb.andWhere('b.klasifikasi = :klasifikasi', { klasifikasi });
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
    qb.orderBy(SORT_MAP[sortBy ?? ''] ?? 'b.updated_at', sortDir === 'asc' ? 'ASC' : 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneBerkas(id: string): Promise<Berkas> {
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
   * Detail berkas + resolusi PIC & Unit Pencipta dari org_data.
   * Pencipta (pembuat berkas) = created_by (persnum) → sumber unit pencipta & fallback PIC.
   * PIC: pic_persnum bila ada, fallback ke pembuat berkas (form create tidak selalu mengisi PIC).
   */
  async getDetailBerkas(id: string): Promise<Berkas> {
    const berkas = await this.findOneBerkas(id);

    let pencipta: any = null;
    if (berkas.createdBy) {
      try {
        pencipta = await this.orgDataService.findByPersnum(Number(berkas.createdBy));
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

  async getStatistikBerkas(userId: number) {
    const base = this.berkasRepository
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL')
      .andWhere('(b.created_by = :userId OR b.pic_persnum = :userPersnum)', {
        userId,
        userPersnum: String(userId),
      });

    const [draft, aktif, menunggu, ditolak, closed] = await Promise.all([
      base.clone().andWhere('b.status = :s', { s: 'draft' }).getCount(),
      base.clone().andWhere('b.status = :s', { s: 'aktif' }).getCount(),
      base
        .clone()
        .andWhere('b.status = :s', { s: 'menunggu_verifikasi' })
        .getCount(),
      base.clone().andWhere('b.status = :s', { s: 'ditolak' }).getCount(),
      base
        .clone()
        .andWhere('b.status = :s', { s: 'closed_retensi_aktif' })
        .getCount(),
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
  ): Promise<{ message: string; count: number }> {
    const berkas = await this.findOneBerkas(berkasId);

    if (
      berkas.status !== StatusBerkas.AKTIF &&
      berkas.status !== StatusBerkas.DITOLAK
    ) {
      throw new BadRequestException(
        'Naskah hanya bisa ditambahkan ke berkas dengan status Aktif atau Ditolak',
      );
    }

    // Cek duplikasi: naskah yang sudah ada di berkas ini
    const requestedIds = [...new Set(dto.naskah_ids.filter(Boolean))];
    const existing = await this.berkasNaskahRepository.find({
      where: {
        berkasId,
        naskahId: In(requestedIds),
      },
    });
    const existingIds = new Set(existing.map((e) => e.naskahId));
    const newIds = requestedIds.filter((id) => !existingIds.has(id));

    if (newIds.length === 0) {
      return {
        message: 'Semua naskah sudah ada di berkas ini',
        count: 0,
      };
    }

    // Ambil metadata naskah dari tabel naskah (raw query karena tidak ada FK)
    const naskahMeta: any[] = await this.dataSource.query(
      `SELECT id, perihal, nomor, tanggal, jenis FROM naskah WHERE id IN (?)`,
      [newIds],
    );
    const metaMap = new Map<string, any>(naskahMeta.map((n: any) => [n.id, n]));

    const entities = newIds.map((naskahId, idx) => {
      const meta = metaMap.get(naskahId) as any;
      return this.berkasNaskahRepository.create({
        berkasId,
        naskahId,
        naskahTipe: meta?.jenis || 'unknown',
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

    if (insertedCount === 0) {
      return {
        message: 'Semua naskah sudah ada di berkas ini',
        count: 0,
      };
    }

    return {
      message: `${insertedCount} naskah berhasil ditambahkan ke berkas`,
      count: insertedCount,
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

    const relasi = await this.berkasNaskahRepository.findOne({
      where: { berkasId, naskahId },
    });
    if (!relasi) {
      throw new NotFoundException('Naskah tidak ditemukan di berkas ini');
    }

    await this.berkasNaskahRepository.remove(relasi);
    return { message: 'Naskah berhasil dihapus dari berkas' };
  }

  async getDaftarNaskah(
    berkasId: string,
    options: { search?: string; page?: number; limit?: number } = {},
  ) {
    const { search, page = 1, limit = 20 } = options;

    const qb = this.berkasNaskahRepository
      .createQueryBuilder('bn')
      .where('bn.berkas_id = :berkasId', { berkasId });

    if (search) {
      qb.andWhere('(bn.perihal LIKE :search OR bn.nomor_surat LIKE :search)', {
        search: `%${search}%`,
      });
    }

    qb.orderBy('bn.urutan', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Naskah Siap Arsip (Tab Filtering) ───────────────────────────

  async getNaskahSiapArsip(
    userId: number,
    berkasId: string,
    options: { search?: string; page?: number; limit?: number } = {},
  ) {
    const { search, page = 1, limit = 20 } = options;

    // Naskah yang sudah masuk berkas ini → exclude
    const existingNaskah = await this.berkasNaskahRepository.find({
      where: { berkasId },
      select: ['naskahId'],
    });
    const excludeIds = existingNaskah.map((n) => n.naskahId);

    // Satu baris per naskah. Kotak masuk minimal sudah dibaca, sedangkan
    // seluruh naskah terkirim yang final dapat dipilih.
    let query = `
      SELECT
        n.id,
        n.nomor AS nomor_surat,
        n.perihal,
        n.tanggal AS tanggal_naskah,
        n.jenis AS naskah_tipe,
        n.status,
        n.final_pdf,
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
      WHERE ns.position = (
        SELECT position FROM pa_personal WHERE persnum = ?
      )
        AND n.status IN ('final', 'final_tte')
        AND n.final_pdf IS NOT NULL
        AND ns.is_konsep = 0
        AND ns.is_draft = 0
        AND ns.sirkuler IN ('penerima', 'tembusan', 'pengirim')
        AND (
          ns.sirkuler = 'pengirim'
          OR (ns.sirkuler IN ('penerima', 'tembusan') AND ns.send_read_time IS NOT NULL)
        )
    `;
    const params: any[] = [String(userId)];

    // Exclude naskah yang sudah di berkas ini
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(',');
      query += ` AND n.id NOT IN (${placeholders})`;
      params.push(...excludeIds);
    }

    if (search) {
      query += ` AND (n.perihal LIKE ? OR n.nomor LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
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
    options: { search?: string; page?: number; limit?: number } = {},
  ) {
    const { search, page = 1, limit = 50 } = options;
    const sirkulerFilter =
      tab === 'terkirim'
        ? `ns.sirkuler = 'pengirim'`
        : `ns.sirkuler IN ('penerima', 'tembusan')`;

    let query = `
      SELECT
        n.id,
        n.nomor AS nomor_surat,
        n.perihal,
        n.tanggal AS tanggal_naskah,
        n.jenis AS naskah_tipe,
        n.status,
        n.final_pdf,
        MAX(CASE WHEN bn.naskah_id IS NOT NULL THEN 1 ELSE 0 END) AS sudah_masuk_berkas,
        GROUP_CONCAT(DISTINCT b.kode_berkas) AS kode_berkas,
        GROUP_CONCAT(DISTINCT b.status) AS berkas_status
      FROM naskah n
      INNER JOIN naskah_sirkulasi ns ON ns.id_naskah = n.id
      LEFT JOIN berkas_naskah bn ON bn.naskah_id = n.id
      LEFT JOIN berkas b ON b.id = bn.berkas_id AND b.deleted_at IS NULL
      WHERE ns.position = (
        SELECT position FROM pa_personal WHERE persnum = ?
      )
        AND ${sirkulerFilter}
        AND ns.is_konsep = 0
    `;
    const params: any[] = [String(userId)];

    if (search) {
      query += ` AND (n.perihal LIKE ? OR n.nomor LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
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
    userId: number,
  ): Promise<{ message: string }> {
    const berkas = await this.findOneBerkas(berkasId);

    if (
      berkas.status !== StatusBerkas.AKTIF &&
      berkas.status !== StatusBerkas.DITOLAK
    ) {
      throw new BadRequestException(
        'Hanya berkas Aktif atau Ditolak yang bisa diajukan penutupan',
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

    // Hapus baris verifikasi lama (penolakan sebelumnya) agar timeline pengajuan
    // ulang bersih, bukan menumpuk rejected-lama + pending-baru. Riwayat penolakan
    // tetap tersimpan di audit log (riwayat aksi status sebelumnya/baru).
    await this.berkasVerifikasiRepository.delete({ berkasId });

    // Simpan verifikator
    const verifikatorEntities = dto.verifikator.map((v, idx) =>
      this.berkasVerifikasiRepository.create({
        berkasId,
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

    if (nextVerifikator) {
      // Masih ada verifikator berikutnya → status tetap menunggu
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

    // Catat riwayat retensi
    const riwayat = this.berkasRiwayatRetensiRepository.create({
      berkasId,
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
      statusSebelumnya: StatusBerkas.MENUNGGU_VERIFIKASI,
      statusBaru: StatusBerkas.DITOLAK,
      tanggalPerubahan: new Date().toISOString().split('T')[0],
      diprosesOleh: parseInt(verifikatorPersnum, 10),
      keterangan: dto.catatan,
    });
    await this.berkasRiwayatRetensiRepository.save(riwayat);

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
    const { search, status = 'menunggu', page = 1, limit = 20, sortBy, sortDir } = options;
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
      sortBy && SORT_MAP[sortBy] ? SORT_MAP[sortBy] : 'COALESCE(bv.action_at, bv.created_at)';
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

  async getBerkasStatusByNaskah(naskahIds: string[]) {
    const ids = [...new Set(naskahIds.filter(Boolean))];
    if (ids.length === 0) return [];
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
       WHERE bn.naskah_id IN (?)
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
