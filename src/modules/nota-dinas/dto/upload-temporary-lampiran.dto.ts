import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * DTO untuk response upload lampiran temporary
 */
export class UploadTemporaryLampiranResponseDto {
  success: boolean;
  data: {
    temp_folder_id: string;
    files: {
      id: string;
      file_name: string;
      file_path: string;
    }[];
  };
}

/**
 * DTO untuk menambahkan lampiran temporary IDs ke DTO utama
 */
export class LampiranTemporaryDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[]; // Array of lampiran IDs yang sudah diupload temporary
}
