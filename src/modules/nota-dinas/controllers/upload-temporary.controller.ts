import { Controller, Post, Delete, Param, HttpException, HttpStatus, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { NotaDinasService } from '../services/nota-dinas.service';
import { UploadTemporaryLampiranResponseDto } from '../dto/upload-temporary-lampiran.dto';
import { Public } from '../../../common/decorators';

@Controller()
export class UploadTemporaryController {
  constructor(private readonly notaDinasService: NotaDinasService) {}

  /**
   * POST /upload-temporary
   * Upload lampiran ke temporary storage (umum untuk semua jenis naskah)
   * Files akan disimpan sementara dengan is_temporary=1
   * Return temp_folder_id dan array of file IDs yang nanti digunakan di endpoint save-draft/send-message
   *
   * Form-data:
   * - lampiran_files: file[] (multiple PDF files)
   *
   * @returns UploadTemporaryLampiranResponseDto
   * 
   * Response:
   * {
   *   success: true,
   *   data: {
   *     temp_folder_id: "uuid",
   *     files: [
   *       { id: "uuid", file_name: "filename.pdf", file_path: "temporary/uuid/filename.pdf" }
   *     ]
   *   }
   * }
   *
   * @throws 400 - Bad Request (no files uploaded)
   * @throws 500 - Internal Server Error
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('upload-temporary')
  @UseInterceptors(
    FilesInterceptor('lampiran_files', 10, {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
      },
    }),
  )
  async uploadTemporary(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadTemporaryLampiranResponseDto> {
    try {
      return await this.notaDinasService.uploadTemporaryLampiran(files);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to upload temporary lampiran',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /file-temporary/:id
   * Delete lampiran by ID (temporary atau final draft)
   * Tidak bisa menghapus lampiran dari naskah yang sudah final/final_tte
   *
   * @param id - Lampiran ID (UUID)
   * @returns Success response
   *
   * Response:
   * {
   *   success: true,
   *   message: "Lampiran filename.pdf berhasil dihapus"
   * }
   *
   * @throws 404 - Not Found (lampiran tidak ditemukan)
   * @throws 400 - Bad Request (lampiran dari naskah final tidak bisa dihapus)
   * @throws 500 - Internal Server Error
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Delete('file-temporary/:id')
  async deleteLampiran(
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      return await this.notaDinasService.deleteLampiran(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to delete lampiran',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
