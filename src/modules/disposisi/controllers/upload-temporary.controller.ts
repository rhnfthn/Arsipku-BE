import {
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DisposisiService } from '../services/disposisi.service';
import { UploadTemporaryLampiranResponseDto } from '../dto/upload-temporary-lampiran.dto';
import { JwtAuthGuard } from '../../../common/guards';

@Controller('DI')
export class UploadTemporaryController {
  constructor(private readonly disposisiService: DisposisiService) {}

  /**
   * POST /DI/upload-temporary
   * Upload lampiran ke temporary storage untuk Disposisi
   * Return temp_folder_id dan array of file IDs yang nanti digunakan di endpoint save-draft/send-message
   * 
   * Files akan disimpan dengan:
   * - is_temporary = 1
   * - temp_folder_id = UUID yang sama untuk satu batch upload
   * - Belum ada id_naskah (masih null)
   * 
   * Response format:
   * {
   *   "success": true,
   *   "data": {
   *     "temp_folder_id": "uuid",
   *     "files": [
   *       { "id": "file-uuid-1", "file_name": "lampiran1.pdf", "file_path": "temporary/xxx/lampiran1.pdf" },
   *       { "id": "file-uuid-2", "file_name": "lampiran2.pdf", "file_path": "temporary/xxx/lampiran2.pdf" }
   *     ]
   *   }
   * }
   * 
   * @param files - Array of files to upload (field name: 'files')
   * @returns UploadTemporaryLampiranResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 10))
  @Post('upload-temporary')
  async uploadTemporary(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadTemporaryLampiranResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    return await this.disposisiService.uploadTemporaryLampiran(files);
  }
}
