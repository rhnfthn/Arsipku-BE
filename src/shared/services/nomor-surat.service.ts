import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NaskahEntity } from '../entities/naskah.entity';

/**
 * Mapping Kode Jabatan berdasarkan position/organization
 *
 * Sesuai spesifikasi:
 * P = Dir. SDM
 * U = Dirut (Direktur Utama)
 * S = Dir. Keselamatan
 * O = Dir. Operasi
 * K = Dir. Keuangan
 */
const JABATAN_MAPPING: Record<string, string> = {
  // By position text (case insensitive partial match)
  'direktur utama': 'U',
  'dirut': 'U',
  'direktur sdm': 'P',
  'dir sdm': 'P',
  'dir. sdm': 'P',
  'direktur keselamatan': 'S',
  'dir keselamatan': 'S',
  'dir. keselamatan': 'S',
  'direktur operasi': 'O',
  'dir operasi': 'O',
  'dir. operasi': 'O',
  'direktur keuangan': 'K',
  'dir keuangan': 'K',
  'dir. keuangan': 'K',
};

/**
 * Mapping Kode Lokasi berdasarkan area/sub_area
 *
 * 00 = Pusat
 * 01 = Cabang
 * dst...
 */
const LOKASI_MAPPING: Record<string, string> = {
  pusat: '00',
  'kantor pusat': '00',
  'head office': '00',
  cabang: '01',
};

/**
 * Nama Instansi
 */
const INSTANSI = 'LPPNPI';

/**
 * Konversi bulan ke angka Romawi
 */
const BULAN_ROMAWI: Record<number, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
  8: 'VIII',
  9: 'IX',
  10: 'X',
  11: 'XI',
  12: 'XII',
};

/**
 * Parameter untuk generate nomor surat
 */
export interface GenerateNomorParams {
  jenis: 'DI' | 'ND' | 'SDI' | 'SDE' | 'KA';
  positionText: string;
  positionAbbreviation?: string; // Abbreviation dari org_data (untuk semua jenis surat)
  areaText: string;
  tanggal: Date;
  klasifikasi?: string; // Kode klasifikasi arsip (contoh: PER.07, OPS.12)
}

/**
 * Response dari generate nomor surat
 */
export interface GeneratedNomor {
  nomor: string;
  noUrut: string;
  jabatan: string;
  lokasi?: string;
  instansi?: string;
  klasifikasi?: string;
  bulan: string;
  tahun: number;
}

@Injectable()
export class NomorSuratService {
  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
  ) {}

  /**
   * Mendapatkan kode jabatan dari position text
   */
  private getKodeJabatan(positionText: string): string {
    const lowerText = positionText.toLowerCase();

    // Check mapping
    for (const [key, value] of Object.entries(JABATAN_MAPPING)) {
      if (lowerText.includes(key)) {
        return value;
      }
    }

    // Default: ambil 2 huruf pertama dari position text (uppercase)
    const words = positionText.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return positionText.substring(0, 2).toUpperCase();
  }

  /**
   * Mendapatkan kode lokasi dari area text
   */
  private getKodeLokasi(areaText: string): string {
    const lowerText = areaText.toLowerCase();

    // Check mapping
    for (const [key, value] of Object.entries(LOKASI_MAPPING)) {
      if (lowerText.includes(key)) {
        return value;
      }
    }

    // Default: 00 (Pusat)
    return '00';
  }

  /**
   * Mendapatkan bulan dalam format Romawi
   */
  private getBulanRomawi(tanggal: Date): string {
    const bulan = tanggal.getMonth() + 1; // getMonth() returns 0-11
    return BULAN_ROMAWI[bulan] || 'I';
  }

  /**
   * Generate nomor urut dengan format 3 digit (001, 002, dst)
   */
  private formatNoUrut(number: number): string {
    return number.toString().padStart(3, '0');
  }

  /**
   * Mendapatkan nomor urut terakhir dari tabel naskah berdasarkan pattern
   */
  private async getLastNomorUrutByPattern(
    jenis: string,
    pattern: string,
  ): Promise<number> {
    const result = await this.naskahRepository
      .createQueryBuilder('n')
      .select('n.nomor', 'nomor')
      .where('n.jenis = :jenis', { jenis })
      .andWhere('n.nomor LIKE :pattern', { pattern })
      .orderBy('n.nomor', 'DESC')
      .limit(10)
      .getRawMany<{ nomor: string | null }>();

    if (!result || result.length === 0) {
      return 0;
    }

    let maxNoUrut = 0;
    for (const row of result) {
      if (row.nomor) {
        const parts = row.nomor.split('/');
        if (parts.length >= 1) {
          const noUrut = parseInt(parts[0], 10);
          if (!isNaN(noUrut) && noUrut > maxNoUrut) {
            maxNoUrut = noUrut;
          }
        }
      }
    }

    return maxNoUrut;
  }

  /**
   * Generate nomor surat untuk Disposisi
   *
   * Format: {NO_URUT}/{JABATAN}/{LOKASI}/{BULAN}/{TAHUN}
   * Contoh: 001/P/00/XII/2025
   *
   * JABATAN diambil dari position_abbreviation di org_data
   */
  async generateNomorDisposisi(
    params: GenerateNomorParams,
  ): Promise<GeneratedNomor> {
    const { jenis, positionText, positionAbbreviation, areaText, tanggal } = params;

    // Gunakan positionAbbreviation dari org_data, fallback ke getKodeJabatan jika tidak ada
    const jabatan = positionAbbreviation || this.getKodeJabatan(positionText);
    const lokasi = this.getKodeLokasi(areaText);
    const bulan = this.getBulanRomawi(tanggal);
    const tahun = tanggal.getFullYear();

    // Pattern: %/{jabatan}/{lokasi}/%/{tahun}
    const pattern = `%/${jabatan}/${lokasi}/%/${tahun}`;
    const lastNoUrut = await this.getLastNomorUrutByPattern(jenis, pattern);
    const nextNumber = lastNoUrut + 1;
    const noUrut = this.formatNoUrut(nextNumber);

    // Format: {NO_URUT}/{JABATAN}/{LOKASI}/{BULAN}/{TAHUN}
    const nomor = `${noUrut}/${jabatan}/${lokasi}/${bulan}/${tahun}`;

    return {
      nomor,
      noUrut,
      jabatan,
      lokasi,
      bulan,
      tahun,
    };
  }

  /**
   * Generate nomor surat untuk Nota Dinas
   *
   * Format: {NO_URUT}/{JABATAN}/{KLASIFIKASI}/{BULAN}/{TAHUN}
   * Contoh: 001/P/PER.07/XII/2025
   *
   * Tidak ada kode lokasi dan instansi
   * JABATAN diambil dari position_abbreviation di org_data
   */
  async generateNomorNotaDinas(
    params: GenerateNomorParams,
  ): Promise<GeneratedNomor> {
    const { jenis, positionText, positionAbbreviation, tanggal, klasifikasi } = params;

    // Gunakan positionAbbreviation dari org_data, fallback ke getKodeJabatan jika tidak ada
    const jabatan = positionAbbreviation || this.getKodeJabatan(positionText);
    const kodeKlasifikasi = klasifikasi || 'UMM.01'; // Default klasifikasi
    const bulan = this.getBulanRomawi(tanggal);
    const tahun = tanggal.getFullYear();

    // Pattern: %/{jabatan}/{klasifikasi}/%/{tahun}
    const pattern = `%/${jabatan}/${kodeKlasifikasi}/%/${tahun}`;
    const lastNoUrut = await this.getLastNomorUrutByPattern(jenis, pattern);
    const nextNumber = lastNoUrut + 1;
    const noUrut = this.formatNoUrut(nextNumber);

    // Format: {NO_URUT}/{JABATAN}/{KLASIFIKASI}/{BULAN}/{TAHUN}
    const nomor = `${noUrut}/${jabatan}/${kodeKlasifikasi}/${bulan}/${tahun}`;

    return {
      nomor,
      noUrut,
      jabatan,
      klasifikasi: kodeKlasifikasi,
      bulan,
      tahun,
    };
  }

  /**
   * Generate nomor surat untuk Surat Dinas Internal
   *
   * Format: {NO_URUT}/{JABATAN}/{LOKASI}/{KLASIFIKASI}/{BULAN}/{TAHUN}
   * Contoh: 001/P/00/PER.07/XII/2025
   *
   * Ada lokasi, tidak ada instansi
   * JABATAN diambil dari position_abbreviation di org_data
   */
  async generateNomorSuratDinasInternal(
    params: GenerateNomorParams,
  ): Promise<GeneratedNomor> {
    const { jenis, positionText, positionAbbreviation, areaText, tanggal, klasifikasi } = params;

    // Gunakan positionAbbreviation dari org_data, fallback ke getKodeJabatan jika tidak ada
    const jabatan = positionAbbreviation || this.getKodeJabatan(positionText);
    const lokasi = this.getKodeLokasi(areaText);
    const kodeKlasifikasi = klasifikasi || 'UMM.01';
    const bulan = this.getBulanRomawi(tanggal);
    const tahun = tanggal.getFullYear();

    // Pattern: %/{jabatan}/{lokasi}/{klasifikasi}/%/{tahun}
    const pattern = `%/${jabatan}/${lokasi}/${kodeKlasifikasi}/%/${tahun}`;
    const lastNoUrut = await this.getLastNomorUrutByPattern(jenis, pattern);
    const nextNumber = lastNoUrut + 1;
    const noUrut = this.formatNoUrut(nextNumber);

    // Format: {NO_URUT}/{JABATAN}/{LOKASI}/{KLASIFIKASI}/{BULAN}/{TAHUN}
    const nomor = `${noUrut}/${jabatan}/${lokasi}/${kodeKlasifikasi}/${bulan}/${tahun}`;

    return {
      nomor,
      noUrut,
      jabatan,
      lokasi,
      klasifikasi: kodeKlasifikasi,
      bulan,
      tahun,
    };
  }

  /**
   * Generate nomor surat untuk Surat Dinas Eksternal
   *
   * Format: {NO_URUT}/{JABATAN}/{LOKASI}/{INSTANSI}/{KLASIFIKASI}/{BULAN}/{TAHUN}
   * Contoh: 001/G/01/KRT.01.02/II/2019 atau 001/P/00/LPPNPI/PER.07/XII/2025
   *
   * Format lengkap dengan lokasi, instansi, dan klasifikasi
   * JABATAN diambil dari position_abbreviation di org_data
   */
  async generateNomorSuratDinasEksternal(
    params: GenerateNomorParams,
  ): Promise<GeneratedNomor> {
    const { jenis, positionText, positionAbbreviation, areaText, tanggal, klasifikasi } = params;

    // Gunakan positionAbbreviation dari org_data, fallback ke getKodeJabatan jika tidak ada
    const jabatan = positionAbbreviation || this.getKodeJabatan(positionText);
    const lokasi = this.getKodeLokasi(areaText);
    const instansi = INSTANSI;
    const kodeKlasifikasi = klasifikasi || 'UMM.01';
    const bulan = this.getBulanRomawi(tanggal);
    const tahun = tanggal.getFullYear();

    // Pattern: %/{jabatan}/{lokasi}/{instansi}/{klasifikasi}/%/{tahun}
    const pattern = `%/${jabatan}/${lokasi}/${instansi}/${kodeKlasifikasi}/%/${tahun}`;
    const lastNoUrut = await this.getLastNomorUrutByPattern(jenis, pattern);
    const nextNumber = lastNoUrut + 1;
    const noUrut = this.formatNoUrut(nextNumber);

    // Format: {NO_URUT}/{JABATAN}/{LOKASI}/{INSTANSI}/{KLASIFIKASI}/{BULAN}/{TAHUN}
    const nomor = `${noUrut}/${jabatan}/${lokasi}/${instansi}/${kodeKlasifikasi}/${bulan}/${tahun}`;

    return {
      nomor,
      noUrut,
      jabatan,
      lokasi,
      instansi,
      klasifikasi: kodeKlasifikasi,
      bulan,
      tahun,
    };
  }

  /**
   * Generate nomor surat untuk Kajian
   * Menggunakan format yang sama dengan Disposisi
   *
   * Format: {NO_URUT}/{JABATAN}/{LOKASI}/{BULAN}/{TAHUN}
   * Contoh: 001/P/00/XII/2025
   */
  async generateNomorKajian(
    params: GenerateNomorParams,
  ): Promise<GeneratedNomor> {
    // Kajian menggunakan format yang sama dengan Disposisi
    return this.generateNomorDisposisi(params);
  }

  /**
   * Generate nomor surat untuk berbagai jenis naskah
   *
   * Format per jenis:
   * - Disposisi (DI): {NO_URUT}/{JABATAN}/{LOKASI}/{BULAN}/{TAHUN}
   * - Nota Dinas (ND): {NO_URUT}/{JABATAN}/{KLASIFIKASI}/{BULAN}/{TAHUN}
   * - Surat Dinas Internal (SDI): {NO_URUT}/{JABATAN}/{LOKASI}/{KLASIFIKASI}/{BULAN}/{TAHUN}
   * - Surat Dinas Eksternal (SDE): {NO_URUT}/{JABATAN}/{LOKASI}/{INSTANSI}/{KLASIFIKASI}/{BULAN}/{TAHUN}
   * - Kajian (KA): {NO_URUT}/{JABATAN}/{LOKASI}/{BULAN}/{TAHUN}
   */
  async generateNomor(params: GenerateNomorParams): Promise<GeneratedNomor> {
    switch (params.jenis) {
      case 'DI':
        return this.generateNomorDisposisi(params);
      case 'ND':
        return this.generateNomorNotaDinas(params);
      case 'SDI':
        return this.generateNomorSuratDinasInternal(params);
      case 'SDE':
        return this.generateNomorSuratDinasEksternal(params);
      case 'KA':
        return this.generateNomorKajian(params);
      default:
        return this.generateNomorDisposisi(params);
    }
  }
}
