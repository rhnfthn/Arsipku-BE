import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export interface FieldSchema {
  name: string;
  label: string;
  type: 'text' | 'date' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface TemplateSchema {
  jenis: string;
  templateS3Key: string;
  placeholders: string[];
  fields: FieldSchema[];
}

export class PreviewDto {
  @IsString()
  jenis!: string;

  @IsObject()
  fields!: Record<string, string | string[]>;
}

export class SendDto {
  @IsString()
  tempId!: string;

  @IsString()
  jenis!: string;

  @IsEnum(['qr_only', 'ttd_basah', 'digsig'] as const)
  sign_option!: 'qr_only' | 'ttd_basah' | 'digsig';

  @IsString()
  @IsOptional()
  passphrase?: string;

  @IsNumber({}, { each: true })
  @IsArray()
  penerima!: number[];

  @IsNumber({}, { each: true })
  @IsOptional()
  @IsArray()
  tembusan?: number[];

  @IsString({ each: true })
  @IsOptional()
  @IsArray()
  penerima_grup?: string[];

  @IsString({ each: true })
  @IsOptional()
  @IsArray()
  tembusan_grup?: string[];

  @IsString()
  @IsOptional()
  klasifikasi?: string;

  @IsString()
  @IsOptional()
  sifat?: string;

  @IsString({ each: true })
  @IsOptional()
  @IsArray()
  lampiran_temp_ids?: string[];
}
