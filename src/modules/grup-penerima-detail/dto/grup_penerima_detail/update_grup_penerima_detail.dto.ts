import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateGrupPenerimaDetailDto {
  @IsString()
  @IsOptional()
  @MaxLength(150)
  position?: string;
}
