import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { RelationOsService } from './relation_os.service';
import { CreateRelationODto } from './dto/create-relation_o.dto';
import { UpdateRelationODto } from './dto/update-relation_o.dto';
import { RelationOs } from './entities/relation_os.entity';

@Controller('relation-os')
export class RelationOsController {
  constructor(private readonly res: RelationOsService) {}

  @Get()
  findAll(): Promise<RelationOs[]> {
    return this.res.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RelationOs> {
    return this.res.findOne(id);
  }

  @Post()
  create(@Body() data: CreateRelationODto) {
    return this.res.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateRelationODto) {
    return this.res.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.res.remove(id);
  }
}
