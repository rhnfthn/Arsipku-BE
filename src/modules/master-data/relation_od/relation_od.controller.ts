import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { RelationOdService } from './relation_od.service';
import { CreateRelationOdDto } from './dto/create-relation_od.dto';
import { UpdateRelationOdDto } from './dto/update-relation_od.dto';
import { RelationOd } from './entities/relation_od.entity';
import { RequirePermission } from '../../../common/decorators';

@Controller('relation-od')
export class RelationOdController {
  constructor(private readonly relationOdService: RelationOdService) {}

  @Get()
  @RequirePermission('master-data', 'read')
  findAll(): Promise<RelationOd[]> {
    return this.relationOdService.findAll();
  }

  @Get(':id')
  @RequirePermission('master-data', 'read')
  findOne(@Param('id') id: string): Promise<RelationOd> {
    return this.relationOdService.findOne(id);
  }

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() data: CreateRelationOdDto) {
    return this.relationOdService.create(data);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(@Param('id') id: string, @Body() data: UpdateRelationOdDto) {
    return this.relationOdService.update(id, data);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.relationOdService.remove(id);
  }
}
