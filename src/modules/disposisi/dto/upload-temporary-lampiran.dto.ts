export class UploadTemporaryLampiranResponseDto {
  success: boolean;
  data: {
    temp_folder_id: string;
    files: Array<{
      id: string;
      file_name: string;
      file_path: string;
      file_url: string;
    }>;
  };
}
