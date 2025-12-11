import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
} from 'class-validator';

/**
 * DTO untuk satu file dalam booking
 */
export class BookingFileDto {
  @IsOptional()
  @IsString()
  file_name?: string;

  @IsOptional()
  @IsString()
  file_text?: string;
}

/**
 * DTO untuk booking nomor request detail
 */
export class BookingNomorRequestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  jumlah?: number; // Jika tidak diisi, gunakan jumlah dari request

  @IsOptional()
  @IsArray()
  files?: BookingFileDto[]; // Array file yang akan dibooking
}

/**
 * Response DTO untuk booking
 */
export class BookingNomorRequestResponseDto {
  success: boolean;
  message: string;
  data: {
    request_id: string;
    details: {
      id: string;
      status: string;
      file_name: string | null;
      file_text: string | null;
      created_at: Date;
    }[];
  };
}

/**
 * DTO untuk approve nomor request detail (single)
 */
export class ApproveNomorRequestDetailDto {
  @IsOptional()
  @IsString()
  file_name?: string;

  @IsOptional()
  @IsString()
  file_text?: string;
}

/**
 * Response DTO untuk approve (single)
 */
export class ApproveNomorRequestDetailResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    nomor: string;
    status: string;
    file_name: string | null;
    file_text: string | null;
  };
}

/**
 * Response DTO untuk reject (single)
 */
export class RejectNomorRequestDetailResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    status: string;
  };
}

/**
 * DTO untuk approve banyak nomor request detail sekaligus
 */
export class ApproveBulkNomorRequestDetailDto {
  @IsNotEmpty({ message: 'Detail IDs harus diisi' })
  @IsArray({ message: 'Detail IDs harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal 1 detail ID' })
  @IsString({ each: true })
  detail_ids: string[];

  @IsOptional()
  @IsString()
  file_name?: string;

  @IsOptional()
  @IsString()
  file_text?: string;
}

/**
 * Response DTO untuk approve bulk
 */
export class ApproveBulkNomorRequestDetailResponseDto {
  success: boolean;
  message: string;
  data: {
    success_count: number;
    failed_count: number;
    results: {
      id: string;
      nomor: string | null;
      status: string;
      success: boolean;
      error?: string;
    }[];
  };
}

/**
 * DTO untuk reject banyak nomor request detail sekaligus
 */
export class RejectBulkNomorRequestDetailDto {
  @IsNotEmpty({ message: 'Detail IDs harus diisi' })
  @IsArray({ message: 'Detail IDs harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal 1 detail ID' })
  @IsString({ each: true })
  detail_ids: string[];
}

/**
 * Response DTO untuk reject bulk
 */
export class RejectBulkNomorRequestDetailResponseDto {
  success: boolean;
  message: string;
  data: {
    success_count: number;
    failed_count: number;
    results: {
      id: string;
      status: string;
      success: boolean;
      error?: string;
    }[];
  };
}

/**
 * Response DTO untuk delete nomor request
 */
export class DeleteNomorRequestResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    deleted_at: Date;
  };
}

/**
 * Response DTO untuk reject all nomor in request
 */
export class RejectAllNomorRequestResponseDto {
  success: boolean;
  message: string;
  data: {
    request_id: string;
    total_rejected: number;
    rejected_details: {
      id: string;
      status: string;
    }[];
  };
}
