import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TitelaturEnEntity } from '../entities/titelatur-en.entity';

/**
 * Helper translate jabatan Indonesia → titelatur English.
 * Sumber mapping: tabel titelatur_en (long_text → long_text_en).
 * Dipakai SDE/SDE Masal saat flag english aktif agar nama jabatan
 * (pengirim, penerima, tembusan) dirender dalam Bahasa Inggris.
 */
@Injectable()
export class TitelaturTranslateService {
  constructor(
    @InjectRepository(TitelaturEnEntity)
    private readonly titelaturRepository: Repository<TitelaturEnEntity>,
  ) {}

  /** Cache in-memory mapping lowercase → english (di-load sekali per proses). */
  private map: Map<string, string> | null = null;

  private async getMap(): Promise<Map<string, string>> {
    if (this.map) return this.map;
    const rows = await this.titelaturRepository.find();
    const m = new Map<string, string>();
    for (const row of rows) {
      const idText = (row.long_text || '').trim();
      const enText = (row.long_text_en || '').trim();
      if (idText && enText) m.set(idText.toLowerCase(), enText);
    }
    this.map = m;
    return m;
  }

  /** Invalidate cache (dipanggil saat titelatur berubah). */
  invalidateCache(): void {
    this.map = null;
  }

  /**
   * Translate satu label jabatan. Jika tidak ada mapping, return teks asli.
   * Match dilakukan pada seluruh teks (case-insensitive, trim).
   */
  async translate(label: string | null | undefined): Promise<string> {
    if (!label || !label.trim()) return label || '';
    const m = await this.getMap();
    return m.get(label.trim().toLowerCase()) || label;
  }

  /**
   * Translate label jabatan yang berada di dalam teks gabungan
   * (mis. "Direktur Utama - Nama Orang" atau "GM Bandara Soekarno-Hatta").
   * Hanya bagian jabatan (sebelum " - ") yang diganti bila ada mapping;
   * sisanya dipertahankan.
   */
  async translateCombined(label: string | null | undefined): Promise<string> {
    if (!label || !label.trim()) return label || '';
    const dashIndex = label.indexOf(' - ');
    if (dashIndex === -1) return this.translate(label);
    const jabatan = label.substring(0, dashIndex).trim();
    const rest = label.substring(dashIndex); // sertakan " - " + sisa
    const translated = await this.translate(jabatan);
    return `${translated}${rest}`;
  }
}