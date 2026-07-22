import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PenandatangananService } from '../services/penandatanganan.service';
import {
  FilterPenandatangananDto,
  SignWithPassphraseDto,
  RejectSigningDto,
  PenandatangananPaginatedResponseDto,
  SigningResultDto,
  RejectResultDto,
  PenandatangananDetailDto,
} from '../dto/penandatanganan.dto';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser, RequirePermission } from '../../../common/decorators';
import { computeEffectivePersnum } from '../../../common/helpers/delegasi-rendering.helper';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller untuk fitur Penandatanganan di menu Digsig
 * Mengelola dokumen yang memerlukan tanda tangan digital user
 */
@Controller('digsig/penandatanganan')
@UseGuards(JwtAuthGuard)
export class PenandatangananController {
  constructor(private readonly penandatangananService: PenandatangananService) {}

  /**
   * GET /digsig/penandatanganan
   * Get list of documents that need current user's signature
   * Supports filtering by status (all, pending, signed, rejected)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'read-detail')
  async getMySigningList(
    @CurrentUser() user: JwtPayload,
    @Query() filter: FilterPenandatangananDto,
  ): Promise<PenandatangananPaginatedResponseDto> {
    return this.penandatangananService.getMySigningList(computeEffectivePersnum(user), filter);
  }

  /**
   * GET /digsig/penandatanganan/summary
   * Get summary statistics for current user's signing activities
   */
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'read-detail')
  async getSigningSummary(
    @CurrentUser() user: JwtPayload,
  ): Promise<{
    totalPending: number;
    totalSigned: number;
    totalRejected: number;
    total: number;
  }> {
    return this.penandatangananService.getSigningSummary(computeEffectivePersnum(user));
  }

  /**
   * GET /digsig/penandatanganan/:id
   * Get detail of a document for signing
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'read-detail')
  async getSigningDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PenandatangananDetailDto> {
    return this.penandatangananService.getSigningDetail(id, computeEffectivePersnum(user));
  }

  /**
   * POST /digsig/penandatanganan/:id/sign
   * Sign document with BSrE passphrase
   * This endpoint processes digital signature using BSrE (Balai Sertifikasi Elektronik)
   * NIK diambil dari JWT payload (user profile)
   */
  @Post(':id/sign')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'sign')
  async signDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignWithPassphraseDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SigningResultDto> {
    return this.penandatangananService.signDocument(
      id,
      dto,
      user,
    );
  }

  /**
   * POST /digsig/penandatanganan/:id/reject
   * Reject document signing with reason
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'sign')
  async rejectDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSigningDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RejectResultDto> {
    return this.penandatangananService.rejectDocument(
      id,
      computeEffectivePersnum(user),
      dto,
      user.nama,
    );
  }
}
