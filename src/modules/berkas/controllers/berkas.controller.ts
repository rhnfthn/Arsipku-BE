import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BerkasService } from '../services';
import { CreateBerkasDto, UpdateBerkasDto } from '../dto';
import { Berkas } from '../entities/berkas.entity';
import { RequirePermission } from '../../../common/decorators';

@Controller('berkas')
export class BerkasController {
  constructor(private readonly berkasService: BerkasService) {}

  /**
   * POST /berkas
   * Membuat berkas baru
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('arsip-aktif', 'create')
  async create(@Body() createBerkasDto: CreateBerkasDto): Promise<Berkas> {
    return this.berkasService.create(createBerkasDto);
  }

  /**
   * GET /berkas
   * Mengambil semua berkas
   * Query params:
   *  - includeInactive: boolean (default: false)
   */
  @Get()
  @RequirePermission('arsip-aktif', 'read')
  async findAll(
    @Query('includeInactive') includeInactive?: string,
  ): Promise<Berkas[]> {
    const includeInactiveBool = includeInactive === 'true';
    return this.berkasService.findAll(includeInactiveBool);
  }

  /**
   * GET /berkas/:id
   * Mengambil berkas berdasarkan ID
   */
  @Get(':id')
  @RequirePermission('arsip-aktif', 'read')
  async findOne(@Param('id') id: string): Promise<Berkas> {
    return this.berkasService.findOne(id);
  }

  /**
   * PUT /berkas/:id
   * Mengupdate berkas
   */
  @Put(':id')
  @RequirePermission('arsip-aktif', 'update')
  async update(
    @Param('id') id: string,
    @Body() updateBerkasDto: UpdateBerkasDto,
  ): Promise<Berkas> {
    return this.berkasService.update(id, updateBerkasDto);
  }

  /**
   * DELETE /berkas/:id/soft
   * Soft delete berkas (mengubah is_aktif menjadi false)
   */
  @Delete(':id/soft')
  @RequirePermission('arsip-aktif', 'delete')
  async softDelete(@Param('id') id: string): Promise<{ message: string }> {
    return this.berkasService.softDelete(id);
  }

  /**
   * DELETE /berkas/:id
   * Hard delete berkas (menghapus permanen dari database)
   */
  @Delete(':id')
  @RequirePermission('arsip-aktif', 'delete')
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.berkasService.remove(id);
  }

  /**
   * PATCH /berkas/:id/restore
   * Mengaktifkan kembali berkas yang sudah dinonaktifkan
   */
  @Patch(':id/restore')
  @RequirePermission('arsip-aktif', 'update')
  async restore(@Param('id') id: string): Promise<Berkas> {
    return this.berkasService.restore(id);
  }
}
