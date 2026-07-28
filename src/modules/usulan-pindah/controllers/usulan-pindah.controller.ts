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
import { UsulanPindahService } from '../services/usulan-pindah.service';
import { CreateUsulanPindahDto } from '../dto/create-usulan.dto';
import {
  VerifyUsulanDto,
  ApproveUsulanDto,
  RejectUsulanDto,
  FinalVerifyUsulanDto,
  PreparePhysicalDto,
} from '../dto/usulan-pindah.dto';
import { UsulanPindahFilterDto } from '../dto/usulan-pindah-filter.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { CurrentUser, Roles } from '../../../common/decorators';
import { RoleName } from '../../../common/enums';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller API Usulan Pindah Arsip Inaktif.
 *
 * Endpoint:
 *   POST   /usulan-pindah              — buat usulan (Sekretaris)
 *   GET    /usulan-pindah              — list usulan (role-based)
 *   GET    /usulan-pindah/summary      — ringkasan dashboard
 *   GET    /usulan-pindah/:id          — detail usulan
 *   PATCH  /usulan-pindah/:id/send     — kirim ke atasan
 *   PATCH  /usulan-pindah/:id/approve  — atasan setujui
 *   PATCH  /usulan-pindah/:id/reject   — atasan tolak
 *   PATCH  /usulan-pindah/:id/final-verify — verifikasi terakhir
 *   PATCH  /usulan-pindah/:id/dispatch — kirim usulan
 *   PATCH  /usulan-pindah/:id/prepare-physical — siapkan berkas fisik
 *   PATCH  /usulan-pindah/:id/complete — tandai selesai
 *   POST   /usulan-pindah/:id/berita-acara — generate berita acara
 */
@ApiTags('Usulan Pindah')
@ApiBearerAuth()
@Controller('usulan-pindah')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsulanPindahController {
  constructor(private readonly service: UsulanPindahService) {}

  @Get('summary')
  async getSummary(@CurrentUser() user: JwtPayload) {
    const summary = await this.service.getSummary(user);
    return { success: true, data: summary };
  }

  @Post()
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async create(
    @Body() dto: CreateUsulanPindahDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.service.create(dto, user);
    return { success: true, data };
  }

  @Get()
  async findAll(
    @Query() filter: UsulanPindahFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.service.findAll(filter, user);
    return { success: true, ...result };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id/send')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async send(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.service.send(id, user);
    return { success: true, data };
  }

  @Patch(':id/approve')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveUsulanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.service.approve(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id/reject')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectUsulanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.service.reject(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id/final-verify')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async finalVerify(
    @Param('id') id: string,
    @Body() dto: FinalVerifyUsulanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.service.finalVerify(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id/dispatch')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async dispatch(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.service.dispatch(id, user);
    return { success: true, data };
  }

  @Patch(':id/prepare-physical')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async preparePhysical(
    @Param('id') id: string,
    @Body() dto: PreparePhysicalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.service.preparePhysical(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id/complete')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async complete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.service.complete(id, user);
    return { success: true, data };
  }

  @Post(':id/berita-acara')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async generateBeritaAcara(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.service.generateBeritaAcara(id, user);
    return { success: true, data };
  }
}
