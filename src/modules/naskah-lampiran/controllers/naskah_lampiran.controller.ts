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
import { NaskahLampiranService } from '../services/naskah_lampiran.service';
import { CreateNaskahLampiranDto } from '../dto/naskah_lampiran/create_naskah_lampiran.dto';
import { UpdateNaskahLampiranDto } from '../dto/naskah_lampiran/update_naskah_lampiran.dto';

@Controller('persuratan/naskah-lampiran')
export class NaskahLampiranController {
  constructor(private readonly naskahLampiranService: NaskahLampiranService) {}

  @Post()
  create(@Body() createNaskahLampiranDto: CreateNaskahLampiranDto) {
    return this.naskahLampiranService.create(createNaskahLampiranDto);
  }

  @Get()
  findAll(@Query('id_naskah') id_naskah?: string) {
    return this.naskahLampiranService.findAll(id_naskah);
  }

  @Get('naskah/:id_naskah')
  findByNaskah(@Param('id_naskah') id_naskah: string) {
    return this.naskahLampiranService.findByNaskah(id_naskah);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.naskahLampiranService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateNaskahLampiranDto: UpdateNaskahLampiranDto,
  ) {
    return this.naskahLampiranService.update(id, updateNaskahLampiranDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.naskahLampiranService.remove(id);
  }
}
