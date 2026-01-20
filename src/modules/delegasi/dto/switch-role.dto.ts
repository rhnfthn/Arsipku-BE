import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PositionStatus } from '../../../common/enums/position-status.enum';

export class SwitchRoleDto {
  @ApiProperty({
    description: 'ID delegasi yang akan diaktifkan (jika ingin switch ke role delegasi)',
    example: 'uuid-delegasi-123',
    required: false,
  })
  @IsOptional()
  @IsString()
  delegasiId?: string;

  @ApiProperty({
    description: 'Position yang akan diaktifkan',
    example: '50000001',
    required: false,
  })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiProperty({
    description: 'Position status yang akan diaktifkan',
    enum: PositionStatus,
    example: PositionStatus.YBS,
    required: false,
  })
  @IsOptional()
  @IsEnum(PositionStatus)
  positionStatus?: PositionStatus;

  @ApiProperty({
    description: 'Set true untuk kembali ke role asli (YBS)',
    example: false,
    default: false,
  })
  @IsOptional()
  resetToOriginal?: boolean;
}
