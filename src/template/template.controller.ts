import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  Query,
  HttpStatus,
  HttpException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TemplateService } from './template.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplateListResponseDto, TemplateItemResponseDto, TemplateActionResponseDto } from './dto/template-response.dto';

@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  /**
   * POST /templates
   * Create template dengan file upload
   * Form-data:
   * - nama_template: string (required)
   * - tanggal: string (optional, format YYYY-MM-DD)
   * - file: File (required) - Template file
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
    }),
  )
  async create(
    @Body() dto: CreateTemplateDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<TemplateItemResponseDto> {
    try {
      const created = await this.templateService.create(dto, file);
      const mapped = await this.templateService.toDto(created);
      return { success: true, data: mapped } as TemplateItemResponseDto;
    } catch (err) {
      throw new HttpException({ success: false, message: err.message }, HttpStatus.BAD_REQUEST);
    }
  }

  @Get()
  async findAll(@Query('nama_template') nama_template?: string): Promise<TemplateListResponseDto> {
    const list = await this.templateService.findAll(nama_template);
    const mapped = await this.templateService.toDtoList(list);
    return { success: true, total: mapped.length, data: mapped };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TemplateItemResponseDto> {
    const t = await this.templateService.findOne(id);
    return { success: true, data: await this.templateService.toDto(t) };
  }

  /**
   * PUT /templates/:id
   * Update template dengan optional file upload
   * Form-data:
   * - nama_template: string (optional)
   * - tanggal: string (optional, format YYYY-MM-DD)
   * - file: File (optional) - New template file
   */
  @Put(':id')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<TemplateItemResponseDto> {
    const updated = await this.templateService.update(id, dto, file);
    return { success: true, data: await this.templateService.toDto(updated) };
  }

  // Note: toggleAktif removed because the `template` table has no `aktif` column.

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<TemplateActionResponseDto> {
    await this.templateService.remove(id);
    return { success: true, message: 'Template removed successfully' };
  }
}
