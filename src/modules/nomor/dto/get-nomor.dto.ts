import { IsOptional, IsInt, Min } from 'class-validator';

/**
 * Query params untuk get nomor
 */
export class GetNomorQueryDto {
  @IsOptional()
  @IsInt()
  @Min(2000)
  tahun?: number;
}

/**
 * Response DTO untuk get nomor
 */
export class GetNomorResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    company: string | null;
    area: string | null;
    sub_area: string | null;
    organization: string | null;
    position: string | null;
    tahun: number | null;
    jenis: string | null;
    nomor: string | null;
    created_at: Date;
    updated_at: Date;
  }[];
}
