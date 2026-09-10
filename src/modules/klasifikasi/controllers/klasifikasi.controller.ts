import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  Query,
} from '@nestjs/common';
import { KlasifikasiService } from '../services/klasifikasi.service';
import { CreateKlasifikasiDto } from '../dto/klasifikasi/create_klasifikasi.dto';
import { UpdateKlasifikasiDto } from '../dto/klasifikasi/update_klasifikasi.dto';
import { RequirePermission } from '../../../common/decorators';

@Controller('persuratan/klasifikasi')
export class KlasifikasiController {
  constructor(private readonly klasifikasiService: KlasifikasiService) {}

  @Get()
  findAll(@Query('company') company?: string) {
    return this.klasifikasiService.findAll(company);
  }

  @Get('by-code/:company/:kode')
  findByCode(@Param('company') company: string, @Param('kode') kode: string) {
    return this.klasifikasiService.findByCode(company, kode);
  }

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() createKlasifikasiDto: CreateKlasifikasiDto) {
    return this.klasifikasiService.create(createKlasifikasiDto);
  }

  @Get(':id/check-usage')
  checkUsage(@Param('id') id: string) {
    return this.klasifikasiService.checkUsage(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.klasifikasiService.findOne(id);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(
    @Param('id') id: string,
    @Body() updateKlasifikasiDto: UpdateKlasifikasiDto,
  ) {
    return this.klasifikasiService.update(id, updateKlasifikasiDto);
  }

  @Put(':id/toggle-active')
  @RequirePermission('master-data', 'update')
  toggleActive(@Param('id') id: string) {
    return this.klasifikasiService.toggleActive(id);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.klasifikasiService.remove(id);
  }
}
