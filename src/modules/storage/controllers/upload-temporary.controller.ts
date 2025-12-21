import {
  Controller,
  Post,
  Delete,
  Param,
  HttpException,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { StorageService } from '../services/storage.service';
import { Public } from '../../../common/decorators';
import { v4 as uuidv4 } from 'uuid';

export interface UploadTemporaryLampiranResponseDto {
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
 * Global Upload Temporary Controller
 * Endpoint: POST /upload-temporary dan DELETE /file-temporary/:id
 * 
 * Digunakan untuk semua jenis naskah (ND, SDI, SDE, DI, dll)
 * Files akan disimpan sementara dengan is_temporary=1
 */
@Controller()
export class UploadTemporaryController {
  constructor(
    private readonly storageService: StorageService,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
  ) {}

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
  @Public() // Development: Bypass auth
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
      if (!files || files.length === 0) {
        throw new HttpException(
          {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Tidak ada file yang diupload',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const tempFolderId = uuidv4();
      const uploadedFiles: {
        id: string;
        file_name: string;
        file_path: string;
      }[] = [];

      // Upload semua files ke temporary folder
      for (const file of files) {
        const uploadResult = await this.storageService.uploadFile(
          file,
          `temporary/${tempFolderId}`,
        );

        // Simpan ke database dengan is_temporary=1
        const lampiranEntity = this.naskahLampiranRepository.create({
          id: uuidv4(),
          id_naskah: null, // Belum ada naskah
          file_name: file.originalname,
          file_pdf: uploadResult.key,
          // jenis will be set when attached to naskah (nullable, defaults to null)
          is_temporary: 1,
          temp_folder_id: tempFolderId,
        } as Partial<NaskahLampiranEntity>);

        await this.naskahLampiranRepository.save(lampiranEntity);

        uploadedFiles.push({
          id: lampiranEntity.id,
          file_name: lampiranEntity.file_name,
          file_path: lampiranEntity.file_pdf,
        });
      }

      return {
        success: true,
        data: {
          temp_folder_id: tempFolderId,
          files: uploadedFiles,
        },
      };
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
  @Public() // Development: Bypass auth
  @Delete('file-temporary/:id')
  async deleteLampiran(
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Find lampiran
      const lampiran = await this.naskahLampiranRepository.findOne({
        where: { id: id },
      });

      if (!lampiran) {
        throw new HttpException(
          {
            success: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: `Lampiran dengan ID ${id} tidak ditemukan`,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Check if lampiran is attached to a naskah that is already final
      if (lampiran.id_naskah && lampiran.is_temporary === 0) {
        // Lampiran sudah attach ke naskah final, perlu cek status naskah
        const naskah = await this.naskahRepository.findOne({
          where: { id: lampiran.id_naskah },
        });

        if (
          naskah &&
          (naskah.status === 'final' || naskah.status === 'final_tte')
        ) {
          throw new HttpException(
            {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Tidak dapat menghapus lampiran dari naskah yang sudah final',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      // Delete file from storage
      try {
        await this.storageService.deleteFile(lampiran.file_pdf);
      } catch (error) {
        // Log error but continue - file might already be deleted
        console.error(`Failed to delete file from storage: ${error.message}`);
      }

      const fileName = lampiran.file_name;

      // Delete from database
      await this.naskahLampiranRepository.remove(lampiran);

      return {
        success: true,
        message: `Lampiran ${fileName} berhasil dihapus`,
      };
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
