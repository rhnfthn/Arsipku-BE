import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { StorageService, UploadResult } from '../../storage/services/storage.service';
import { RequirePermission } from '../../../common/decorators';

@Controller('upload')
export class UploadController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Upload single file
   * POST /upload/file
   * Body: form-data with key 'file'
   */
  @Post('file')
  @RequirePermission('naskah-dinas', 'create')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ success: boolean; data: UploadResult }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const result = await this.storageService.uploadFile(file, 'uploads');

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Upload single file ke folder tertentu
   * POST /upload/file/:folder
   * Body: form-data with key 'file'
   */
  @Post('file/:folder')
  @RequirePermission('naskah-dinas', 'create')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
    }),
  )
  async uploadFileToFolder(
    @UploadedFile() file: Express.Multer.File,
    @Param('folder') folder: string,
  ): Promise<{ success: boolean; data: UploadResult }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const result = await this.storageService.uploadFile(file, folder);

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Upload multiple files
   * POST /upload/files
   * Body: form-data with key 'files' (multiple)
   */
  @Post('files')
  @RequirePermission('naskah-dinas', 'create')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max per file
      },
    }),
  )
  async uploadMultipleFiles(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<{ success: boolean; data: UploadResult[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const results = await Promise.all(
      files.map((file) => this.storageService.uploadFile(file, 'uploads')),
    );

    return {
      success: true,
      data: results,
    };
  }

  /**
   * Get signed URL untuk file
   * GET /upload/url/:key
   */
  @Get('url/*key')
  @RequirePermission('naskah-dinas', 'read')
  async getFileUrl(
    @Param('key') key: string,
  ): Promise<{ success: boolean; url: string }> {
    const url = await this.storageService.getFileUrl(key);

    return {
      success: true,
      url,
    };
  }

  /**
   * Download file langsung
   * GET /upload/download/:key
   */
  @Get('download/*key')
  @RequirePermission('naskah-dinas', 'read')
  async downloadFile(
    @Param('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, contentType } = await this.storageService.getFileWithMetadata(key);

    // Extract filename from key
    const filename = key.split('/').pop() || 'download';

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(buffer);
  }

  /**
   * List files dalam folder
   * GET /upload/list/:prefix?
   */
  @Get('list')
  @RequirePermission('naskah-dinas', 'read')
  async listAllFiles(): Promise<{ success: boolean; files: string[] }> {
    const files = await this.storageService.listFiles();

    return {
      success: true,
      files,
    };
  }

  @Get('list/:prefix')
  @RequirePermission('naskah-dinas', 'read')
  async listFiles(
    @Param('prefix') prefix: string,
  ): Promise<{ success: boolean; files: string[] }> {
    const files = await this.storageService.listFiles(prefix);

    return {
      success: true,
      files,
    };
  }

  /**
   * Check apakah file exists
   * GET /upload/exists/:key
   */
  @Get('exists/*key')
  @RequirePermission('naskah-dinas', 'read')
  async checkFileExists(
    @Param('key') key: string,
  ): Promise<{ success: boolean; exists: boolean }> {
    const exists = await this.storageService.fileExists(key);

    return {
      success: true,
      exists,
    };
  }

  /**
   * Delete file
   * DELETE /upload/file/:key
   */
  @Delete('file/*key')
  @RequirePermission('naskah-dinas', 'delete')
  async deleteFile(
    @Param('key') key: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.storageService.deleteFile(key);

    return {
      success: true,
      message: 'File deleted successfully',
    };
  }
}
