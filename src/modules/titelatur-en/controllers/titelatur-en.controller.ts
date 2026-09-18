import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpException,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { TitelaturEnService } from '../services/titelatur-en.service';
import { CreateTitelaturEnDto } from '../dto/create-titelatur-en.dto';
import { UpdateTitelaturEnDto } from '../dto/update-titelatur-en.dto';
import { RequirePermission } from '../../../common/decorators';

@Controller('titelatur-en')
export class TitelaturEnController {
  constructor(private readonly service: TitelaturEnService) {}

  @Post()
  @RequirePermission('titelatur', 'create')
  async create(@Body() dto: CreateTitelaturEnDto) {
    try {
      const created = await this.service.create(dto);
      return { success: true, data: created };
    } catch (err) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to create titelatur',
          error: err.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  @RequirePermission('titelatur', 'read')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  async findAll(
    @Query('company') company: string,
    @Query('object_type') object_type: string,
  ) {
    const results = await this.service.findAll(company, object_type);
    return { success: true, data: results, total: results.length };
  }

  @Get(':id')
  @RequirePermission('titelatur', 'read')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    const r = await this.service.findOne(id);
    return { success: true, data: r };
  }

  @Put(':id')
  @RequirePermission('titelatur', 'update')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateTitelaturEnDto,
  ) {
    try {
      const updated = await this.service.update(id, dto);
      return { success: true, data: updated };
    } catch (err) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to update titelatur',
          error: err.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @RequirePermission('titelatur', 'delete')
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.service.remove(id);
    return { success: true };
  }
}
