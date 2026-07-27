import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  IsInt,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VerifikatorItem {
  @IsString()
  @IsNotEmpty()
  verifikator_persnum: string;

  @IsOptional()
  @IsInt()
  verifikator_position_id?: number;

  @IsOptional()
  @IsString()
  jabatan_verifikator?: string;
}

export class AjukanTutupBerkasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerifikatorItem)
  @ArrayMinSize(1, { message: 'Minimal 1 verifikator wajib diisi' })
  @ArrayMaxSize(3, { message: 'Maksimal 3 verifikator dapat dipilih' })
  @ArrayUnique((item: VerifikatorItem) => item.verifikator_persnum, {
    message: 'Verifikator tidak boleh duplikat',
  })
  verifikator: VerifikatorItem[];

  @IsOptional()
  @IsString()
  catatan?: string;
}
