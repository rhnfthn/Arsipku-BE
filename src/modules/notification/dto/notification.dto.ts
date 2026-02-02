import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { NotificationType } from '../entities';

export class CreateNotificationDto {
  @ApiProperty({ description: 'Position ID penerima (jabatan)' })
  @IsString()
  positionId: string;

  @ApiPropertyOptional({ description: 'User persnum untuk push notification' })
  @IsOptional()
  @IsInt()
  userPersnum?: number;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Notification body/message' })
  @IsString()
  body: string;

  @ApiPropertyOptional({ description: 'Additional data (naskahId, nomor, etc)' })
  @IsOptional()
  data?: Record<string, any>;
}

export class NotificationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by read status' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({ enum: NotificationType, description: 'Filter by type' })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class CreateNaskahMasukNotificationDto {
  @ApiProperty({ description: 'Position ID penerima' })
  @IsString()
  positionId: string;

  @ApiPropertyOptional({ description: 'User persnum untuk push notification' })
  @IsOptional()
  @IsInt()
  userPersnum?: number;

  @ApiProperty({ description: 'Naskah ID' })
  @IsString()
  naskahId: string;

  @ApiProperty({ description: 'Sirkulasi ID' })
  @IsString()
  sirkulasiId: string;

  @ApiProperty({ description: 'Jenis naskah' })
  @IsString()
  jenis: string;

  @ApiPropertyOptional({ description: 'Nomor naskah' })
  @IsOptional()
  @IsString()
  nomor?: string;

  @ApiProperty({ description: 'Perihal naskah' })
  @IsString()
  perihal: string;

  @ApiProperty({ description: 'Nama pengirim' })
  @IsString()
  pengirim: string;

  @ApiProperty({ description: 'Position pengirim' })
  @IsString()
  pengirimPosition: string;

  @ApiPropertyOptional({ description: 'Apakah tembusan', default: false })
  @IsOptional()
  @IsBoolean()
  isTembusan?: boolean;
}
