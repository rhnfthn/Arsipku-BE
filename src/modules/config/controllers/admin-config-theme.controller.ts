import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../../../common/decorators';
import { RoleName } from '../../../common/enums/role-name.enum';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  ConfigThemeService,
  ThemeBackgroundTarget,
} from '../services/config-theme.service';

@Controller('admin/config/theme')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPERADMIN)
export class AdminConfigThemeController {
  private readonly allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

  constructor(private readonly configThemeService: ConfigThemeService) {}

  @Get()
  getConfig() {
    return this.configThemeService.getAdminConfig();
  }

  @Put('background/:target')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  updateBackground(
    @Param('target') rawTarget: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    const target = this.parseTarget(rawTarget);
    if (!file) throw new BadRequestException('Gambar belum dipilih.');
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Format gambar harus JPG, PNG, atau WEBP.');
    }

    return this.configThemeService.replaceBackground(target, file, user.persnum);
  }

  @Delete('background/:target')
  resetBackground(
    @Param('target') rawTarget: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.configThemeService.resetBackground(
      this.parseTarget(rawTarget),
      user.persnum,
    );
  }

  @Post('templates/:id/activate')
  activateTemplate(
    @Param('id') templateId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.configThemeService.activateTemplate(templateId, user.persnum);
  }

  private parseTarget(target: string): ThemeBackgroundTarget {
    if (target !== 'landing' && target !== 'dashboard') {
      throw new BadRequestException('Target tema tidak valid.');
    }
    return target;
  }
}
