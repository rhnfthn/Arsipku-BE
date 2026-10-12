import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import { TuGuard } from '../../tu-verifikasi/guards/tu-guard';
import { UsulanTertujuService } from '../services/usulan-tertuju.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('persuratan/eksternal-usulan')
@UseGuards(JwtAuthGuard)
export class UsulanTertujuController {
  constructor(private readonly usulanTertujuService: UsulanTertujuService) {}

  /** GET /persuratan/eksternal-usulan/generate-kode — preview kode unik global */
  @Get('generate-kode')
  async generateKode(): Promise<{ success: boolean; data: string }> {
    const kode = await this.usulanTertujuService.generateKodePreview();
    return { success: true, data: kode };
  }

  /**
   * GET /persuratan/eksternal-usulan/pending-count — badge sidebar TU.
   * TU: hanya count usulan pending di area penugasannya; SUPERADMIN: semua area.
   */
  @Get('pending-count')
  @UseGuards(TuGuard)
  async pendingCount(@CurrentUser() user: JwtPayload) {
    const total = await this.usulanTertujuService.countPendingForUser({
      role: user.role,
      persnum: user.persnum,
      area: user.area,
    });
    return { success: true, total };
  }

  /** POST /persuratan/eksternal/usulan — ajukan tertuju eksternal (semua user) */
  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { nama: string; alamat?: string; telepon?: string; email?: string },
  ) {
    const usulan = await this.usulanTertujuService.createUsulan(dto, {
      persnum: user.persnum,
      nama: user.nama,
      position: user.position,
    });
    return { success: true, data: usulan };
  }

  /** GET /persuratan/eksternal/usulan/mine — riwayat usulan user */
  @Get('mine')
  async mine(@CurrentUser() user: JwtPayload) {
    const data = await this.usulanTertujuService.findMine(user.persnum);
    return { success: true, data };
  }

  /**
   * GET /persuratan/eksternal/usulan — list untuk verifikasi TU.
   * TU hanya melihat usulan di area-nya; SUPERADMIN/ADMIN semua area.
   */
  @Get()
  @UseGuards(TuGuard)
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: 'pending' | 'disetujui' | 'ditolak',
  ) {
    const data = await this.usulanTertujuService.findForVerification(
      {
        role: user.role,
        tuRoles: user.tuRoles,
        persnum: user.persnum,
        area: user.area,
      },
      status,
    );
    return { success: true, data };
  }

  /** PATCH /persuratan/eksternal/usulan/:id/approve — setujui (TU) */
  @Patch(':id/approve')
  @UseGuards(TuGuard)
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto?: { catatan?: string },
  ) {
    const data = await this.usulanTertujuService.approve(
      id,
      {
        persnum: user.persnum,
        nama: user.nama,
        role: user.role,
        area: user.area,
      },
      dto,
    );
    return { success: true, data };
  }

  /** PATCH /persuratan/eksternal/usulan/:id/reject — tolak dengan catatan (TU) */
  @Patch(':id/reject')
  @UseGuards(TuGuard)
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: { catatan: string },
  ) {
    const data = await this.usulanTertujuService.reject(
      id,
      {
        persnum: user.persnum,
        nama: user.nama,
        role: user.role,
        area: user.area,
      },
      dto,
    );
    return { success: true, data };
  }
}
