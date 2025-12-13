import { IsNotEmpty, IsString, IsDate, IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO untuk membuat usulan nomor baru
 * Data company, area, sub_area, organization akan diambil otomatis dari org_data
 */
export class CreateNomorRequestDto {
  @IsNotEmpty({ message: 'Position ID harus diisi' })
  @IsInt()
  position_id: number;

  @IsNotEmpty({ message: 'Tanggal harus diisi' })
  @Type(() => Date)
  @IsDate()
  tanggal: Date;

  @IsNotEmpty({ message: 'Jenis harus diisi' })
  @IsString()
  jenis: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsNotEmpty({ message: 'Perihal harus diisi' })
  @IsString()
  perihal: string;

  @IsNotEmpty({ message: 'Jumlah harus diisi' })
  @IsInt()
  @Min(1, { message: 'Jumlah minimal 1' })
  jumlah: number;

  @IsOptional()
  @IsString()
  penandatangan?: string;

  @IsOptional()
  @IsInt()
  id_position_penandatangan?: number;
}

/**
 * Response DTO untuk create nomor request
 */
export class CreateNomorRequestResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    company: string;
    area: string;
    sub_area: string;
    organization: string;
    position: string;
    tanggal: Date;
    jenis: string;
    klasifikasi: string | null;
    perihal: string;
    jumlah: number;
    penandatangan: string | null;
    created_at: Date;
  };
}
