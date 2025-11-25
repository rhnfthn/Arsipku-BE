import { IsString, IsOptional, MaxLength, IsUUID } from 'class-validator';

export class CreateGrupPenerimaDetailDto {
  @IsUUID()
  id_grup_penerima: string;

  @IsString()
  @MaxLength(150)
  position: string;
}
