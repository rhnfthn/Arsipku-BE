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

@Controller('berkas')
export class BerkasController {
  constructor(private readonly berkasService: BerkasService) {}

  /**
   * POST /berkas
   * Membuat berkas baru
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
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
  async findOne(@Param('id') id: string): Promise<Berkas> {
    return this.berkasService.findOne(id);
  }

  /**
   * PUT /berkas/:id
   * Mengupdate berkas
   */
  @Put(':id')
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
  async softDelete(@Param('id') id: string): Promise<{ message: string }> {
    return this.berkasService.softDelete(id);
  }

  /**
   * DELETE /berkas/:id
   * Hard delete berkas (menghapus permanen dari database)
   */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.berkasService.remove(id);
  }

  /**
   * PATCH /berkas/:id/restore
   * Mengaktifkan kembali berkas yang sudah dinonaktifkan
   */
  @Patch(':id/restore')
  async restore(@Param('id') id: string): Promise<Berkas> {
    return this.berkasService.restore(id);
  }
}
