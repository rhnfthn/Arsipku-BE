import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsUUID,
  ValidateNested,
  IsOptional,
  IsString,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VerifikatorDto } from './create-usulan-akses-berkas.dto';

/**
 * DTO untuk pemilihan berkas oleh Sekretaris Pemberi
 */
export class PilihBerkasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  berkas_ids: string[];

  @IsOptional()
  @IsString()
  catatan_penerusan?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => VerifikatorDto)
  verifikator_pemberi: VerifikatorDto[];
}