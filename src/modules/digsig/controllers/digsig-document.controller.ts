import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DigsigDocumentService } from '../services/digsig-document.service';
import {
  CreateDigsigDocumentDto,
  UpdateDigsigDocumentDto,
  FilterDigsigDocumentDto,
  SignDocumentDto,
  RejectDocumentDto,
  DigsigDocumentPaginatedResponseDto,
} from '../dto/digsig-document.dto';
import { DigsigDocumentEntity } from '../entities/digsig-document.entity';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StorageService } from '../../storage/services/storage.service';
import { JenisService } from '../../jenis/services/jenis.service';

@Controller('digsig/document')
@UseGuards(JwtAuthGuard)
export class DigsigDocumentController {
  constructor(
    private readonly documentService: DigsigDocumentService,
    private readonly storageService: StorageService,
    private readonly jenisService: JenisService,
  ) {}

  /**
   * POST /digsig/document
   * Create new document for signing
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Body() dto: CreateDigsigDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ): Promise<DigsigDocumentEntity> {
    // Validate file
    if (!file) {
      throw new BadRequestException('File attachment wajib diupload');
    }

    // Validate file type
    const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('File harus berformat PDF, DOC, atau DOCX');
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Ukuran file maksimal 10MB');
    }

    // Upload file to MinIO
    const timestamp = Date.now();
    const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}-${cleanFileName}`;
    
    const uploadResult = await this.storageService.uploadBuffer(
      file.buffer,
      fileName,
      file.mimetype,
      'digsig-document/uploads',
    );

    const fileInfo = {
      path: uploadResult.key,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };

    return this.documentService.create(
      dto,
      fileInfo,
      user.persnum,
      user.nama,
      user.positionText,
    );
  }

  /**
   * PUT /digsig/document/:id
   * Update document
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDigsigDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DigsigDocumentEntity> {
    let fileInfo: { path: string; name: string; size: number; mimeType: string } | null = null;

    if (file) {
      // Validate file type
      const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedMimes.includes(file.mimetype)) {
        throw new BadRequestException('File harus berformat PDF, DOC, atau DOCX');
      }

      // Validate file size
      if (file.size > 10 * 1024 * 1024) {
        throw new BadRequestException('Ukuran file maksimal 10MB');
      }

      const timestamp = Date.now();
      const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}-${cleanFileName}`;
      
      const uploadResult = await this.storageService.uploadBuffer(
        file.buffer,
        fileName,
        file.mimetype,
        'digsig-document/uploads',
      );

      fileInfo = {
        path: uploadResult.key,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      };
    }

    return this.documentService.update(id, dto, fileInfo);
  }

  /**
   * GET /digsig/document
   * Get all documents with filtering
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() filter: FilterDigsigDocumentDto,
  ): Promise<DigsigDocumentPaginatedResponseDto> {
    return this.documentService.findAll(filter);
  }

  /**
   * GET /digsig/document/my-documents
   * Get documents created by current user
   */
  @Get('my-documents')
  @HttpCode(HttpStatus.OK)
  async getMyDocuments(
    @CurrentUser() user: JwtPayload,
    @Query() filter: FilterDigsigDocumentDto,
  ): Promise<DigsigDocumentPaginatedResponseDto> {
    return this.documentService.findAll({
      ...filter,
      createdBy: user.persnum,
    });
  }

  /**
   * GET /digsig/document/pending-signatures
   * Get documents pending current user's signature
   */
  @Get('pending-signatures')
  @HttpCode(HttpStatus.OK)
  async getMyPendingSignatures(
    @CurrentUser() user: JwtPayload,
    @Query() filter: FilterDigsigDocumentDto,
  ): Promise<DigsigDocumentPaginatedResponseDto> {
    return this.documentService.getMyPendingSignatures(user.persnum, filter);
  }

  /**
   * GET /digsig/document/jenis-naskah
   * Get available jenis naskah options from master data
   */
  @Get('jenis-naskah')
  @HttpCode(HttpStatus.OK)
  async getJenisNaskahOptions() {
    const result = await this.jenisService.findAll();
    
    // Transform to match expected format
    const options = result.data.map((item) => ({
      value: item.jenis,
      label: item.jenis_text,
      id: item.id,
      format_penomoran: item.format_penomoran,
    }));

    return {
      success: true,
      data: options,
    };
  }

  /**
   * GET /digsig/document/verifikator
   * Get list of chiefs (verifikator) in the same area as the current user
   * Returns users with chief = 1 and area = current user's area
   */
  @Get('verifikator')
  @HttpCode(HttpStatus.OK)
  async getVerifikator(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentService.getVerifikator(user.area);
  }

  /**
   * GET /digsig/document/:id
   * Get document detail
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DigsigDocumentEntity> {
    return this.documentService.findById(id);
  }

  /**
   * POST /digsig/document/:id/sign
   * Sign document
   */
  @Post(':id/sign')
  @HttpCode(HttpStatus.OK)
  async signDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignDocumentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DigsigDocumentEntity> {
    return this.documentService.signDocument(id, user.persnum, dto);
  }

  /**
   * POST /digsig/document/:id/reject
   * Reject document
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDocumentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DigsigDocumentEntity> {
    return this.documentService.rejectDocument(id, user.persnum, dto);
  }

  /**
   * DELETE /digsig/document/:id
   * Cancel/delete document
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.documentService.delete(id, user.persnum);
  }
}
