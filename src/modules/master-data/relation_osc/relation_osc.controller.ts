import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { RelationOscService } from './relation_osc.service';
import { CreateRelationOscDto } from './dto/create-relation_osc.dto';
import { UpdateRelationOscDto } from './dto/update-relation_osc.dto';
import { RelationOsc } from './entities/relation_osc.entity';
import { RequirePermission } from '../../../common/decorators';

@Controller('relation-osc')
export class RelationOscController {
  constructor(private readonly RelationOscService: RelationOscService) {}

  @Get()
  @RequirePermission('master-data', 'read')
  findAll(): Promise<RelationOsc[]> {
    return this.RelationOscService.findAll();
  }

  @Get(':id')
  @RequirePermission('master-data', 'read')
  findOne(@Param('id') id: string): Promise<RelationOsc> {
    return this.RelationOscService.findOne(id);
  }

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() data: CreateRelationOscDto) {
    return this.RelationOscService.create(data);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(@Param('id') id: string, @Body() data: UpdateRelationOscDto) {
    return this.RelationOscService.update(id, data);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.RelationOscService.remove(id);
  }
}
