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

@Controller('relation-osc')
export class RelationOscController {
  constructor(private readonly RelationOscService: RelationOscService) {}

  @Get()
  findAll(): Promise<RelationOsc[]> {
    return this.RelationOscService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RelationOsc> {
    return this.RelationOscService.findOne(id);
  }

  @Post()
  create(@Body() data: CreateRelationOscDto) {
    return this.RelationOscService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateRelationOscDto) {
    return this.RelationOscService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.RelationOscService.remove(id);
  }
}
