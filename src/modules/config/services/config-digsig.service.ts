import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigDigsig, JenisNaskah, TtdMode, TteMode } from '../entities';
import { UpdateDigsigConfigDto } from '../dto';

@Injectable()
export class ConfigDigsigService {
  constructor(
    @InjectRepository(ConfigDigsig)
    private readonly configDigsigRepository: Repository<ConfigDigsig>,
  ) {}

  /**
   * Mengambil semua konfigurasi digsig
   */
  async findAll(): Promise<ConfigDigsig[]> {
    return this.configDigsigRepository.find({
      order: { jenisNaskah: 'ASC' },
    });
  }

  /**
   * Mengambil konfigurasi berdasarkan jenis naskah
   */
  async findByJenis(jenisNaskah: JenisNaskah): Promise<ConfigDigsig> {
    const config = await this.configDigsigRepository.findOne({
      where: { jenisNaskah },
    });

    if (!config) {
      throw new NotFoundException(
        `Konfigurasi untuk jenis ${jenisNaskah} tidak ditemukan`,
      );
    }

    return config;
  }

  /**
   * Ambil daftar mode TTE yang aktif untuk jenis naskah tertentu
   */
  async getModes(jenisNaskah: JenisNaskah): Promise<TtdMode[]> {
    const config = await this.configDigsigRepository.findOne({
      where: { jenisNaskah },
    });
    if (!config) return [TtdMode.DIGSIG];

    const modes: TtdMode[] = [];
    if (config.digsig) modes.push(TtdMode.DIGSIG);
    if (config.ttdQr) modes.push(TtdMode.TTD_QR);
    if (config.ttdBasah) modes.push(TtdMode.TTD_BASAH);
    return modes.length > 0 ? modes : [TtdMode.DIGSIG];
  }

  /**
   * Update konfigurasi digsig
   */
  async update(dto: UpdateDigsigConfigDto): Promise<ConfigDigsig> {
    let config = await this.configDigsigRepository.findOne({
      where: { jenisNaskah: dto.jenis_naskah },
    });

    if (!config) {
      // Create jika belum ada
      config = this.configDigsigRepository.create({
        jenisNaskah: dto.jenis_naskah,
        digsig: dto.digsig ?? true,
        ttdQr: dto.ttd_qr ?? false,
        ttdBasah: dto.ttd_basah ?? false,
        tteMode: dto.tte_mode ?? TteMode.BSRE_DIRECT,
        description: dto.description,
      });
    } else {
      // Update hanya field yang dikirim
      if (dto.digsig !== undefined) config.digsig = dto.digsig;
      if (dto.ttd_qr !== undefined) config.ttdQr = dto.ttd_qr;
      if (dto.ttd_basah !== undefined) config.ttdBasah = dto.ttd_basah;
      if (dto.tte_mode !== undefined) config.tteMode = dto.tte_mode;
      if (dto.description !== undefined) config.description = dto.description;
    }

    return this.configDigsigRepository.save(config);
  }

  /**
   * Bulk update konfigurasi
   */
  async bulkUpdate(configs: UpdateDigsigConfigDto[]): Promise<ConfigDigsig[]> {
    const results: ConfigDigsig[] = [];

    for (const dto of configs) {
      const result = await this.update(dto);
      results.push(result);
    }

    return results;
  }

  /**
   * Toggle satu mode on/off. Minimal harus ada 1 mode aktif.
   */
  async toggle(jenisNaskah: JenisNaskah, mode: TtdMode): Promise<ConfigDigsig> {
    const config = await this.findByJenis(jenisNaskah);

    if (mode === TtdMode.DIGSIG) config.digsig = !config.digsig;
    else if (mode === TtdMode.TTD_QR) config.ttdQr = !config.ttdQr;
    else if (mode === TtdMode.TTD_BASAH) config.ttdBasah = !config.ttdBasah;

    // Pastikan minimal 1 mode aktif
    if (!config.digsig && !config.ttdQr && !config.ttdBasah) {
      config.digsig = true;
    }

    return this.configDigsigRepository.save(config);
  }

  /**
   * Init default config jika belum ada
   */
  async initDefaults(): Promise<void> {
    const jenisNaskahList: JenisNaskah[] = [
      JenisNaskah.ND,
      JenisNaskah.SDI,
      JenisNaskah.SDE,
      JenisNaskah.DI,
      JenisNaskah.KA,
      JenisNaskah.NL,
    ];

    const descriptions: Record<JenisNaskah, string> = {
      [JenisNaskah.ND]: 'Nota Dinas - default mode TTE elektronik',
      [JenisNaskah.SDI]: 'Surat Dinas Internal - default mode TTE elektronik',
      [JenisNaskah.SDE]: 'Surat Dinas Eksternal - default mode TTE elektronik',
      [JenisNaskah.DI]: 'Disposisi Internal - default mode TTE elektronik',
      [JenisNaskah.KA]: 'Kajian - default mode TTE elektronik',
      [JenisNaskah.NL]:
        'Naskah Lainnya & Naskah Umum (LPD, Blanko Verbal, Undangan, Peraturan, dll) - default mode TTE elektronik',
    };

    for (const jenis of jenisNaskahList) {
      const existing = await this.configDigsigRepository.findOne({
        where: { jenisNaskah: jenis },
      });

      if (!existing) {
        // Pakai repository.create() agar @BeforeInsert generateId() jalan —
        // save() dengan plain object tidak memicu listener (bug: "Field
        // 'id' doesn't have a default value").
        const config = this.configDigsigRepository.create({
          jenisNaskah: jenis,
          digsig: true,
          ttdQr: false,
          ttdBasah: false,
          tteMode: TteMode.BSRE_DIRECT,
          description: descriptions[jenis],
        });
        await this.configDigsigRepository.save(config);
      }
    }
  }
}
