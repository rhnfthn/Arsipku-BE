import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { RelationOoService } from './relation_oo.service';
import { CreateRelationOoDto } from './dto/create-relation_oo.dto';
import { UpdateRelationOoDto } from './dto/update-relation_oo.dto';
import { RelationOo } from './entities/relation_oo.entity';

@Controller('relation-oo')
export class RelationOoController {
  constructor(private readonly relationOoService: RelationOoService) {}

  @Get()
  findAll(): Promise<RelationOo[]> {
    return this.relationOoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RelationOo> {
    return this.relationOoService.findOne(id);
  }

  @Post()
  create(@Body() data: CreateRelationOoDto) {
    return this.relationOoService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateRelationOoDto) {
    return this.relationOoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.relationOoService.remove(id);
  }
}
