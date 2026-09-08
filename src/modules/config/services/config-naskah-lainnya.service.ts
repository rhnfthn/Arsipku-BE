import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigNaskahLainnya } from '../entities';

// Sumber kebenaran jenis naskah lainnya — selaras dengan FE JENIS_LABELS
// (fe/app/types/naskah-lainnya.ts) & docs/template_naskah_mapping.md.
export const JENIS_NASKAH_LAINNYA = [
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
] as const;

export type JenisNaskahLainnya = (typeof JENIS_NASKAH_LAINNYA)[number];

export interface UpdateNaskahLainnyaConfigDto {
  butuhLegal?: boolean;
  defaultKlasifikasi?: string | null;
}

@Injectable()
export class ConfigNaskahLainnyaService {
  constructor(
    @InjectRepository(ConfigNaskahLainnya)
    private readonly repo: Repository<ConfigNaskahLainnya>,
  ) {}

  private assertJenis(jenis: string): asserts jenis is JenisNaskahLainnya {
    if (!JENIS_NASKAH_LAINNYA.includes(jenis as JenisNaskahLainnya)) {
      throw new BadRequestException(`Jenis naskah lainnya tidak dikenal: ${jenis}`);
    }
  }

  /** Semua jenis beserta konfigurasinya; jenis tanpa row → default (belum diset). */
  async findAll(): Promise<ConfigNaskahLainnya[]> {
    const rows = await this.repo.find();
    const byJenis = new Map(rows.map((r) => [r.jenisNaskah, r]));
    return JENIS_NASKAH_LAINNYA.map((jenis) => {
      const row = byJenis.get(jenis);
      if (row) return row;
      const stub = new ConfigNaskahLainnya();
      stub.id = '';
      stub.jenisNaskah = jenis;
      stub.butuhLegal = false;
      stub.defaultKlasifikasi = null;
      return stub;
    });
  }

  /** Konfigurasi satu jenis; jenis tanpa row → default (bukan 404). */
  async findByJenis(jenis: string): Promise<ConfigNaskahLainnya> {
    this.assertJenis(jenis);
    const row = await this.repo.findOne({ where: { jenisNaskah: jenis } });
    if (row) return row;
    const stub = new ConfigNaskahLainnya();
    stub.id = '';
    stub.jenisNaskah = jenis;
    stub.butuhLegal = false;
    stub.defaultKlasifikasi = null;
    return stub;
  }

  async update(jenis: string, dto: UpdateNaskahLainnyaConfigDto): Promise<ConfigNaskahLainnya> {
    this.assertJenis(jenis);
    if (dto.defaultKlasifikasi !== undefined && dto.defaultKlasifikasi !== null) {
      const v = String(dto.defaultKlasifikasi).trim();
      if (v.length > 100) {
        throw new BadRequestException('Default klasifikasi maksimal 100 karakter');
      }
      dto.defaultKlasifikasi = v || null;
    }
    let row = await this.repo.findOne({ where: { jenisNaskah: jenis } });
    if (!row) {
      row = this.repo.create({ jenisNaskah: jenis, butuhLegal: false, defaultKlasifikasi: null });
    }
    if (dto.butuhLegal !== undefined) row.butuhLegal = !!dto.butuhLegal;
    if (dto.defaultKlasifikasi !== undefined) row.defaultKlasifikasi = dto.defaultKlasifikasi || null;
    return this.repo.save(row);
  }
}
