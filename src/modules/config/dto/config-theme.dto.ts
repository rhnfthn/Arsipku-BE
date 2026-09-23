import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

export class CreateConfigThemeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  start_date?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  end_date?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  repeat_yearly?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;
}

export class UpdateConfigThemeDto extends CreateConfigThemeDto {}

export class SetManualThemeDto {
  @Transform(toBoolean)
  @IsBoolean()
  active: boolean;
}
