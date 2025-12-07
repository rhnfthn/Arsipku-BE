import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { AreasubService } from './areasub.service';
import { CreateAreasubDto } from './dto/create-areasub.dto';
import { UpdateAreasubDto } from './dto/update-areasub.dto';
import { OmAreaSub } from './entities/om-areasub.entity';

@Controller('areasub')
export class AreasubController {
  constructor(private readonly cService: AreasubService) {}

  @Get()
  findAll(): Promise<OmAreaSub[]> {
    return this.cService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OmAreaSub> {
    return this.cService.findOne(id);
  }

  @Post()
  create(@Body() data: CreateAreasubDto) {
    return this.cService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateAreasubDto) {
    return this.cService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cService.remove(id);
  }
}
