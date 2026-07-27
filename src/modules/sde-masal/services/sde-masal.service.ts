import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { SdeMasalEntity } from '../entities/sde-masal.entity';
import { CreateSdeMasalConceptDto } from '../dto/create-sde-masal-concept.dto';
import { UpdateSdeMasalDto } from '../dto/update-sde-masal.dto';
import { SdeMasalFilterDto } from '../dto/sde-masal-filter.dto';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { EksternalEntity } from '../../eksternal/entities/eksternal.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';

const COMPANY_ID = 10000; // PERUM LPPNPI

/**
 * Service untuk fitur SDE Masal (Surat Dinas Eksternal Massal).
 *
 * Membaca file Excel, insert banyak record sekaligus, dan menyediakan
 * CRUD untuk item SDE masal. Juga membuat naskah SDE individual per penerima.
 */
@Injectable()
export class SdeMasalService {
  private readonly logger = new Logger(SdeMasalService.name);

  constructor(
    @InjectRepository(SdeMasalEntity)
    private readonly repo: Repository<SdeMasalEntity>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly sirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(EksternalEntity)
    private readonly eksternalRepository: Repository<EksternalEntity>,
    private readonly orgDataService: OrgDataService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Simpan konsep SDE Masal (Form 1).
   * Konsep disimpan ke tabel sde_masal dengan status khusus.
   */
  async createConcept(dto: CreateSdeMasalConceptDto): Promise<SdeMasalEntity> {
    const entity = this.repo.create({
      conceptId: null,
      tanggalKonsep: dto.tanggalKonsep ? new Date(dto.tanggalKonsep) : null,
      klasifikasiId: dto.klasifikasiId ?? null,
      klasifikasiName: dto.klasifikasiName ?? null,
      pengirimId: dto.pengirimId ?? null,
      pengirimName: dto.pengirimName ?? null,
      parentNaskahId: dto.parentNaskahId ?? null,
      perihal: '__CONCEPT__',
      tertuju: '__CONCEPT__',
      statusVerifikasi: 'MENUNGGU',
    });
    return this.repo.save(entity);
  }

  /**
   * Proses upload Excel dan insert banyak record.
   * @param file Buffer file Excel
   * @param conceptId ID konsep dari Form 1
   * @param skemaTemplate Skema template yang dipilih
   * @param versiTemplate Versi template yang dipilih
   * @returns Summary { total, success, failed }
   */
  async processExcelUpload(
    file: Buffer,
    conceptId: string,
    skemaTemplate: string,
    versiTemplate: string,
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    items: SdeMasalEntity[];
  }> {
    // Ambil data konsep
    const concept = await this.repo.findOne({ where: { id: conceptId } });
    if (!concept) {
      throw new Error('Konsep tidak ditemukan');
    }

    // Parse Excel — baca sheet "Data Penerima" (atau sheet pertama jika tidak ada)
    const workbook = XLSX.read(file, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find((n) =>
      n.toLowerCase().includes('data penerima'),
    ) || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    if (rows.length === 0) {
      throw new Error('File Excel kosong atau tidak memiliki data');
    }

    if (rows.length > 1000) {
      throw new Error('Maksimal 1000 baris per upload');
    }

    // Helper: ambil nilai kolom case-insensitive
    const getCol = (row: any, ...keys: string[]): string => {
      for (const k of keys) {
        for (const rowKey of Object.keys(row)) {
          if (rowKey.toLowerCase().trim() === k.toLowerCase().trim()) {
            const val = row[rowKey];
            if (val !== null && val !== undefined) return String(val).trim();
          }
        }
      }
      return '';
    };

    const items: SdeMasalEntity[] = [];
    let failed = 0;

    for (const row of rows) {
      try {
        const persnum = getCol(row, 'Persnum', 'persnum');
        const nama = getCol(row, 'Nama', 'nama');
        const jabatan = getCol(row, 'Jabatan', 'jabatan', 'Jabatan Penerima', 'jabatanPenerima');
        const keterangan = getCol(row, 'Keterangan', 'keterangan');

        // Skip baris kosong (semua field kosong)
        if (!persnum && !nama && !jabatan && !keterangan) {
          continue;
        }

        // Persnum, Nama, Jabatan wajib
        if (!persnum || !nama || !jabatan) {
          failed++;
          continue;
        }

        // Tertuju = gabungan "Nama - Jabatan"
        const tertuju = `${nama} - ${jabatan}`;

        const item = this.repo.create({
          conceptId,
          tanggalKonsep: concept.tanggalKonsep,
          klasifikasiId: concept.klasifikasiId,
          klasifikasiName: concept.klasifikasiName,
          pengirimId: concept.pengirimId,
          pengirimName: concept.pengirimName,
          sifatSurat: concept.sifatSurat || 'biasa',
          parentNaskahId: concept.parentNaskahId,
          skemaTemplate,
          versiTemplate,
          perihal: concept.perihal || '',
          tertuju,
          alamat: null,
          kota: null,
          kodePos: String(persnum) || null,
          jabatanPenerima: jabatan || null,
          isiRingkasan: keterangan || null,
          jenisTemplate: skemaTemplate,
          statusVerifikasi: 'MENUNGGU',
        });
        items.push(item);
      } catch (err) {
        this.logger.warn(`Failed to parse row: ${err?.message ?? err}`);
        failed++;
      }
    }

    // Bulk insert
    let saved: SdeMasalEntity[] = [];
    if (items.length > 0) {
      saved = await this.repo.save(items);
    }

    // Hapus record konsep placeholder (perihal = __CONCEPT__)
    if (concept.perihal === '__CONCEPT__') {
      await this.repo.delete(concept.id);
    }

    return {
      total: rows.length,
      success: saved.length,
      failed,
      items: saved,
    };
  }

  /**
   * Generate massal SDE dari data wizard (Step 4).
   * Menerima data konsep, list penerima, dan template dari frontend,
   * lalu insert banyak record SDE Masal sekaligus.
   */
  async generateMassal(body: {
    conceptId?: string;
    konsep: any;
    penerimaList: any[];
    template: any;
  }): Promise<{
    total: number;
    success: number;
    failed: number;
    items: SdeMasalEntity[];
  }> {
    const { konsep, penerimaList, template } = body;

    if (!konsep || !penerimaList || penerimaList.length === 0) {
      throw new Error('Data wizard tidak lengkap');
    }

    if (penerimaList.length > 1000) {
      throw new Error('Maksimal 1000 penerima per generate');
    }

    const items: SdeMasalEntity[] = [];
    let failed = 0;

    for (const p of penerimaList) {
      try {
        if (!p.isValid) {
          failed++;
          continue;
        }

        // Bangun tertuju dari nama + jabatan
        const nama = p.nama || '';
        const jabatan = p.jabatan || p.jabatanPenerima || '';
        const tertuju = p.tertuju || (nama && jabatan ? `${nama} - ${jabatan}` : nama || jabatan || '-');
        const persnum = p.persnum || p.kodePos || '';

        // Ganti variabel dinamis di konten template
        let konten = template?.konten || '';
        if (konten) {
          konten = konten
            .replace(/\{\{tertuju\}\}/g, tertuju)
            .replace(/\{\{nama\}\}/g, nama || '-')
            .replace(/\{\{jabatan\}\}/g, jabatan || '-')
            .replace(/\{\{persnum\}\}/g, persnum || '-')
            .replace(/\{\{keterangan\}\}/g, p.keterangan || '-')
            .replace(/\{\{alamat\}\}/g, p.alamat || '-')
            .replace(/\{\{kota\}\}/g, p.kota || '-')
            .replace(/\{\{kode_pos\}\}/g, p.kodePos || '-')
            .replace(/\{\{kodepos\}\}/g, p.kodePos || '-');
        }

        const item = this.repo.create({
          conceptId: body.conceptId || null,
          tanggalKonsep: konsep.tanggalKonsep
            ? new Date(konsep.tanggalKonsep)
            : null,
          klasifikasiId: konsep.klasifikasiId || null,
          klasifikasiName: konsep.klasifikasiName || null,
          pengirimId: konsep.pengirimId || null,
          pengirimName: konsep.pengirimName || null,
          sifatSurat: konsep.sifat || 'biasa',
          parentNaskahId: konsep.parentNaskahId || null,
          skemaTemplate: template?.skema || null,
          versiTemplate: template?.versi || null,
          perihal: konsep.perihal || '',
          tertuju,
          alamat: p.alamat || null,
          kota: p.kota || null,
          kodePos: persnum || null,
          jabatanPenerima: jabatan || null,
          isiRingkasan: konten || null,
          jenisTemplate: template?.skema || null,
          statusVerifikasi: 'MENUNGGU',
        });
        items.push(item);
      } catch (err) {
        this.logger.warn(`Failed to generate item: ${err?.message ?? err}`);
        failed++;
      }
    }

    let saved: SdeMasalEntity[] = [];
    if (items.length > 0) {
      saved = await this.repo.save(items);
    }

    return {
      total: penerimaList.length,
      success: saved.length,
      failed,
      items: saved,
    };
  }

  /**
   * List SDE Masal dengan filter dan pagination.
   */
  async findAll(filter: SdeMasalFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.repo.createQueryBuilder('s');

    // Exclude concept placeholders
    qb.andWhere("s.perihal != '__CONCEPT__'");

    if (filter.search) {
      qb.andWhere('(s.perihal LIKE :search OR s.tertuju LIKE :search)', {
        search: `%${filter.search}%`,
      });
    }
    if (filter.statusVerifikasi) {
      qb.andWhere('s.status_verifikasi = :status', {
        status: filter.statusVerifikasi,
      });
    }
    if (filter.jenisTemplate) {
      qb.andWhere('s.jenis_template = :jenis', { jenis: filter.jenisTemplate });
    }

    qb.orderBy('s.created_at', 'DESC');

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Detail satu item SDE Masal.
   */
  async findOne(id: string): Promise<SdeMasalEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Update item SDE Masal.
   */
  async update(
    id: string,
    dto: UpdateSdeMasalDto,
  ): Promise<SdeMasalEntity | null> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) return null;

    Object.assign(item, dto);
    return this.repo.save(item);
  }

  /**
   * Hapus item SDE Masal.
   */
  async remove(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  /**
   * Upload lampiran untuk item SDE Masal.
   */
  async uploadLampiran(
    id: string,
    lampiranUrl: string,
  ): Promise<SdeMasalEntity | null> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) return null;
    item.lampiranUrl = lampiranUrl;
    return this.repo.save(item);
  }

  /**
   * Generate template Excel untuk download.
   * Format: No | Persnum | Nama | Jabatan | Keterangan
   * File .xlsx dengan 3 sheet: Data Penerima, Petunjuk Pengisian, Mapping Field.
   */
  async generateTemplate(): Promise<Buffer> {
    // Sheet 1: Data Penerima
    const dataSheet = [
      ['No', 'Persnum', 'Nama', 'Jabatan', 'Keterangan'],
      [1, '10011523', 'INDRA SUDARSONO', 'Spesialis Pengembangan Pelayanan', 'Surat undangan rapat'],
      [2, '10011524', 'BUDI SANTOSO', 'Kepala Cabang AirNav Medan', 'Permohonan data laporan'],
      [3, '10011525', 'SITI RAHMAWATI', 'Manajer Operasi Bandara', 'Undangan rapat kerja'],
      [4, '10011526', 'AHMAD HIDAYAT', 'Kepala Dinas Perhubungan', 'Pemberitahuan inspeksi'],
      [5, '10011527', 'DEWI LESTARI', 'Direktur Operasional', 'Permohonan kerja sama'],
      [6, '10011528', 'RUDI HARTONO', 'Kepala Kantor Cabang', 'Surat balasan permohonan'],
      [7, '10011529', 'NURWENDA', 'Kepala Cabang AirNav', 'Undangan koordinasi'],
      [8, '10011530', 'JOKO PRASETYO', 'Manajer Teknik Bandara', 'Laporan hasil audit'],
      [9, '10011531', 'SRI WAHYUNI', 'Kepala Cabang AirNav', 'Permohonan cuti tahunan'],
      [10, '10011532', 'BAMBANG SUTRISNO', 'Direktur Utama', 'Surat edaran'],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(dataSheet);
    ws1['!cols'] = [
      { wch: 5 }, { wch: 15 }, { wch: 30 }, { wch: 35 }, { wch: 35 },
    ];

    // Sheet 2: Petunjuk Pengisian
    const petunjukSheet = [
      ['Petunjuk Pengisian Template SDE Masal'],
      [''],
      ['1. Kolom "Persnum" WAJIB diisi (nomor pegawai penerima).'],
      ['2. Kolom "Nama" WAJIB diisi (nama lengkap penerima).'],
      ['3. Kolom "Jabatan" WAJIB diisi (nama jabatan/posisi penerima).'],
      ['4. Kolom "Keterangan" opsional (catatan singkat).'],
      ['5. File upload harus format .xlsx atau .xls.'],
      ['6. Maksimal 1000 baris per upload.'],
      ['7. Baris dengan Persnum/Nama/Jabatan kosong akan dianggap INVALID.'],
      [''],
      ['Variabel dinamis yang bisa dipakai di konten surat:'],
      ['  {{tertuju}}    → "Nama - Jabatan" (gabungan)'],
      ['  {{nama}}       → Nama penerima'],
      ['  {{jabatan}}    → Jabatan penerima'],
      ['  {{persnum}}    → Nomor pegawai penerima'],
      ['  {{keterangan}} → Keterangan'],
    ];

    const ws2 = XLSX.utils.aoa_to_sheet(petunjukSheet);
    ws2['!cols'] = [{ wch: 70 }];

    // Sheet 3: Mapping Field
    const mappingSheet = [
      ['Kolom Excel', 'Field Backend', 'Tipe Data', 'Wajib', 'Variabel Konten'],
      ['No', 'no', 'number', 'Tidak', '-'],
      ['Persnum', 'persnum', 'string', 'YA', '{{persnum}}'],
      ['Nama', 'nama', 'string', 'YA', '{{nama}}'],
      ['Jabatan', 'jabatan', 'string', 'YA', '{{jabatan}}'],
      ['Keterangan', 'keterangan', 'string', 'Tidak', '{{keterangan}}'],
    ];

    const ws3 = XLSX.utils.aoa_to_sheet(mappingSheet);
    ws3['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 25 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Data Penerima');
    XLSX.utils.book_append_sheet(wb, ws2, 'Petunjuk Pengisian');
    XLSX.utils.book_append_sheet(wb, ws3, 'Mapping Field');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }

  /**
   * Ringkasan untuk dashboard.
   */
  async getSummary() {
    const baseQb = this.repo
      .createQueryBuilder('s')
      .where("s.perihal != '__CONCEPT__'");

    const total = await baseQb.getCount();

    const menunggu = await baseQb
      .clone()
      .andWhere('s.status_verifikasi = :status', { status: 'MENUNGGU' })
      .getCount();

    const terkirim = await baseQb
      .clone()
      .andWhere('s.status_verifikasi = :status', { status: 'TERKIRIM' })
      .getCount();

    const terverifikasi = await baseQb
      .clone()
      .andWhere('s.status_verifikasi = :status', { status: 'TERVERIFIKASI' })
      .getCount();

    const ditolak = await baseQb
      .clone()
      .andWhere('s.status_verifikasi = :status', { status: 'DITOLAK' })
      .getCount();

    const gagal = await baseQb
      .clone()
      .andWhere('s.status_verifikasi = :status', { status: 'GAGAL' })
      .getCount();

    return { total, menunggu, terkirim, terverifikasi, ditolak, gagal };
  }

  /**
   * Detail naskah SDE individual by naskahId.
   * Mengembalikan data naskah + sirkulasi (pengirim + penerima) untuk ditampilkan
   * di halaman detail surat. Tidak melakukan access check ketat (user sudah login via JWT).
   */
  async findNaskahDetail(naskahId: string): Promise<any | null> {
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });
    if (!naskah) return null;

    // Ambil sirkulasi pengirim
    const pengirimSirkulasi = await this.sirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    // Ambil sirkulasi penerima
    const penerimaList = await this.sirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'penerima' },
      order: { urutan: 'ASC' },
    });

    // Ambil sirkulasi tembusan
    const tembusanList = await this.sirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'tembusan' },
      order: { urutan: 'ASC' },
    });

    // Cari data SDE Masal terkait
    const sdeMasalItem = await this.repo.findOne({
      where: { naskahId },
    });

    return {
      id: naskah.id,
      jenis: naskah.jenis,
      nomor: naskah.nomor,
      tanggal: naskah.tanggal,
      perihal: naskah.perihal,
      sifat: naskah.sifat,
      status: naskah.status,
      konten: naskah.konten,
      tempat: naskah.tempat,
      lampiran: naskah.lampiran,
      english: naskah.english,
      final_pdf: naskah.final_pdf,
      createdByPosition: naskah.createdByPosition,
      createdAt: naskah.createdAt,
      // Sirkulasi
      pengirim: pengirimSirkulasi
        ? {
            position: pengirimSirkulasi.position,
            positionText: pengirimSirkulasi.positionText,
            namaSirkuler: pengirimSirkulasi.namaSirkuler,
            areaText: pengirimSirkulasi.areaText,
            organizationText: pengirimSirkulasi.organizationText,
          }
        : null,
      penerima: penerimaList.map((p) => ({
        id: p.id,
        nama: p.namaSirkuler,
        jabatan: p.positionText,
        alamat: p.alamat,
        telepon: p.telepon,
        email: p.email,
        positionStatus: p.positionStatus,
      })),
      tembusan: tembusanList.map((t) => ({
        id: t.id,
        nama: t.namaSirkuler,
        jabatan: t.positionText,
        positionStatus: t.positionStatus,
      })),
      // Data SDE Masal
      sdeMasal: sdeMasalItem
        ? {
            id: sdeMasalItem.id,
            statusVerifikasi: sdeMasalItem.statusVerifikasi,
            nomorSurat: sdeMasalItem.nomorSurat,
            klasifikasiName: sdeMasalItem.klasifikasiName,
            skemaTemplate: sdeMasalItem.skemaTemplate,
            versiTemplate: sdeMasalItem.versiTemplate,
            parentNaskahId: sdeMasalItem.parentNaskahId,
          }
        : null,
    };
  }

  // ============================================================
  // GENERATE NASKAH SDE INDIVIDUAL PER PENERIMA
  // ============================================================

  /**
   * Generate naskah SDE individual untuk setiap item SDE Masal yang masih MENUNGGU.
   * Membuat record naskah + sirkulasi (pengirim + penerima eksternal).
   * Update sde_masal.naskahId, nomorSurat, statusVerifikasi.
   *
   * @param ids Array ID sde_masal yang akan diproses. Jika kosong, proses semua yang MENUNGGU.
   * @param creatorPosition Position ID user yang login (untuk akses naskah).
   * @returns Summary { total, success, failed, items }
   */
  async generateAndSendNaskah(
    ids?: string[],
    creatorPosition?: string | number,
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    items: SdeMasalEntity[];
  }> {
    // Ambil item yang akan diproses
    const qb = this.repo.createQueryBuilder('s');
    qb.where("s.perihal != '__CONCEPT__'");
    if (ids && ids.length > 0) {
      qb.andWhere('s.id IN (:...ids)', { ids });
    } else {
      qb.andWhere('s.status_verifikasi = :status', { status: 'MENUNGGU' });
    }
    const items = await qb.getMany();

    if (items.length === 0) {
      return { total: 0, success: 0, failed: 0, items: [] };
    }

    // Ambil org_data untuk validasi pengirim (gunakan tanggal konsep pertama)
    const firstItem = items[0];
    const tglKonsep = firstItem.tanggalKonsep
      ? new Date(firstItem.tanggalKonsep as any).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    let orgData: any = null;
    try {
      orgData = await this.orgDataService.findOrg(tglKonsep);
    } catch (e) {
      this.logger.warn(`Gagal load org_data: ${e?.message}`);
    }

    let success = 0;
    let failed = 0;
    const updatedItems: SdeMasalEntity[] = [];

    for (const item of items) {
      try {
        // Skip jika sudah punya naskahId
        if (item.naskahId) {
          updatedItems.push(item);
          success++;
          continue;
        }

        // Validasi pengirim dari org_data
        const pengirimPosId = Number(item.pengirimId);
        let pengirimPos: any = null;
        if (orgData?.position_json) {
          pengirimPos = orgData.position_json.find(
            (p: any) => Number(p.position) === pengirimPosId,
          );
        }

        // Render konten dengan variabel penerima
        const konten = this.renderKonten(item.isiRingkasan || '', {
          tertuju: item.tertuju,
          nama: item.tertuju?.split(' - ')[0] || '',
          jabatan: item.jabatanPenerima,
          persnum: item.kodePos,
          alamat: item.alamat,
          kota: item.kota,
          kodePos: item.kodePos,
          jabatanPenerima: item.jabatanPenerima,
          keterangan: item.isiRingkasan,
        });

        // Buat atau cari eksternal record untuk penerima
        const eksternal = await this.findOrCreateEksternal({
          nama: item.tertuju,
          alamat: item.alamat,
          kota: item.kota,
          jabatanPenerima: item.jabatanPenerima,
          createdByPosition: item.pengirimId,
        });

        // Generate nomor surat draft
        const naskahId = uuidv4();
        const nomorDraft = `DRAFT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

        // Parse klasifikasi
        const klasifikasiParts = (item.klasifikasiName || '').split(' - ');
        const klasifikasiCode = klasifikasiParts[0] || '';
        const klasifikasiText =
          klasifikasiParts[1] || klasifikasiParts[0] || '';

        // Buat naskah SDE
        const naskah = new NaskahEntity();
        naskah.id = naskahId;
        naskah.jenis = 'SDE';
        naskah.klasifikasi = klasifikasiCode;
        naskah.klasifikasi_text = klasifikasiText;
        naskah.sifat = (item.sifatSurat as any) || 'biasa';
        naskah.nomor = nomorDraft;
        naskah.tanggal = item.tanggalKonsep ? new Date(item.tanggalKonsep as any) : new Date();
        naskah.lampiran = item.lampiranUrl || '';
        naskah.perihal = item.perihal;
        naskah.konten = konten;
        naskah.tempat = pengirimPos?.area_text || '';
        naskah.status = 'draf';
        naskah.english = false;
        naskah.createdByPosition = item.pengirimId || '';
        await this.naskahRepository.save(naskah);

        // Buat sirkulasi pengirim
        if (pengirimPos) {
          const sirkulasiPengirim = new NaskahSirkulasi();
          sirkulasiPengirim.id = uuidv4();
          sirkulasiPengirim.idNaskah = naskahId;
          sirkulasiPengirim.sirkuler = 'pengirim';
          sirkulasiPengirim.company = String(COMPANY_ID);
          sirkulasiPengirim.companyText = 'PERUM LPPNPI';
          sirkulasiPengirim.area = pengirimPos.area ? String(pengirimPos.area) : null;
          sirkulasiPengirim.areaText = pengirimPos.area_text || null;
          sirkulasiPengirim.subArea = pengirimPos.sub_area ? String(pengirimPos.sub_area) : null;
          sirkulasiPengirim.subAreaText = pengirimPos.sub_area_text || null;
          sirkulasiPengirim.organization = pengirimPos.organization_id ? String(pengirimPos.organization_id) : null;
          sirkulasiPengirim.organizationText = pengirimPos.organization_text || null;
          sirkulasiPengirim.position = String(pengirimPos.position);
          sirkulasiPengirim.positionText = pengirimPos.position_text || null;
          sirkulasiPengirim.positionStatus = 'ybs';
          sirkulasiPengirim.idSirkuler = String(pengirimPos.persnum_person ?? pengirimPos.persnum ?? pengirimPos.position ?? '');
          sirkulasiPengirim.namaSirkuler = pengirimPos.persnum_person_text || pengirimPos.nama || pengirimPos.position_text || '';
          sirkulasiPengirim.isDraft = true;
          sirkulasiPengirim.urutan = 0;
          await this.sirkulasiRepository.save(sirkulasiPengirim);
        }

        // Buat sirkulasi penerima eksternal
        const sirkulasiPenerima = new NaskahSirkulasi();
        sirkulasiPenerima.id = uuidv4();
        sirkulasiPenerima.idNaskah = naskahId;
        sirkulasiPenerima.sirkuler = 'penerima';
        sirkulasiPenerima.company = null;
        sirkulasiPenerima.companyText = eksternal.nama;
        sirkulasiPenerima.area = null;
        sirkulasiPenerima.areaText = null;
        sirkulasiPenerima.subArea = null;
        sirkulasiPenerima.subAreaText = null;
        sirkulasiPenerima.organization = null;
        sirkulasiPenerima.organizationText = eksternal.nama;
        sirkulasiPenerima.position = null;
        sirkulasiPenerima.positionText = item.jabatanPenerima || null;
        sirkulasiPenerima.positionStatus = 'ext';
        sirkulasiPenerima.idSirkuler = eksternal.id;
        sirkulasiPenerima.namaSirkuler = eksternal.nama;
        sirkulasiPenerima.alamat = eksternal.alamat || null;
        sirkulasiPenerima.telepon = eksternal.telepon || null;
        sirkulasiPenerima.email = eksternal.email || null;
        sirkulasiPenerima.isDraft = true;
        sirkulasiPenerima.urutan = 1;
        await this.sirkulasiRepository.save(sirkulasiPenerima);

        // Buat sirkulasi tambahan untuk creator (user yang login)
        // agar naskah bisa dibuka di halaman detail oleh user yang membuat wizard.
        // Jika creatorPosition berbeda dari pengirimPos.position, buat sirkulasi pengirim duplikat.
        if (creatorPosition && String(creatorPosition) !== String(pengirimPos?.position)) {
          // Cari creator di org_data
          let creatorPos: any = null;
          if (orgData?.position_json) {
            creatorPos = orgData.position_json.find(
              (p: any) => Number(p.position) === Number(creatorPosition),
            );
          }

          const sirkulasiCreator = new NaskahSirkulasi();
          sirkulasiCreator.id = uuidv4();
          sirkulasiCreator.idNaskah = naskahId;
          sirkulasiCreator.sirkuler = 'pengirim';
          sirkulasiCreator.company = String(COMPANY_ID);
          sirkulasiCreator.companyText = 'PERUM LPPNPI';
          sirkulasiCreator.area = creatorPos?.area ? String(creatorPos.area) : (pengirimPos?.area ? String(pengirimPos.area) : null);
          sirkulasiCreator.areaText = creatorPos?.area_text || pengirimPos?.area_text || null;
          sirkulasiCreator.subArea = creatorPos?.sub_area ? String(creatorPos.sub_area) : (pengirimPos?.sub_area ? String(pengirimPos.sub_area) : null);
          sirkulasiCreator.subAreaText = creatorPos?.sub_area_text || pengirimPos?.sub_area_text || null;
          sirkulasiCreator.organization = creatorPos?.organization_id ? String(creatorPos.organization_id) : (pengirimPos?.organization_id ? String(pengirimPos.organization_id) : null);
          sirkulasiCreator.organizationText = creatorPos?.organization_text || pengirimPos?.organization_text || null;
          sirkulasiCreator.position = String(creatorPosition);
          sirkulasiCreator.positionText = creatorPos?.position_text || pengirimPos?.position_text || null;
          sirkulasiCreator.positionStatus = 'ybs';
          sirkulasiCreator.idSirkuler = String(creatorPos?.persnum_person ?? creatorPos?.persnum ?? creatorPosition ?? '');
          sirkulasiCreator.namaSirkuler = creatorPos?.persnum_person_text || creatorPos?.nama || creatorPos?.position_text || '';
          sirkulasiCreator.isDraft = true;
          sirkulasiCreator.urutan = 2;
          await this.sirkulasiRepository.save(sirkulasiCreator);
        }

        // Update sde_masal
        item.naskahId = naskahId;
        item.nomorSurat = nomorDraft;
        item.statusVerifikasi = 'TERKIRIM';
        item.errorMessage = null;
        await this.repo.save(item);
        updatedItems.push(item);
        success++;
      } catch (err) {
        this.logger.error(
          `Gagal generate naskah untuk item ${item.id}: ${err?.message ?? err}`,
        );
        item.statusVerifikasi = 'GAGAL';
        item.errorMessage = String(err?.message ?? err).substring(0, 500);
        await this.repo.save(item);
        updatedItems.push(item);
        failed++;
      }
    }

    return {
      total: items.length,
      success,
      failed,
      items: updatedItems,
    };
  }

  /**
   * Render konten template dengan variabel penerima.
   */
  private renderKonten(
    templateKonten: string,
    penerima: {
      tertuju: string;
      nama?: string;
      jabatan?: string | null;
      persnum?: string | null;
      alamat: string | null;
      kota: string | null;
      kodePos: string | null;
      jabatanPenerima?: string | null;
      keterangan?: string | null;
    },
  ): string {
    if (!templateKonten) return '';
    const jabatan = penerima.jabatan || penerima.jabatanPenerima || '';
    const persnum = penerima.persnum || penerima.kodePos || '';
    return templateKonten
      .replace(/\{\{tertuju\}\}/g, penerima.tertuju || '')
      .replace(/\{\{nama\}\}/g, penerima.nama || '')
      .replace(/\{\{jabatan\}\}/g, jabatan || '')
      .replace(/\{\{persnum\}\}/g, persnum || '')
      .replace(/\{\{keterangan\}\}/g, penerima.keterangan || '')
      .replace(/\{\{alamat\}\}/g, penerima.alamat || '')
      .replace(/\{\{kota\}\}/g, penerima.kota || '')
      .replace(/\{\{kode_pos\}\}/g, penerima.kodePos || '')
      .replace(/\{\{kodepos\}\}/g, penerima.kodePos || '');
  }

  /**
   * Cari atau buat record eksternal berdasarkan nama penerima.
   * Jika sudah ada (berdasarkan nama + createdByPosition), gunakan yang ada.
   * Jika belum, buat record baru.
   */
  private async findOrCreateEksternal(data: {
    nama: string;
    alamat: string | null;
    kota: string | null;
    jabatanPenerima: string | null;
    createdByPosition: string | null;
  }): Promise<EksternalEntity> {
    // Cari berdasarkan nama (case-insensitive) dan createdByPosition
    const existing = await this.eksternalRepository
      .createQueryBuilder('e')
      .where('LOWER(e.nama) = LOWER(:nama)', { nama: data.nama })
      .andWhere('e.id_position_pembuat = :pos', {
        pos: data.createdByPosition || '',
      })
      .getOne();

    if (existing) {
      return existing;
    }

    // Buat record eksternal baru
    const alamatLengkap = [data.alamat, data.kota].filter(Boolean).join(', ');

    const eksternal = new EksternalEntity();
    eksternal.id = uuidv4();
    eksternal.id_position_pembuat = data.createdByPosition || '';
    eksternal.company = String(COMPANY_ID);
    eksternal.area = '';
    eksternal.nama = data.nama;
    eksternal.alamat = alamatLengkap || '';
    eksternal.telepon = '';
    eksternal.email = '';
    eksternal.kontak = data.jabatanPenerima || '';
    eksternal.aktif = true;
    return this.eksternalRepository.save(eksternal);
  }
}
