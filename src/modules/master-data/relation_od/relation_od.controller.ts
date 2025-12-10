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

@Controller('relation-od')
export class RelationOdController {
  constructor(private readonly relationOdService: RelationOdService) {}

  @Get()
  findAll(): Promise<RelationOd[]> {
    return this.relationOdService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RelationOd> {
    return this.relationOdService.findOne(id);
  }

  @Post()
  create(@Body() data: CreateRelationOdDto) {
    return this.relationOdService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateRelationOdDto) {
    return this.relationOdService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.relationOdService.remove(id);
  }
}
