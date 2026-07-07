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
import { RequirePermission } from '../../../common/decorators';

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
  @RequirePermission('master-data', 'create')
  create(@Body() data: CreateRelationODto) {
    return this.res.create(data);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(@Param('id') id: string, @Body() data: UpdateRelationODto) {
    return this.res.update(id, data);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.res.remove(id);
  }
}
