import { IsString, IsOptional, IsDateString, IsInt, IsUUID, MaxLength, Matches } from 'class-validator';

export class CreateRelationOscDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsInt()
  company: number;

  @IsInt()
  organization: number;

  @IsInt()
  relation_position: number;

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
    message: 'relation_position_text hanya boleh huruf, angka, spasi, titik, dash, dan underscore',
  })
  relation_position_text?: string;

  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9 ._\-]+$/, {
    message: 'bod_tag hanya boleh huruf, angka, spasi, titik, dash, dan underscore',
  })
  bod_tag?: string;

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
