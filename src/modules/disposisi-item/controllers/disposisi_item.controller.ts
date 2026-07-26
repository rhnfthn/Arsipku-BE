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
import { DisposisiItemService } from '../services/disposisi_item.service';
import { CreateDisposisiItemDto } from '../dto/disposisi_item/create_disposisi_item.dto';
import { UpdateDisposisiItemDto } from '../dto/disposisi_item/update_disposisi_item.dto';
import { RequirePermission } from '../../../common/decorators';

@Controller('persuratan/disposisi-item')
export class DisposisiItemController {
  constructor(private readonly disposisiItemService: DisposisiItemService) {}

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() createDisposisiItemDto: CreateDisposisiItemDto) {
    return this.disposisiItemService.create(createDisposisiItemDto);
  }

  @Get()
  findAll(@Query('company') company?: string) {
    return this.disposisiItemService.findAll(company);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.disposisiItemService.findOne(id);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(
    @Param('id') id: string,
    @Body() updateDisposisiItemDto: UpdateDisposisiItemDto,
  ) {
    return this.disposisiItemService.update(id, updateDisposisiItemDto);
  }

  @Put(':id/toggle-aktif')
  @RequirePermission('master-data', 'update')
  toggleAktif(@Param('id') id: string) {
    return this.disposisiItemService.toggleAktif(id);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.disposisiItemService.remove(id);
  }
}
