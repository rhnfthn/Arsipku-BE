import { IsNotEmpty, IsString, IsInt, Min, IsOptional, IsDateString } from 'class-validator';

/**
 * DTO untuk admin create nomor langsung (tanpa booking)
 * Admin langsung generate nomor valid
 */
export class AdminCreateNomorDto {
  @IsNotEmpty()
  @IsInt()
  position_id: number;

  @IsNotEmpty()
  @IsDateString()
  tanggal: string;

  @IsNotEmpty()
  @IsString()
  jenis: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsNotEmpty()
  @IsString()
  perihal: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  jumlah: number;

  @IsOptional()
  @IsString()
  penandatangan?: string;

  @IsOptional()
  @IsInt()
  id_position_penandatangan?: number;
}

/**
 * Response DTO untuk admin create nomor
 */
export class AdminCreateNomorResponseDto {
  success: boolean;
  message: string;
  data: {
    request_id: string;
    nomor_list: {
      id: string;
      nomor: string;
      status: string;
    }[];
  };
}
