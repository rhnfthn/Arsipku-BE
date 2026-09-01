import { IsEnum, IsInt, IsString, MaxLength, Min } from 'class-validator';

export class AssignDelegasiDireksiDto {
  @IsInt()
  @Min(1)
  delegatePersnum: number;

  @IsString()
  @MaxLength(255)
  delegateName: string;

  @IsEnum(['PT', 'PH', 'PS'])
  positionStatus: 'PT' | 'PH' | 'PS';
}
