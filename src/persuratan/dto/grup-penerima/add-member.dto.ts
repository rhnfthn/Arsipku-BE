import { IsString, MaxLength } from 'class-validator';

export class AddMemberGrupPenerimaDto {
  @IsString()
  @MaxLength(150)
  position: string;
}
