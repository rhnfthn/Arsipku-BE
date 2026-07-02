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
import { RequirePermission } from '../../../common/decorators';

@Controller('relation-oo')
export class RelationOoController {
  constructor(private readonly relationOoService: RelationOoService) {}

  @Get()
  @RequirePermission('master-data', 'read')
  findAll(): Promise<RelationOo[]> {
    return this.relationOoService.findAll();
  }

  @Get(':id')
  @RequirePermission('master-data', 'read')
  findOne(@Param('id') id: string): Promise<RelationOo> {
    return this.relationOoService.findOne(id);
  }

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() data: CreateRelationOoDto) {
    return this.relationOoService.create(data);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(@Param('id') id: string, @Body() data: UpdateRelationOoDto) {
    return this.relationOoService.update(id, data);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.relationOoService.remove(id);
  }
}
