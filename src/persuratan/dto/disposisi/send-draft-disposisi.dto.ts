import { IsNotEmpty, IsNumber } from 'class-validator';

/**
 * DTO untuk mengirim draft disposisi (mengubah status dari draf ke final)
 */
export class SendDraftDisposisiDto {
  // Position ID pengirim (untuk validasi ownership)
  @IsNotEmpty({ message: 'Position ID pengirim harus diisi' })
  @IsNumber({}, { message: 'Position ID pengirim harus berupa number' })
  pengirim_position_id: number;
}

/**
 * Response DTO untuk send draft disposisi
 */
export class SendDraftDisposisiResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_naskah: string;
    status: 'final';
    updated_at: Date;
  };
}
