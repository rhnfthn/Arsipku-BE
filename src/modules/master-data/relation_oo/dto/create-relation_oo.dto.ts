import { IsString, IsOptional, IsDateString, IsInt, IsUUID, MaxLength, Matches } from 'class-validator';

export class CreateRelationOoDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsInt()
  company: number;

  @IsInt()
  organization: number;

  @IsInt()
  relation_organization: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9 ._\-]+$/, {
    message: 'organization_text hanya boleh huruf, angka, spasi, titik, dash, dan underscore',
  })
  organization_text: string;

  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9 ._\-]+$/, {
    message: 'relation_organization_text hanya boleh huruf, angka, spasi, titik, dash, dan underscore',
  })
  relation_organization_text?: string;

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
