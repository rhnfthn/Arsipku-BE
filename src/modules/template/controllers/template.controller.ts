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
} from '@nestjs/common';
import { TemplateService } from '../services/template.service';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { TemplateListResponseDto, TemplateItemResponseDto, TemplateActionResponseDto } from '../dto/template-response.dto';

@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  /**
   * POST /templates
   * Create template dengan konten HTML
   * Body:
   * - id_position: string (required)
   * - nama_template: string (required)
   * - content: string (optional) - HTML content
   */
  @Post()
  async create(@Body() dto: CreateTemplateDto): Promise<TemplateItemResponseDto> {
    try {
      const created = await this.templateService.create(dto);
      const mapped = this.templateService.toDto(created);
      return { success: true, data: mapped };
    } catch (err) {
      throw new HttpException({ success: false, message: err.message }, HttpStatus.BAD_REQUEST);
    }
  }

  @Get()
  async findAll(@Query('nama_template') nama_template?: string): Promise<TemplateListResponseDto> {
    const list = await this.templateService.findAll(nama_template);
    const mapped = this.templateService.toDtoList(list);
    return { success: true, total: mapped.length, data: mapped };
  }

  @Get('position/:id_position')
  async findByPosition(@Param('id_position') id_position: string): Promise<TemplateListResponseDto> {
    const list = await this.templateService.findByPosition(id_position);
    const mapped = this.templateService.toDtoList(list);
    return { success: true, total: mapped.length, data: mapped };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TemplateItemResponseDto> {
    const t = await this.templateService.findOne(id);
    return { success: true, data: this.templateService.toDto(t) };
  }

  /**
   * PUT /templates/:id
   * Update template
   * Body:
   * - id_position: string (optional)
   * - nama_template: string (optional)
   * - content: string (optional) - HTML content
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<TemplateItemResponseDto> {
    const updated = await this.templateService.update(id, dto);
    return { success: true, data: this.templateService.toDto(updated) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<TemplateActionResponseDto> {
    await this.templateService.remove(id);
    return { success: true, message: 'Template removed successfully' };
  }
}
