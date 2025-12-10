import { IsOptional, IsString, IsNumberString, Matches } from 'class-validator';

export class OrgFilterQueryDto {
  @IsOptional()
  @IsString()
  division?: string;

  @IsOptional()
  @IsNumberString()
  division_id?: string;

  @IsOptional()
  @IsString()
  direktorat?: string;

  @IsOptional()
  @IsNumberString()
  direktorat_id?: string;

  @IsOptional()
  @IsNumberString()
  position_id?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;
}

export class OrgDataQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;

  @IsOptional()
  @IsNumberString()
  position_id?: string;

  @IsOptional()
  @IsNumberString()
  persnum?: string;
}
