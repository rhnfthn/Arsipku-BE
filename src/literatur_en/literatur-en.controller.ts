import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe, HttpException, HttpStatus } from '@nestjs/common';
import { LiteraturEnService } from './literatur-en.service';
import { CreateLiteraturEnDto } from './dto/create-literatur-en.dto';
import { UpdateLiteraturEnDto } from './dto/update-literatur-en.dto';

@Controller('literatur-en')
export class LiteraturEnController {
  constructor(private readonly service: LiteraturEnService) {}

  @Post()
  async create(@Body() dto: CreateLiteraturEnDto) {
    try {
      const created = await this.service.create(dto);
      return { success: true, data: created };
    } catch (err) {
      throw new HttpException({ success: false, message: 'Failed to create literatur', error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get()
  async findAll(@Query('company') company: string, @Query('object_type') object_type: string) {
    const results = await this.service.findAll(company, object_type);
    return { success: true, data: results, total: results.length };
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    const r = await this.service.findOne(id);
    return { success: true, data: r };
  }

  @Put(':id')
  async update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateLiteraturEnDto) {
    try {
      const updated = await this.service.update(id, dto);
      return { success: true, data: updated };
    } catch (err) {
      throw new HttpException({ success: false, message: 'Failed to update literatur', error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.service.remove(id);
    return { success: true };
  }
}
