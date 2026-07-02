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
import { TemplateService } from '../services/template.service';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { TemplateListResponseDto, TemplateItemResponseDto, TemplateActionResponseDto } from '../dto/template-response.dto';
import { RequirePermission } from '../../../common/decorators';

@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  /**
   * POST /templates
   * Create template dengan file upload
   * Form-data:
   * - nama_template: string (required)
   * - file: File (optional) - Template file
   */
  @Post()
  @RequirePermission('master-data', 'create')
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
      return { success: true, data: mapped };
    } catch (err) {
      throw new HttpException({ success: false, message: err.message }, HttpStatus.BAD_REQUEST);
    }
  }

  @Get()
  @RequirePermission('master-data', 'read')
  async findAll(@Query('nama_template') nama_template?: string): Promise<TemplateListResponseDto> {
    const list = await this.templateService.findAll(nama_template);
    const mapped = await this.templateService.toDtoList(list);
    return { success: true, total: mapped.length, data: mapped };
  }

  @Get(':id')
  @RequirePermission('master-data', 'read')
  async findOne(@Param('id') id: string): Promise<TemplateItemResponseDto> {
    const t = await this.templateService.findOne(id);
    return { success: true, data: await this.templateService.toDto(t) };
  }

  /**
   * PUT /templates/:id
   * Update template dengan optional file upload
   * Form-data:
   * - nama_template: string (optional)
   * - file: File (optional) - New template file
   */
  @Put(':id')
  @RequirePermission('master-data', 'update')
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

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  async remove(@Param('id') id: string): Promise<TemplateActionResponseDto> {
    await this.templateService.remove(id);
    return { success: true, message: 'Template removed successfully' };
  }
}
