import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO untuk toggle alert BSrE (activate/deactivate)
 */
export class ToggleBsreAlertDto {
  /**
   * Pesan alert yang ditampilkan (opsional, ada default message)
   * Contoh: "Layanan BSrE sedang mengalami gangguan. Mohon coba beberapa saat lagi."
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

/**
 * Response DTO untuk status alert BSrE
 * Endpoint public: semua user bisa GET status ini
 */
export class BsreAlertStatusDto {
  /** Apakah alert gangguan aktif */
  isActive: boolean;

  /** Pesan alert (null jika tidak aktif) */
  message: string | null;

  /** Kapan alert diaktifkan (null jika tidak aktif) */
  activatedAt: Date | null;

  /** Nama admin yang mengaktifkan (null jika tidak aktif) */
  activatedByName: string | null;
}

/**
 * Response DTO setelah toggle alert
 */
export class ToggleBsreAlertResponseDto {
  success: boolean;
  message: string;
  data: BsreAlertStatusDto;
}
