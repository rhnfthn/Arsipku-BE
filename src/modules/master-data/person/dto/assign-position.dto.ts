import {
  IsInt,
  IsString,
  IsOptional,
  IsDateString,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for assigning additional position to existing person
 * This only creates om_relation_sp record (position assignment)
 * Does NOT create new person in pa_personal
 */
export class AssignPositionDto {
  @ApiProperty({
    description: 'Persnum of existing person',
    example: 12345,
  })
  @IsInt()
  @IsNotEmpty()
  persnum: number;

  @ApiProperty({
    description: 'Company ID for the new position',
    example: 2000,
  })
  @IsInt()
  @IsNotEmpty()
  company: number;

  @ApiProperty({
    description: 'Position ID to assign',
    example: 60001234,
  })
  @IsInt()
  @IsNotEmpty()
  position: number;

  @ApiPropertyOptional({
    description:
      'Position text/name (will be auto-fetched from om_position if not provided)',
    example: 'Komisaris',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  positionText?: string;

  @ApiPropertyOptional({
    description: 'Start date of position assignment',
    example: '2026-01-01',
    default: '2025-01-01',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date of position assignment',
    example: '9999-12-31',
    default: '9999-12-31',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Username who created the assignment',
    example: 'admin',
  })
  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
