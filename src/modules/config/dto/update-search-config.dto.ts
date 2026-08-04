import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { SearchEngineMode } from '../entities/config-search.entity';

export class UpdateSearchConfigDto {
  @IsOptional()
  @IsEnum(SearchEngineMode)
  mode?: SearchEngineMode;

  @IsOptional()
  @IsBoolean()
  meili_enabled?: boolean;
}
