import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CekDokumenService } from '../services/cek-dokumen.service';
import {
  CekDokumenBySignatureIdDto,
  CekDokumenByNameDocDto,
  CekDokumenResponseDto,
} from '../dto/cek-dokumen.dto';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller untuk fitur "Cek Dokumen"
 * Verifikasi dokumen yang sudah ditandatangani BSrE
 */
@Controller('digsig/cek-dokumen')
@UseGuards(JwtAuthGuard)
export class CekDokumenController {
  constructor(private readonly cekDokumenService: CekDokumenService) {}

  /**
   * POST /digsig/cek-dokumen/upload
   * Verifikasi dokumen dengan upload file PDF
   * 
   * Request: multipart/form-data dengan field 'file' (PDF)
   */
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async verifyByUpload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<CekDokumenResponseDto> {
    if (!file) {
      throw new BadRequestException('File PDF wajib diupload');
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    return this.cekDokumenService.verifyByFile(file, user.persnum, user.nama, ipAddress);
  }

  /**
   * POST /digsig/cek-dokumen/signature-id
   * Verifikasi dokumen berdasarkan Signature ID
   * 
   * Request Body: { signatureId: "xxx" }
   */
  @Post('signature-id')
  @HttpCode(HttpStatus.OK)
  async verifyBySignatureId(
    @Body() dto: CekDokumenBySignatureIdDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<CekDokumenResponseDto> {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    return this.cekDokumenService.verifyBySignatureId(dto.signatureId, user.persnum, user.nama, ipAddress);
  }

  /**
   * GET /digsig/cek-dokumen/signature-id/:signatureId
   * Verifikasi dokumen berdasarkan Signature ID (via URL param)
   */
  @Get('signature-id/:signatureId')
  @HttpCode(HttpStatus.OK)
  async verifyBySignatureIdParam(
    @Param('signatureId') signatureId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<CekDokumenResponseDto> {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    return this.cekDokumenService.verifyBySignatureId(signatureId, user.persnum, user.nama, ipAddress);
  }

  /**
   * POST /digsig/cek-dokumen/name-doc
   * Verifikasi dokumen berdasarkan nama dokumen (name_doc dari BSrE)
   * 
   * Request Body: { nameDoc: "filename.pdf" }
   */
  @Post('name-doc')
  @HttpCode(HttpStatus.OK)
  async verifyByNameDoc(
    @Body() dto: CekDokumenByNameDocDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<CekDokumenResponseDto> {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    return this.cekDokumenService.verifyByNameDoc(dto.nameDoc, user.persnum, user.nama, ipAddress);
  }
}
