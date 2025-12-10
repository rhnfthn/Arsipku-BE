import { IsObject, IsString, Matches } from 'class-validator';

export class CreateOrgDatumDto {
  @IsObject()
  organization_json?: Record<string, any>;

  @IsObject()
  position_json?: Record<string, any>;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;
}
