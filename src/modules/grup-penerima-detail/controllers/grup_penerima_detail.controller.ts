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
import { GrupPenerimaDetailService } from '../services/grup_penerima_detail.service';
import { CreateGrupPenerimaDetailDto } from '../dto/grup_penerima_detail/create_grup_penerima_detail.dto';
import { UpdateGrupPenerimaDetailDto } from '../dto/grup_penerima_detail/update_grup_penerima_detail.dto';
import { RequirePermission } from '../../../common/decorators';

@Controller('persuratan/grup-penerima-detail')
export class GrupPenerimaDetailController {
  constructor(private readonly detailService: GrupPenerimaDetailService) {}

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() createDetailDto: CreateGrupPenerimaDetailDto) {
    return this.detailService.create(createDetailDto);
  }

  @Get()
  findAll(@Query('id_grup_penerima') id_grup_penerima?: string) {
    return this.detailService.findAll(id_grup_penerima);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.detailService.findOne(id);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(
    @Param('id') id: string,
    @Body() updateDetailDto: UpdateGrupPenerimaDetailDto,
  ) {
    return this.detailService.update(id, updateDetailDto);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.detailService.remove(id);
  }
}
