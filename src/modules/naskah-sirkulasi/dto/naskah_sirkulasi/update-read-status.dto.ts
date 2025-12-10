import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

/**
 * DTO untuk update status baca pesan (global untuk semua jenis naskah)
 * Endpoint: PUT /naskah_sirkulasi/update-read-status
 */
export class UpdateReadStatusDto {
  @IsNotEmpty({ message: 'ID Naskah harus diisi' })
  @IsString()
  id_naskah: string;

  @IsNotEmpty({ message: 'Position ID penerima harus diisi' })
  @IsString()
  position_id: string;

  @IsOptional()
  @IsString()
  user_id?: string; // ID user yang membaca (opsional untuk tracking)
}

/**
 * Response DTO untuk update status baca
 */
export class UpdateReadStatusResponseDto {
  success: boolean;
  message: string;
  data: {
    id_naskah: string;
    position_id: string;
    jenis_naskah: string;
    status_baca: 'terbaca' | 'belum_terbaca';
    read_time: Date | null;
    read_user: string | null;
  };
}
