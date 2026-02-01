import {
  IsInt,
  IsString,
  IsOptional,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating existing position assignment
 * Used to modify om_relation_sp record
 */
export class UpdateAssignPositionDto {
  @ApiPropertyOptional({
    description: 'Position text/name (will be auto-fetched from om_position if not provided)',
    example: 'Direktur Utama',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  positionText?: string;

  @ApiPropertyOptional({
    description: 'Start date of position assignment',
    example: '2026-01-01',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date of position assignment',
    example: '9999-12-31',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Username who updated the assignment',
    example: 'admin',
  })
  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
