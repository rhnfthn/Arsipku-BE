import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { AreaService } from './area.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { OmArea } from './entities/om-area.entity';

@Controller('area')
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @Get()
  findAll(): Promise<OmArea[]> {
    return this.areaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OmArea> {
    return this.areaService.findOne(id);
  }

  @Post()
  create(@Body() data: CreateAreaDto) {
    return this.areaService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateAreaDto) {
    return this.areaService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.areaService.remove(id);
  }
}
