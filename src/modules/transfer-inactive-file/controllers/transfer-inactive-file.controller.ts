import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TransferInactiveFileService } from '../services/transfer-inactive-file.service';
import { CreateTransferDto } from '../dto/transfer.dto';
import {
  ApproveTransferDto,
  RejectTransferDto,
  FinalVerifyTransferDto,
  VerifyPhysicalFilesDto,
  TuApproveDto,
  FinalApprovalTuDto,
} from '../dto/transfer.dto';
import { TransferFilterDto } from '../dto/transfer-filter.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { CurrentUser, Roles } from '../../../common/decorators';
import { RoleName } from '../../../common/enums';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller API Pemindahan Arsip Inaktif.
 * 2 Unit: Unit Kerja (Sekretaris + Atasan) → Unit Tata Naskah (TU + Atasan TU).
 */
@ApiTags('Transfer Inactive File')
@ApiBearerAuth()
@Controller('transfer-inactive-file')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransferInactiveFileController {
  constructor(private readonly service: TransferInactiveFileService) {}

  @Get('summary')
  async getSummary(@CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.getSummary(user) };
  }

  @Post()
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async create(
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.create(dto, user) };
  }

  @Get()
  async findAll(
    @Query() filter: TransferFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, ...(await this.service.findAll(filter, user)) };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.findOne(id, user) };
  }

  // ─── Unit Kerja ────────────────────────────────────────────────────────
  @Patch(':id/send')
  async send(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.send(id, user) };
  }

  @Patch(':id/approve')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.approve(id, dto, user) };
  }

  @Patch(':id/reject')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.reject(id, dto, user) };
  }

  @Patch(':id/final-verify')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async finalVerify(
    @Param('id') id: string,
    @Body() dto: FinalVerifyTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.finalVerify(id, dto, user),
    };
  }

  @Patch(':id/dispatch')
  async dispatch(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.dispatch(id, user) };
  }

  // ─── Unit Tata Naskah ──────────────────────────────────────────────────
  @Patch(':id/verify-physical')
  async verifyPhysical(
    @Param('id') id: string,
    @Body() dto: VerifyPhysicalFilesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.verifyPhysicalFiles(id, dto, user),
    };
  }

  @Patch(':id/tu-approve')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async tuApprove(
    @Param('id') id: string,
    @Body() dto: TuApproveDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.tuApprove(id, dto, user) };
  }

  @Patch(':id/tu-reject')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async tuReject(
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.tuReject(id, dto, user) };
  }

  @Patch(':id/tu-final-approve')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async tuFinalApprove(
    @Param('id') id: string,
    @Body() dto: FinalApprovalTuDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.tuFinalApprove(id, dto, user),
    };
  }

  @Patch(':id/tu-final-reject')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async tuFinalReject(
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.tuFinalReject(id, dto, user),
    };
  }

  @Patch(':id/receive')
  async receive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.receiveArchive(id, user) };
  }

  @Patch(':id/arrange')
  async arrange(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.arrangeArchive(id, user) };
  }

  @Patch(':id/complete')
  async complete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.complete(id, user) };
  }

  @Post(':id/berita-acara')
  async generateBeritaAcara(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.generateBeritaAcara(id, user),
    };
  }
}
