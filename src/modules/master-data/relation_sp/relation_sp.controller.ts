import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { RelationSpService } from './relation_sp.service';
import { CreateRelationSpDto } from './dto/create-relation_sp.dto';
import { UpdateRelationSpDto } from './dto/update-relation_sp.dto';
import { RelationSp } from './entities/relation_sp.entity';
import { RequirePermission } from '../../../common/decorators';

@Controller('relation-sp')
export class RelationSpController {
  constructor(private readonly relationSpService: RelationSpService) {}

  @Get()
  findAll(): Promise<RelationSp[]> {
    return this.relationSpService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RelationSp> {
    return this.relationSpService.findOne(id);
  }

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() data: CreateRelationSpDto) {
    return this.relationSpService.create(data);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(@Param('id') id: string, @Body() data: UpdateRelationSpDto) {
    return this.relationSpService.update(id, data);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.relationSpService.remove(id);
  }
}
