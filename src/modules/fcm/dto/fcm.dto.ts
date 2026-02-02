import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export enum PlatformEnum {
  ANDROID = 'android',
  IOS = 'ios',
  WEB = 'web',
}

export class RegisterFcmTokenDto {
  @ApiProperty({
    description: 'FCM Token from Firebase',
    example: 'dGVzdC10b2tlbi0xMjM0NTY3ODkwLi4u',
  })
  @IsString()
  @IsNotEmpty({ message: 'token is required' })
  token: string;

  @ApiProperty({
    description: 'Platform type',
    enum: PlatformEnum,
    example: PlatformEnum.ANDROID,
  })
  @IsEnum(PlatformEnum, { message: 'platform must be android, ios, or web' })
  platform: PlatformEnum;

  @ApiProperty({
    description: 'Unique device identifier',
    example: 'device-uuid-12345',
  })
  @Transform(({ obj }) => obj.deviceId || obj.device_id)
  @IsString()
  @IsNotEmpty({ message: 'deviceId is required' })
  deviceId: string;
}

export class RemoveFcmTokenDto {
  @ApiPropertyOptional({
    description: 'FCM Token to remove (if not provided, removes by deviceId)',
    example: 'dGVzdC10b2tlbi0xMjM0NTY3ODkwLi4u',
  })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({
    description: 'Device ID to remove token for',
    example: 'device-uuid-12345',
  })
  @Transform(({ obj }) => obj.deviceId || obj.device_id)
  @IsOptional()
  @IsString()
  deviceId?: string;
}
