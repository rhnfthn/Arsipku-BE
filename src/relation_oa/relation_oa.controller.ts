import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { RelationOaService } from './relation_oa.service';
import { CreateRelationOaDto } from './dto/create-relation_oa.dto';
import { UpdateRelationOaDto } from './dto/update-relation_oa.dto';
import { RelationOa } from './entities/relation_oa.entity';

@Controller('relation-oa')
export class RelationOaController {
  constructor(private readonly relationOaService: RelationOaService) {}

  @Get()
  findAll(): Promise<RelationOa[]> {
    return this.relationOaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RelationOa> {
    return this.relationOaService.findOne(id);
  }

  @Post()
  create(@Body() data: CreateRelationOaDto) {
    return this.relationOaService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateRelationOaDto) {
    return this.relationOaService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.relationOaService.remove(id);
  }
}
