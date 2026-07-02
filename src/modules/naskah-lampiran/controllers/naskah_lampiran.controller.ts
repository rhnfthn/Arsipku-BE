import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { NaskahLampiranService } from '../services/naskah_lampiran.service';
import { CreateNaskahLampiranDto } from '../dto/naskah_lampiran/create_naskah_lampiran.dto';
import { UpdateNaskahLampiranDto } from '../dto/naskah_lampiran/update_naskah_lampiran.dto';
import { StorageService } from 'src/modules/storage/services/storage.service';
import { RequirePermission } from '../../../common/decorators';

@Controller('persuratan/naskah-lampiran')
export class NaskahLampiranController {
  constructor(
    private readonly naskahLampiranService: NaskahLampiranService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  @RequirePermission('naskah-dinas', 'create')
  create(@Body() createNaskahLampiranDto: CreateNaskahLampiranDto) {
    return this.naskahLampiranService.create(createNaskahLampiranDto);
  }

  @Get('deltemp')
  @RequirePermission('naskah-dinas', 'delete')
  async findFileTemp() {
    const tempfiles = await this.naskahLampiranService.findFileTemp();
    if (tempfiles.length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Failed to get File Temporary',
          error: 'No Data',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    for (const file of tempfiles) {
      await this.storageService.deleteFile(file.file_name);
      await this.naskahLampiranService.remove(file.id);
    }
    return tempfiles;
  }

  @Get()
  @RequirePermission('naskah-dinas', 'read')
  findAll(@Query('id_naskah') id_naskah?: string) {
    return this.naskahLampiranService.findAll(id_naskah);
  }

  @Get('naskah/:id_naskah')
  @RequirePermission('naskah-dinas', 'read')
  findByNaskah(@Param('id_naskah') id_naskah: string) {
    return this.naskahLampiranService.findByNaskah(id_naskah);
  }

  @Get(':id')
  @RequirePermission('naskah-dinas', 'read-detail')
  findOne(@Param('id') id: string) {
    return this.naskahLampiranService.findOne(id);
  }

  @Put(':id')
  @RequirePermission('naskah-dinas', 'update')
  update(
    @Param('id') id: string,
    @Body() updateNaskahLampiranDto: UpdateNaskahLampiranDto,
  ) {
    return this.naskahLampiranService.update(id, updateNaskahLampiranDto);
  }

  @Delete(':id')
  @RequirePermission('naskah-dinas', 'delete')
  remove(@Param('id') id: string) {
    return this.naskahLampiranService.remove(id);
  }
}
