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
import { NaskahReferensiService } from '../services/naskah_referensi.service';
import { CreateNaskahReferensiDto } from '../dto/naskah_referensi/create_naskah_referensi.dto';
import { UpdateNaskahReferensiDto } from '../dto/naskah_referensi/update_naskah_referensi.dto';

@Controller('persuratan/naskah-referensi')
export class NaskahReferensiController {
  constructor(
    private readonly naskahReferensiService: NaskahReferensiService,
  ) {}

  @Post()
  create(@Body() createNaskahReferensiDto: CreateNaskahReferensiDto) {
    return this.naskahReferensiService.create(createNaskahReferensiDto);
  }

  @Get()
  findAll(@Query('id_naskah') id_naskah?: string) {
    return this.naskahReferensiService.findAll(id_naskah);
  }

  @Get('naskah/:id_naskah')
  findByNaskah(@Param('id_naskah') id_naskah: string) {
    return this.naskahReferensiService.findByNaskah(id_naskah);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.naskahReferensiService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateNaskahReferensiDto: UpdateNaskahReferensiDto,
  ) {
    return this.naskahReferensiService.update(id, updateNaskahReferensiDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.naskahReferensiService.remove(id);
  }
}
