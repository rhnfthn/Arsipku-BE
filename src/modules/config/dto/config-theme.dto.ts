import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  Matches,
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

export const THEME_TEXT_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'hidden',
] as const;

export type ThemeTextPosition = (typeof THEME_TEXT_POSITIONS)[number];
export type ThemeTextTone = 'light' | 'dark';

export class CreateConfigThemeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  image_key?: string;

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

  @IsOptional()
  @IsIn(THEME_TEXT_POSITIONS)
  text_position?: ThemeTextPosition;

  @IsOptional()
  @IsIn(['light', 'dark'])
  text_tone?: ThemeTextTone;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(80)
  overlay_strength?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(200)
  background_width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(200)
  background_height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(100)
  banner_width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(160)
  @Max(500)
  banner_height?: number;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  navigation_accent_color?: string;
}

export class UpdateConfigThemeDto extends CreateConfigThemeDto {}

export class SetManualThemeDto {
  @Transform(toBoolean)
  @IsBoolean()
  active: boolean;
}

export class SetDefaultThemeDto extends SetManualThemeDto {}
