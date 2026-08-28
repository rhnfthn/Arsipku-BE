import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
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

type SdeMasalVerifikator = {
  urutan: number;
  persnum: string;
  position: string;
  nama: string;
  jabatan: string;
  status: 'pending' | 'waiting' | 'verified' | 'rejected';
  verifiedAt?: string | null;
  rejectedAt?: string | null;
  catatan?: string | null;
};

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
      sifatSurat: dto.sifat ?? 'biasa',
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
    const sheetName =
      workbook.SheetNames.find((n) =>
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
        const perihalRow = getCol(row, 'Perihal', 'perihal');
        const idTertuju = getCol(row, 'id_tertuju', 'idTertuju');
        const idramount = getCol(row, 'idramount');
        const usdamount = getCol(row, 'usdamount');
        const namacro = getCol(row, 'namacro');
        const email = getCol(row, 'email', 'Email');
        const tembusan = getCol(row, 'tembusan', 'Tembusan');
        const isRevisionRaw = getCol(row, 'is_revision', 'isRevision');
        const emailTertuju = getCol(row, 'email_tertuju', 'emailTertuju');
        const emailCc = getCol(row, 'email_cc', 'emailCc');
        const emailBcc = getCol(row, 'email_bcc', 'emailBcc');

        // Field skema keuangan / tagihan PINP
        const jumlahTagihanIdr = getCol(
          row,
          'jumlah_tagihan_idr',
          'jumlahTagihanIdr',
        );
        const jumlahTagihanUsd = getCol(
          row,
          'jumlah_tagihan_usd',
          'jumlahTagihanUsd',
        );
        const namaCro = getCol(row, 'nama_cro', 'namaCro');
        const emailCro = getCol(row, 'email_cro', 'emailCro');
        const jabatanSigner = getCol(row, 'jabatan_signer', 'jabatanSigner');
        const namaSigner = getCol(row, 'nama_signer', 'namaSigner');

        // Field skema umum / tagihan PJNP
        const jumlahLampiran = getCol(row, 'jumlah_lampiran', 'jumlahLampiran');
        const jabatanPenerima = getCol(row, 'jabatan_penerima', 'jabatanPenerima');
        const alamatPenerima = getCol(row, 'alamat_penerima', 'alamatPenerima');
        const panggilanPenerima = getCol(row, 'panggilan_penerima', 'panggilanPenerima');
        const nominalRupiah = getCol(row, 'nominal_rupiah', 'nominalRupiah');
        const nominalDolar = getCol(row, 'nominal_dolar', 'nominalDolar');
        const tembusan1 = getCol(row, 'tembusan_1', 'tembusan1');
        const tembusan2 = getCol(row, 'tembusan_2', 'tembusan2');

        // Skip baris kosong (semua field kosong)
        if (
          !perihalRow &&
          !idTertuju &&
          !idramount &&
          !usdamount &&
          !namacro &&
          !email &&
          !tembusan &&
          !emailTertuju &&
          !emailCc &&
          !emailBcc &&
          !jumlahTagihanIdr &&
          !jumlahTagihanUsd &&
          !namaCro &&
          !emailCro &&
          !jabatanSigner &&
          !namaSigner &&
          !jumlahLampiran &&
          !jabatanPenerima &&
          !alamatPenerima &&
          !panggilanPenerima &&
          !nominalRupiah &&
          !nominalDolar &&
          !tembusan1 &&
          !tembusan2
        ) {
          continue;
        }

        // Perihal wajib
        if (!perihalRow) {
          failed++;
          continue;
        }

        const isRevision =
          isRevisionRaw === '1' || isRevisionRaw.toLowerCase() === 'true'
            ? 1
            : 0;

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
          perihal: perihalRow || concept.perihal || '',
          tertuju: idTertuju || perihalRow || '',
          alamat: alamatPenerima || null,
          kota: null,
          kodePos: null,
          jabatanPenerima: jabatanPenerima || null,
          isiRingkasan: null,
          jenisTemplate: skemaTemplate,
          statusVerifikasi: 'MENUNGGU',
          idTertuju: idTertuju || null,
          idramount: idramount || null,
          usdamount: usdamount || null,
          namacro: namacro || null,
          email: email || null,
          tembusan: tembusan || null,
          isRevision,
          emailTertuju: emailTertuju || null,
          emailCc: emailCc || null,
          emailBcc: emailBcc || null,
          jumlahTagihanIdr: jumlahTagihanIdr || null,
          jumlahTagihanUsd: jumlahTagihanUsd || null,
          namaCro: namaCro || null,
          emailCro: emailCro || null,
          jabatanSigner: jabatanSigner || null,
          namaSigner: namaSigner || null,
          jumlahLampiran: jumlahLampiran || null,
          panggilanPenerima: panggilanPenerima || null,
          nominalRupiah: nominalRupiah || null,
          nominalDolar: nominalDolar || null,
          tembusan1: tembusan1 || null,
          tembusan2: tembusan2 || null,
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

        // Bangun tertuju dari id_tertuju atau nama + jabatan
        const nama = p.nama || '';
        const jabatan = p.jabatan || p.jabatanPenerima || '';
        const tertuju =
          p.idTertuju ||
          p.tertuju ||
          (nama && jabatan ? `${nama} - ${jabatan}` : nama || jabatan || '-');
        const persnum = p.persnum || p.kodePos || '';

        // Ganti variabel dinamis di konten template. Nilai Excel yang diunggah
        // tersedia lewat p.variables, sementara perihal dan tertuju adalah
        // kolom standar yang selalu dipertahankan pada template.
        let konten = template?.konten || '';
        if (konten) {
          const values = {
            ...(p.variables || {}),
            ...p,
            perihal: p.perihal || konsep.perihal || '-',
            tertuju,
            nama: nama || '-',
            jabatan: jabatan || '-',
            persnum: persnum || '-',
            kode_pos: p.kodePos || '-',
            kodepos: p.kodePos || '-',
            tanggal_surat: konsep.tanggalKonsep || '-',
            nomor_surat: p.nomorSurat || '-',
            sifat_surat: konsep.sifat || 'Biasa',
            nominal_rupiah: p.nominalRupiah || p.idramount || '-',
            nominal_dolar: p.nominalDolar || p.usdamount || '-',
            jabatan_penerima: p.jabatanPenerima || p.jabatan || '-',
            alamat_penerima: p.alamatPenerima || p.alamat || '-',
            panggilan_penerima: p.panggilanPenerima || 'Bapak/Ibu',
            tembusan_1: p.tembusan1 || (p.tembusan ? p.tembusan.split(';')[0] : '-'),
            tembusan_2: p.tembusan2 || (p.tembusan ? p.tembusan.split(';')[1] || '-' : '-'),
          };
          konten = konten.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key) =>
            String(values[key] ?? '-'),
          );
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
          perihal: p.perihal || konsep.perihal || '',
          tertuju,
          alamat: p.alamatPenerima || p.alamat || null,
          kota: p.kota || null,
          kodePos: persnum || null,
          jabatanPenerima: p.jabatanPenerima || jabatan || null,
          isiRingkasan: konten || null,
          jenisTemplate: template?.skema || null,
          statusVerifikasi: 'MENUNGGU',
          // Field dinamis dari Excel (mapping kolom template)
          idTertuju: p.idTertuju || null,
          idramount: p.idramount || null,
          usdamount: p.usdamount || null,
          namacro: p.namacro || null,
          email: p.email || null,
          tembusan: p.tembusan || null,
          isRevision: p.isRevision === true || p.isRevision === 1 ? 1 : 0,
          emailTertuju: p.emailTertuju || null,
          emailCc: p.emailCc || null,
          emailBcc: p.emailBcc || null,
          jumlahTagihanIdr: p.jumlahTagihanIdr || null,
          jumlahTagihanUsd: p.jumlahTagihanUsd || null,
          namaCro: p.namaCro || null,
          emailCro: p.emailCro || null,
          jabatanSigner: p.jabatanSigner || null,
          namaSigner: p.namaSigner || null,
          jumlahLampiran: p.jumlahLampiran || null,
          panggilanPenerima: p.panggilanPenerima || null,
          nominalRupiah: p.nominalRupiah || null,
          nominalDolar: p.nominalDolar || null,
          tembusan1: p.tembusan1 || null,
          tembusan2: p.tembusan2 || null,
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

  async submitVerification(
    ids: string[],
    verifikators: any[],
  ): Promise<{ total: number; items: SdeMasalEntity[] }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Data SDE Massal tidak ditemukan');
    }
    if (!Array.isArray(verifikators) || verifikators.length === 0) {
      throw new BadRequestException('Pilih minimal satu verifikator');
    }

    const rows = await this.repo.find({ where: { id: In(ids) } });
    if (rows.length === 0) {
      throw new NotFoundException('Data SDE Massal tidak ditemukan');
    }

    const verifierRows = this.normalizeVerifikators(verifikators);
    for (const item of rows) {
      item.verifikators = verifierRows;
      item.currentVerifikatorUrutan = 1;
      item.statusVerifikasi = 'MENUNGGU_VERIFIKASI';
      item.submittedAt = new Date();
      item.errorMessage = null;
    }

    const saved = await this.repo.save(rows);
    return { total: saved.length, items: saved };
  }

  async findVerificationForUser(user: any) {
    const persnum = String(user?.persnum ?? user?.username ?? '').trim();
    const position = String(user?.position ?? user?.positionId ?? '').trim();

    const rows = await this.repo
      .createQueryBuilder('s')
      .where("s.perihal != '__CONCEPT__'")
      .andWhere('s.status_verifikasi IN (:...statuses)', {
        statuses: ['MENUNGGU_VERIFIKASI', 'TERVERIFIKASI', 'DITOLAK'],
      })
      .orderBy('s.submitted_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getMany();

    return rows.filter((item) =>
      (item.verifikators || []).some((verifikator: any) => {
        const samePersnum = persnum && String(verifikator.persnum) === persnum;
        const samePosition = position && String(verifikator.position) === position;
        return samePersnum || samePosition;
      }),
    );
  }

  async approveVerification(id: string, user: any, catatan?: string | null) {
    return this.verifySdeMasal(id, user, 'approve', catatan);
  }

  async rejectVerification(id: string, user: any, catatan?: string | null) {
    return this.verifySdeMasal(id, user, 'reject', catatan);
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
    if (filter.klasifikasiId) {
      qb.andWhere('s.klasifikasi_id = :klasifikasiId', {
        klasifikasiId: filter.klasifikasiId,
      });
    }
    if (filter.tahun) {
      qb.andWhere('YEAR(s.tanggal_konsep) = :tahun', { tahun: filter.tahun });
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

  private normalizeVerifikators(verifikators: any[]): SdeMasalVerifikator[] {
    return verifikators.slice(0, 3).map((item, index) => ({
      urutan: index + 1,
      persnum: String(item.persnum ?? item.persnumPerson ?? '').trim(),
      position: String(item.position ?? item.positionId ?? '').trim(),
      nama: item.nama || item.name || '-',
      jabatan: item.jabatan || item.positionText || '-',
      status: index === 0 ? 'waiting' : 'pending',
      verifiedAt: null,
      rejectedAt: null,
      catatan: null,
    }));
  }

  private async verifySdeMasal(
    id: string,
    user: any,
    action: 'approve' | 'reject',
    catatan?: string | null,
  ) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Data SDE Massal tidak ditemukan');

    const verifikators = [...(item.verifikators || [])] as SdeMasalVerifikator[];
    if (verifikators.length === 0) {
      throw new BadRequestException('SDE Massal belum memiliki verifikator');
    }

    const persnum = String(user?.persnum ?? user?.username ?? '').trim();
    const position = String(user?.position ?? user?.positionId ?? '').trim();
    const current = verifikators.find((v) => v.status === 'waiting');
    if (!current) throw new BadRequestException('Tidak ada giliran verifikasi aktif');

    const isCurrentUser =
      (persnum && String(current.persnum) === persnum) ||
      (position && String(current.position) === position);
    if (!isCurrentUser) {
      throw new ForbiddenException('Belum giliran Anda untuk memverifikasi SDE Massal ini');
    }

    if (action === 'reject') {
      current.status = 'rejected';
      current.rejectedAt = new Date().toISOString();
      current.catatan = catatan || null;
      item.statusVerifikasi = 'DITOLAK';
      item.errorMessage = catatan || 'Ditolak verifikator';
      item.verifikators = verifikators;
      return this.repo.save(item);
    }

    current.status = 'verified';
    current.verifiedAt = new Date().toISOString();
    current.catatan = catatan || null;

    const next = verifikators.find((v) => v.urutan > current.urutan && v.status === 'pending');
    if (next) {
      next.status = 'waiting';
      item.currentVerifikatorUrutan = next.urutan;
      item.statusVerifikasi = 'MENUNGGU_VERIFIKASI';
    } else {
      item.currentVerifikatorUrutan = verifikators.length;
      item.statusVerifikasi = 'TERVERIFIKASI';
      item.errorMessage = null;
    }

    item.verifikators = verifikators;
    return this.repo.save(item);
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
  async generateTemplate(skemaTemplate?: string): Promise<Buffer> {
    const skema = (skemaTemplate || '').toUpperCase();
    const isKeuangan = skema === 'KEUANGAN' || skema === 'SDE-KEUANGAN';

    // Ambil data eksternal aktif untuk contoh id_tertuju dan sheet referensi
    const eksternalList = await this.eksternalRepository
      .createQueryBuilder('e')
      .select(['e.kode', 'e.nama', 'e.email'])
      .where('e.aktif = :aktif', { aktif: true })
      .orderBy('e.kode', 'ASC')
      .getMany();

    // Ambil 3 kode pertama sebagai contoh di sheet Data Penerima
    const contoh1 = eksternalList[0]?.kode || '112';
    const contoh2 = eksternalList[1]?.kode || '117';
    const contoh3 = eksternalList[2]?.kode || '119';

    let ws1: XLSX.WorkSheet;
    let ws2: XLSX.WorkSheet;
    let ws3: XLSX.WorkSheet;

    if (isKeuangan) {
      // Sheet 1: Data Penerima (skema keuangan / tagihan PINP)
      const dataSheet = [
        [
          'No',
          'Perihal',
          'id_tertuju',
          'jumlah_tagihan_idr',
          'jumlah_tagihan_usd',
          'nama_cro',
          'email_cro',
          'jabatan_signer',
          'nama_signer',
          'tembusan',
          'is_revision',
        ],
        [
          1,
          'Pemberitahuan Tagihan PINP',
          contoh1,
          '15000000',
          '1000',
          'CRO Contoh',
          'cro@example.com',
          'Manager Keuangan',
          'Nama Signer',
          'Direktur Jenderal Perhubungan Udara;Ketua Dewan Pengawas Perum LPPNPI',
          0,
        ],
        [
          2,
          'Pemberitahuan Tagihan PINP',
          contoh2,
          '25000000',
          '1500',
          'CRO Contoh',
          'cro@example.com',
          'Manager Keuangan',
          'Nama Signer',
          'Direktur Jenderal Perhubungan Udara',
          0,
        ],
        [
          3,
          'Pemberitahuan Tagihan PINP',
          contoh3,
          '5000000',
          '500',
          'CRO Contoh',
          'cro@example.com',
          'Manager Keuangan',
          'Nama Signer',
          '',
          1,
        ],
      ];

      ws1 = XLSX.utils.aoa_to_sheet(dataSheet);
      ws1['!cols'] = [
        { wch: 5 },
        { wch: 35 },
        { wch: 15 },
        { wch: 20 },
        { wch: 20 },
        { wch: 25 },
        { wch: 30 },
        { wch: 25 },
        { wch: 25 },
        { wch: 50 },
        { wch: 12 },
      ];

      // Sheet 2: Petunjuk Pengisian
      const petunjukSheet = [
        ['Petunjuk Pengisian Template SDE Masal - Skema Keuangan (Tagihan PINP)'],
        [''],
        ['1. Kolom "Perihal" WAJIB diisi. Default: "Pemberitahuan Tagihan PINP".'],
        [
          '2. Kolom "id_tertuju" diisi dengan kode ID Tertuju dari sheet "Referensi ID Tertuju".',
        ],
        ['   Contoh: 112, 117, 119, dst.'],
        ['3. Kolom "jumlah_tagihan_idr" WAJIB diisi (angka tanpa titik/koma). Contoh: 15000000.'],
        ['4. Kolom "jumlah_tagihan_usd" WAJIB diisi (angka tanpa titik/koma). Contoh: 1000.'],
        ['5. Kolom "nama_cro" WAJIB diisi nama Customer Relationship Officer (CRO).'],
        ['6. Kolom "email_cro" WAJIB diisi email CRO.'],
        ['7. Kolom "jabatan_signer" WAJIB diisi jabatan penandatangan surat.'],
        ['8. Kolom "nama_signer" WAJIB diisi nama penandatangan surat.'],
        [
          '9. Kolom "tembusan" opsional (pisahkan dengan titik koma ; jika lebih dari satu).',
        ],
        ['10. Kolom "is_revision" opsional (0 = bukan revisi, 1 = revisi).'],
        ['11. File upload harus format .xlsx atau .xls.'],
        ['12. Maksimal 1000 baris per upload.'],
        [''],
        ['Variabel dinamis yang bisa dipakai di konten surat:'],
        ['  {{perihal}}             → Perihal'],
        ['  {{id_tertuju}}          → ID Tertuju'],
        ['  {{jumlah_tagihan_idr}}  → Jumlah Tagihan IDR'],
        ['  {{jumlah_tagihan_usd}}  → Jumlah Tagihan USD'],
        ['  {{nama_cro}}            → Nama CRO'],
        ['  {{email_cro}}           → Email CRO'],
        ['  {{jabatan_signer}}      → Jabatan Signer'],
        ['  {{nama_signer}}         → Nama Signer'],
        ['  {{tembusan}}            → Tembusan'],
      ];

      ws2 = XLSX.utils.aoa_to_sheet(petunjukSheet);
      ws2['!cols'] = [{ wch: 75 }];

      // Sheet 3: Mapping Field
      const mappingSheet = [
        ['Kolom Excel', 'Field Backend', 'Tipe Data', 'Wajib', 'Variabel Konten'],
        ['No', 'no', 'number', 'Tidak', '-'],
        ['Perihal', 'perihal', 'string', 'YA', '{{perihal}}'],
        ['id_tertuju', 'idTertuju', 'string', 'YA', '{{id_tertuju}}'],
        ['jumlah_tagihan_idr', 'jumlahTagihanIdr', 'number', 'YA', '{{jumlah_tagihan_idr}}'],
        ['jumlah_tagihan_usd', 'jumlahTagihanUsd', 'number', 'YA', '{{jumlah_tagihan_usd}}'],
        ['nama_cro', 'namaCro', 'string', 'YA', '{{nama_cro}}'],
        ['email_cro', 'emailCro', 'string', 'YA', '{{email_cro}}'],
        ['jabatan_signer', 'jabatanSigner', 'string', 'YA', '{{jabatan_signer}}'],
        ['nama_signer', 'namaSigner', 'string', 'YA', '{{nama_signer}}'],
        ['tembusan', 'tembusan', 'string', 'Tidak', '{{tembusan}}'],
        ['is_revision', 'isRevision', 'number', 'Tidak', '-'],
      ];

      ws3 = XLSX.utils.aoa_to_sheet(mappingSheet);
      ws3['!cols'] = [
        { wch: 22 },
        { wch: 22 },
        { wch: 12 },
        { wch: 10 },
        { wch: 28 },
      ];
    } else {
      // Sheet 1: Data Penerima (skema umum / tagihan PJNP)
      const dataSheet = [
        [
          'No',
          'Perihal',
          'id_tertuju',
          'jumlah_lampiran',
          'jabatan_penerima',
          'alamat_penerima',
          'panggilan_penerima',
          'nominal_rupiah',
          'nominal_dolar',
          'nama_cro',
          'email_cro',
          'jabatan_signer',
          'nama_signer',
          'tembusan_1',
          'tembusan_2',
          'is_revision',
        ],
        [
          1,
          'Pemberitahuan Tagihan PJNP',
          contoh1,
          '1 (lembar)',
          'Direktur Jenderal Perhubungan Udara',
          'Jakarta / Di tempat',
          'Bapak/Ibu',
          'Rp 15.000.000',
          '$ 1.000',
          'CRO Contoh',
          'cro@example.com',
          'Direktur Utama',
          'Nama Signer',
          'Direktur Jenderal Perhubungan Udara',
          'Ketua Dewan Pengawas Perum LPPNPI',
          0,
        ],
        [
          2,
          'Pemberitahuan Tagihan PJNP',
          contoh2,
          '1 (lembar)',
          'Direktur Jenderal Perhubungan Udara',
          'Jakarta / Di tempat',
          'Bapak/Ibu',
          'Rp 25.000.000',
          '$ 1.500',
          'CRO Contoh',
          'cro@example.com',
          'Direktur Utama',
          'Nama Signer',
          'Direktur Jenderal Perhubungan Udara',
          '',
          0,
        ],
        [
          3,
          'Pemberitahuan Tagihan PJNP',
          contoh3,
          '-',
          'Direktur Jenderal Perhubungan Udara',
          'Di tempat',
          'Bapak/Ibu',
          'Rp 5.000.000',
          '$ 500',
          'CRO Contoh',
          'cro@example.com',
          'Direktur Utama',
          'Nama Signer',
          '',
          '',
          1,
        ],
      ];

      ws1 = XLSX.utils.aoa_to_sheet(dataSheet);
      ws1['!cols'] = [
        { wch: 5 },
        { wch: 35 },
        { wch: 15 },
        { wch: 18 },
        { wch: 35 },
        { wch: 30 },
        { wch: 20 },
        { wch: 20 },
        { wch: 15 },
        { wch: 25 },
        { wch: 30 },
        { wch: 25 },
        { wch: 25 },
        { wch: 40 },
        { wch: 40 },
        { wch: 12 },
      ];

      // Sheet 2: Petunjuk Pengisian
      const petunjukSheet = [
        ['Petunjuk Pengisian Template SDE Masal - Skema Umum (Tagihan PJNP)'],
        [''],
        ['1. Kolom "Perihal" WAJIB diisi. Default: "Pemberitahuan Tagihan PJNP".'],
        [
          '2. Kolom "id_tertuju" diisi dengan kode ID Tertuju dari sheet "Referensi ID Tertuju".',
        ],
        ['   Contoh: 112, 117, 119, dst.'],
        ['3. Kolom "jumlah_lampiran" opsional. Contoh: "1 (lembar)" atau "-".'],
        ['4. Kolom "jabatan_penerima" WAJIB diisi jabatan penerima surat.'],
        ['5. Kolom "alamat_penerima" WAJIB diisi alamat penerima atau "Di tempat".'],
        ['6. Kolom "panggilan_penerima" opsional. Default: "Bapak/Ibu".'],
        ['7. Kolom "nominal_rupiah" WAJIB diisi nominal tagihan IDR. Contoh: "Rp 15.000.000".'],
        ['8. Kolom "nominal_dolar" WAJIB diisi nominal tagihan USD. Contoh: "$ 1.000".'],
        ['9. Kolom "nama_cro" WAJIB diisi nama Customer Relationship Officer (CRO).'],
        ['10. Kolom "email_cro" WAJIB diisi email CRO.'],
        ['11. Kolom "jabatan_signer" WAJIB diisi jabatan penandatangan surat.'],
        ['12. Kolom "nama_signer" WAJIB diisi nama penandatangan surat.'],
        ['13. Kolom "tembusan_1" dan "tembusan_2" opsional.'],
        ['14. Kolom "is_revision" opsional (0 = bukan revisi, 1 = revisi).'],
        ['15. File upload harus format .xlsx atau .xls.'],
        ['16. Maksimal 1000 baris per upload.'],
        [''],
        ['Variabel dinamis yang bisa dipakai di konten surat:'],
        ['  {{perihal}}            → Perihal'],
        ['  {{id_tertuju}}         → ID Tertuju'],
        ['  {{jumlah_lampiran}}    → Jumlah Lampiran'],
        ['  {{jabatan_penerima}}   → Jabatan Penerima'],
        ['  {{alamat_penerima}}    → Alamat Penerima'],
        ['  {{panggilan_penerima}} → Panggilan Penerima'],
        ['  {{nominal_rupiah}}     → Nominal Rupiah'],
        ['  {{nominal_dolar}}      → Nominal Dolar'],
        ['  {{nama_cro}}           → Nama CRO'],
        ['  {{email_cro}}          → Email CRO'],
        ['  {{jabatan_signer}}     → Jabatan Signer'],
        ['  {{nama_signer}}        → Nama Signer'],
        ['  {{tembusan_1}}         → Tembusan 1'],
        ['  {{tembusan_2}}         → Tembusan 2'],
      ];

      ws2 = XLSX.utils.aoa_to_sheet(petunjukSheet);
      ws2['!cols'] = [{ wch: 75 }];

      // Sheet 3: Mapping Field
      const mappingSheet = [
        ['Kolom Excel', 'Field Backend', 'Tipe Data', 'Wajib', 'Variabel Konten'],
        ['No', 'no', 'number', 'Tidak', '-'],
        ['Perihal', 'perihal', 'string', 'YA', '{{perihal}}'],
        ['id_tertuju', 'idTertuju', 'string', 'YA', '{{id_tertuju}}'],
        ['jumlah_lampiran', 'jumlahLampiran', 'string', 'Tidak', '{{jumlah_lampiran}}'],
        ['jabatan_penerima', 'jabatanPenerima', 'string', 'YA', '{{jabatan_penerima}}'],
        ['alamat_penerima', 'alamatPenerima', 'string', 'YA', '{{alamat_penerima}}'],
        ['panggilan_penerima', 'panggilanPenerima', 'string', 'Tidak', '{{panggilan_penerima}}'],
        ['nominal_rupiah', 'nominalRupiah', 'string', 'YA', '{{nominal_rupiah}}'],
        ['nominal_dolar', 'nominalDolar', 'string', 'YA', '{{nominal_dolar}}'],
        ['nama_cro', 'namaCro', 'string', 'YA', '{{nama_cro}}'],
        ['email_cro', 'emailCro', 'string', 'YA', '{{email_cro}}'],
        ['jabatan_signer', 'jabatanSigner', 'string', 'YA', '{{jabatan_signer}}'],
        ['nama_signer', 'namaSigner', 'string', 'YA', '{{nama_signer}}'],
        ['tembusan_1', 'tembusan1', 'string', 'Tidak', '{{tembusan_1}}'],
        ['tembusan_2', 'tembusan2', 'string', 'Tidak', '{{tembusan_2}}'],
        ['is_revision', 'isRevision', 'number', 'Tidak', '-'],
      ];

      ws3 = XLSX.utils.aoa_to_sheet(mappingSheet);
      ws3['!cols'] = [
        { wch: 22 },
        { wch: 22 },
        { wch: 12 },
        { wch: 10 },
        { wch: 28 },
      ];
    }

    // Sheet 4: Referensi ID Tertuju (dari master data tertuju-eksternal)
    const refSheet: any[] = [
      ['ID Tertuju', 'Nama Penerima', 'Email'],
      ...eksternalList.map((e) => [e.kode, e.nama, e.email || '-']),
    ];

    const ws4 = XLSX.utils.aoa_to_sheet(refSheet);
    ws4['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 30 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Data Penerima');
    XLSX.utils.book_append_sheet(wb, ws2, 'Petunjuk Pengisian');
    XLSX.utils.book_append_sheet(wb, ws3, 'Mapping Field');
    XLSX.utils.book_append_sheet(wb, ws4, 'Referensi ID Tertuju');

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
        const konten = this.renderKonten(item.isiRingkasan || '', item);

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
        naskah.tanggal = item.tanggalKonsep
          ? new Date(item.tanggalKonsep as any)
          : new Date();
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
          sirkulasiPengirim.tanggal = naskah.tanggal; // partisi RANGE(YEAR(tanggal))
          sirkulasiPengirim.idNaskah = naskahId;
          sirkulasiPengirim.sirkuler = 'pengirim';
          sirkulasiPengirim.company = String(COMPANY_ID);
          sirkulasiPengirim.companyText = 'PERUM LPPNPI';
          sirkulasiPengirim.area = pengirimPos.area
            ? String(pengirimPos.area)
            : null;
          sirkulasiPengirim.areaText = pengirimPos.area_text || null;
          sirkulasiPengirim.subArea = pengirimPos.sub_area
            ? String(pengirimPos.sub_area)
            : null;
          sirkulasiPengirim.subAreaText = pengirimPos.sub_area_text || null;
          sirkulasiPengirim.organization = pengirimPos.organization_id
            ? String(pengirimPos.organization_id)
            : null;
          sirkulasiPengirim.organizationText =
            pengirimPos.organization_text || null;
          sirkulasiPengirim.position = String(pengirimPos.position);
          sirkulasiPengirim.positionText = pengirimPos.position_text || null;
          sirkulasiPengirim.positionStatus = 'ybs';
          sirkulasiPengirim.idSirkuler = String(
            pengirimPos.persnum_person ??
              pengirimPos.persnum ??
              pengirimPos.position ??
              '',
          );
          sirkulasiPengirim.namaSirkuler =
            pengirimPos.persnum_person_text ||
            pengirimPos.nama ||
            pengirimPos.position_text ||
            '';
          sirkulasiPengirim.isDraft = true;
          sirkulasiPengirim.urutan = 0;
          await this.sirkulasiRepository.save(sirkulasiPengirim);
        }

        // Buat sirkulasi penerima eksternal
        const sirkulasiPenerima = new NaskahSirkulasi();
        sirkulasiPenerima.id = uuidv4();
        sirkulasiPenerima.tanggal = naskah.tanggal; // partisi RANGE(YEAR(tanggal))
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
        if (
          creatorPosition &&
          String(creatorPosition) !== String(pengirimPos?.position)
        ) {
          // Cari creator di org_data
          let creatorPos: any = null;
          if (orgData?.position_json) {
            creatorPos = orgData.position_json.find(
              (p: any) => Number(p.position) === Number(creatorPosition),
            );
          }

          const sirkulasiCreator = new NaskahSirkulasi();
          sirkulasiCreator.id = uuidv4();
          sirkulasiCreator.tanggal = naskah.tanggal; // partisi RANGE(YEAR(tanggal))
          sirkulasiCreator.idNaskah = naskahId;
          sirkulasiCreator.sirkuler = 'pengirim';
          sirkulasiCreator.company = String(COMPANY_ID);
          sirkulasiCreator.companyText = 'PERUM LPPNPI';
          sirkulasiCreator.area = creatorPos?.area
            ? String(creatorPos.area)
            : pengirimPos?.area
              ? String(pengirimPos.area)
              : null;
          sirkulasiCreator.areaText =
            creatorPos?.area_text || pengirimPos?.area_text || null;
          sirkulasiCreator.subArea = creatorPos?.sub_area
            ? String(creatorPos.sub_area)
            : pengirimPos?.sub_area
              ? String(pengirimPos.sub_area)
              : null;
          sirkulasiCreator.subAreaText =
            creatorPos?.sub_area_text || pengirimPos?.sub_area_text || null;
          sirkulasiCreator.organization = creatorPos?.organization_id
            ? String(creatorPos.organization_id)
            : pengirimPos?.organization_id
              ? String(pengirimPos.organization_id)
              : null;
          sirkulasiCreator.organizationText =
            creatorPos?.organization_text ||
            pengirimPos?.organization_text ||
            null;
          sirkulasiCreator.position = String(creatorPosition);
          sirkulasiCreator.positionText =
            creatorPos?.position_text || pengirimPos?.position_text || null;
          sirkulasiCreator.positionStatus = 'ybs';
          sirkulasiCreator.idSirkuler = String(
            creatorPos?.persnum_person ??
              creatorPos?.persnum ??
              creatorPosition ??
              '',
          );
          sirkulasiCreator.namaSirkuler =
            creatorPos?.persnum_person_text ||
            creatorPos?.nama ||
            creatorPos?.position_text ||
            '';
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
    item: SdeMasalEntity,
  ): string {
    if (!templateKonten) return '';
    const penerima = {
      tertuju: item.tertuju,
      nama: item.tertuju?.split(' - ')[0] || '',
      jabatan: item.jabatanPenerima,
      persnum: item.kodePos,
      alamat: item.alamat,
      kota: item.kota,
      kodePos: item.kodePos,
      jabatanPenerima: item.jabatanPenerima,
      keterangan: item.isiRingkasan,
    };
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
      .replace(/\{\{kodepos\}\}/g, penerima.kodePos || '')
      .replace(/\{\{perihal\}\}/g, item.perihal || '')
      .replace(/\{\{tanggal_surat\}\}/g, item.tanggalKonsep ? new Date(item.tanggalKonsep).toLocaleDateString('id-ID') : '')
      .replace(/\{\{nomor_surat\}\}/g, item.nomorSurat || '')
      .replace(/\{\{sifat_surat\}\}/g, item.sifatSurat || 'Biasa')
      .replace(/\{\{jumlah_lampiran\}\}/g, item.lampiranUrl ? '1 (lembar)' : '-')
      .replace(/\{\{jabatan_penerima\}\}/g, item.jabatanPenerima || item.tertuju || '')
      .replace(/\{\{alamat_penerima\}\}/g, item.alamat || 'Di tempat')
      .replace(/\{\{panggilan_penerima\}\}/g, 'Bapak/Ibu')
      .replace(/\{\{nominal_rupiah\}\}/g, item.idramount || '')
      .replace(/\{\{nominal_dolar\}\}/g, item.usdamount || '')
      .replace(/\{\{id_tertuju\}\}/g, item.idTertuju || '')
      .replace(/\{\{idramount\}\}/g, item.idramount || '')
      .replace(/\{\{usdamount\}\}/g, item.usdamount || '')
      .replace(/\{\{namacro\}\}/g, item.namacro || '')
      .replace(/\{\{email\}\}/g, item.email || '')
      .replace(/\{\{tembusan\}\}/g, item.tembusan || '')
      .replace(/\{\{tembusan_1\}\}/g, item.tembusan ? item.tembusan.split(';')[0] : '')
      .replace(/\{\{tembusan_2\}\}/g, item.tembusan ? item.tembusan.split(';')[1] || '' : '')
      .replace(/\{\{email_tertuju\}\}/g, item.emailTertuju || '')
      .replace(/\{\{email_cc\}\}/g, item.emailCc || '')
      .replace(/\{\{email_bcc\}\}/g, item.emailBcc || '')
      .replace(/\{\{jumlah_tagihan_idr\}\}/g, item.jumlahTagihanIdr || '')
      .replace(/\{\{jumlah_tagihan_usd\}\}/g, item.jumlahTagihanUsd || '')
      .replace(/\{\{nama_cro\}\}/g, item.namaCro || '')
      .replace(/\{\{email_cro\}\}/g, item.emailCro || '')
      .replace(/\{\{jabatan_signer\}\}/g, item.jabatanSigner || '')
      .replace(/\{\{nama_signer\}\}/g, item.namaSigner || '');
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
