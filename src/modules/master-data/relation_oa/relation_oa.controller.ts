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
import { RequirePermission } from '../../../common/decorators';

@Controller('relation-oa')
export class RelationOaController {
  constructor(private readonly relationOaService: RelationOaService) {}

  @Get()
  @RequirePermission('master-data', 'read')
  findAll(): Promise<RelationOa[]> {
    return this.relationOaService.findAll();
  }

  @Get(':id')
  @RequirePermission('master-data', 'read')
  findOne(@Param('id') id: string): Promise<RelationOa> {
    return this.relationOaService.findOne(id);
  }

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() data: CreateRelationOaDto) {
    return this.relationOaService.create(data);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(@Param('id') id: string, @Body() data: UpdateRelationOaDto) {
    return this.relationOaService.update(id, data);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.relationOaService.remove(id);
  }
}
