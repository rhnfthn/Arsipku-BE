import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../common/guards';
import { RequirePermission } from '../../../common/decorators';
import {
  CreateConfigThemeDto,
  SetDefaultThemeDto,
  SetManualThemeDto,
  UpdateConfigThemeDto,
} from '../dto/config-theme.dto';
import { ConfigThemeService } from '../services/config-theme.service';

@Controller('admin/config/theme')
@UseGuards(JwtAuthGuard)
export class AdminConfigThemeController {
  constructor(private readonly configThemeService: ConfigThemeService) {}

  @Get()
  @RequirePermission('konfigurasi', 'read-tema')
  findAll() {
    return this.configThemeService.findAll();
  }

  @Get('default')
  @RequirePermission('konfigurasi', 'read-tema')
  getDefaultStatus() {
    return this.configThemeService.getDefaultStatus();
  }

  @Get('assets')
  @RequirePermission('konfigurasi', 'read-tema')
  listAssets() {
    return this.configThemeService.listAssets();
  }

  @Patch('default')
  @RequirePermission('konfigurasi', 'update')
  setDefault(@Body() dto: SetDefaultThemeDto) {
    return this.configThemeService.setDefault(dto.active);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('konfigurasi', 'update')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  create(
    @Body() dto: CreateConfigThemeDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.configThemeService.create(dto, file);
  }

  @Put(':id')
  @RequirePermission('konfigurasi', 'update')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateConfigThemeDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.configThemeService.update(id, dto, file);
  }

  @Patch(':id/manual')
  @RequirePermission('konfigurasi', 'update')
  setManual(@Param('id') id: string, @Body() dto: SetManualThemeDto) {
    return this.configThemeService.setManual(id, dto.active);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('konfigurasi', 'update')
  async delete(@Param('id') id: string): Promise<void> {
    await this.configThemeService.delete(id);
  }
}
