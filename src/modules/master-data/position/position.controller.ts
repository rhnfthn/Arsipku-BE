import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { PositionService } from './position.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { OmPosition } from './entities/om-position.entity';

@Controller('position')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Get()
  findAll(): Promise<OmPosition[]> {
    return this.positionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OmPosition> {
    return this.positionService.findOne(id);
  }

  @Post()
  create(@Body() data: CreatePositionDto) {
    return this.positionService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdatePositionDto) {
    return this.positionService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.positionService.remove(id);
  }
}
