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
import { TemplateSuratService } from '../services/template-surat.service';
import { CreateTemplateSuratDto } from '../dto/create-template-surat.dto';
import { UpdateTemplateSuratDto } from '../dto/update-template-surat.dto';
import { TemplateSuratListResponseDto, TemplateSuratItemResponseDto, TemplateSuratActionResponseDto } from '../dto/template-surat-response.dto';

@Controller('persuratan/template')
export class TemplateSuratController {
  constructor(private readonly templateSuratService: TemplateSuratService) {}

  /**
   * POST /persuratan/template
   * Create template surat dengan konten HTML
   * Body:
   * - id_position: string (required)
   * - nama_template: string (required)
   * - content: string (optional) - HTML content
   */
  @Post()
  async create(@Body() dto: CreateTemplateSuratDto): Promise<TemplateSuratItemResponseDto> {
    try {
      const created = await this.templateSuratService.create(dto);
      const mapped = this.templateSuratService.toDto(created);
      return { success: true, data: mapped };
    } catch (err) {
      throw new HttpException({ success: false, message: err.message }, HttpStatus.BAD_REQUEST);
    }
  }

  @Get()
  async findAll(@Query('nama_template') nama_template?: string): Promise<TemplateSuratListResponseDto> {
    const list = await this.templateSuratService.findAll(nama_template);
    const mapped = this.templateSuratService.toDtoList(list);
    return { success: true, total: mapped.length, data: mapped };
  }

  @Get('global')
  async findGlobal(): Promise<TemplateSuratListResponseDto> {
    const list = await this.templateSuratService.findGlobal();
    const mapped = this.templateSuratService.toDtoList(list);
    return { success: true, total: mapped.length, data: mapped };
  }

  @Get('position/:id_position')
  async findByPosition(@Param('id_position') id_position: string): Promise<TemplateSuratListResponseDto> {
    const list = await this.templateSuratService.findByPosition(id_position);
    const mapped = this.templateSuratService.toDtoList(list);
    return { success: true, total: mapped.length, data: mapped };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TemplateSuratItemResponseDto> {
    const t = await this.templateSuratService.findOne(id);
    return { success: true, data: this.templateSuratService.toDto(t) };
  }

  /**
   * PUT /persuratan/template/:id
   * Update template surat
   * Body:
   * - id_position: string (optional)
   * - nama_template: string (optional)
   * - content: string (optional) - HTML content
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateSuratDto,
  ): Promise<TemplateSuratItemResponseDto> {
    const updated = await this.templateSuratService.update(id, dto);
    return { success: true, data: this.templateSuratService.toDto(updated) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<TemplateSuratActionResponseDto> {
    await this.templateSuratService.remove(id);
    return { success: true, message: 'Template Surat removed successfully' };
  }
}
