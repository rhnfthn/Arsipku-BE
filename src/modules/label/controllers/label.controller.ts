import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { LabelService } from '../services';
import {
  CreateLabelDto,
  UpdateLabelDto,
  AddNaskahToLabelDto,
  QueryLabelNaskahDto,
} from '../dto';
import { LabelEntity, NaskahLabelEntity } from '../entities';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('labels')
@UseGuards(JwtAuthGuard)
export class LabelController {
  constructor(private readonly labelService: LabelService) {}

  private getPositionId(user: JwtPayload): string {
    if (!user.position) {
      throw new BadRequestException('Position ID is required');
    }
    return user.position;
  }

  private getUserId(user: JwtPayload): string {
    return user.persnum.toString();
  }

  /**
   * POST /labels
   * Membuat label baru
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createLabelDto: CreateLabelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<LabelEntity> {
    return this.labelService.create(
      createLabelDto,
      this.getPositionId(user),
      this.getUserId(user),
    );
  }

  /**
   * GET /labels
   * Mengambil semua label dengan struktur hierarki
   */
  @Get()
  async findAll(@CurrentUser() user: JwtPayload): Promise<LabelEntity[]> {
    return this.labelService.findAll(this.getPositionId(user));
  }

  /**
   * GET /labels/flat
   * Mengambil semua label tanpa hierarki
   */
  @Get('flat')
  async findAllFlat(@CurrentUser() user: JwtPayload): Promise<LabelEntity[]> {
    return this.labelService.findAllFlat(this.getPositionId(user));
  }

  /**
   * GET /labels/counts
   * Menghitung jumlah naskah per label
   */
  @Get('counts')
  async countNaskahPerLabel(
    @CurrentUser() user: JwtPayload,
  ): Promise<Record<string, number>> {
    return this.labelService.countNaskahPerLabel(this.getPositionId(user));
  }

  /**
   * GET /labels/:labelId/naskah
   * Mengambil semua naskah dengan label tertentu beserta detail lengkap
   */
  @Get(':labelId/naskah')
  async getNaskahByLabel(
    @Param('labelId') labelId: string,
    @Query() query: QueryLabelNaskahDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<any> {
    return this.labelService.getNaskahByLabel(
      labelId,
      this.getPositionId(user),
      query,
    );
  }

  /**
   * GET /labels/:id
   * Mengambil label berdasarkan ID
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<LabelEntity> {
    return this.labelService.findOne(id, this.getPositionId(user));
  }

  /**
   * PATCH /labels/:id
   * Update label
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateLabelDto: UpdateLabelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<LabelEntity> {
    return this.labelService.update(
      id,
      updateLabelDto,
      this.getPositionId(user),
    );
  }

  /**
   * DELETE /labels/:id
   * Soft delete label
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.labelService.remove(id, this.getPositionId(user));
  }

  /**
   * POST /labels/naskah/:naskahId
   * Menambahkan naskah ke label
   */
  @Post('naskah/:naskahId')
  @HttpCode(HttpStatus.CREATED)
  async addNaskahToLabels(
    @Param('naskahId') naskahId: string,
    @Body() addNaskahToLabelDto: AddNaskahToLabelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<NaskahLabelEntity[]> {
    return this.labelService.addNaskahToLabels(
      naskahId,
      addNaskahToLabelDto,
      this.getPositionId(user),
      this.getUserId(user),
    );
  }

  /**
   * DELETE /labels/naskah/:naskahId/:labelId
   * Menghapus naskah dari label
   */
  @Delete('naskah/:naskahId/:labelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeNaskahFromLabel(
    @Param('naskahId') naskahId: string,
    @Param('labelId') labelId: string,
  ): Promise<void> {
    return this.labelService.removeNaskahFromLabel(naskahId, labelId);
  }

  /**
   * GET /labels/naskah/:naskahId
   * Mengambil semua label dari naskah
   */
  @Get('naskah/:naskahId')
  async getLabelsForNaskah(
    @Param('naskahId') naskahId: string,
  ): Promise<LabelEntity[]> {
    return this.labelService.getLabelsForNaskah(naskahId);
  }
}
