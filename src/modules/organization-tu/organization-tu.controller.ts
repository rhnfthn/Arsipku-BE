import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrganizationTuService } from './organization-tu.service';
import {
  CreateOrganizationTuDto,
  UpdateOrganizationTuDto,
  QueryOrganizationTuDto,
} from './dto/organization-tu.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('OrganizationTU')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organization-tu')
export class OrganizationTuController {
  constructor(private readonly service: OrganizationTuService) {}

  @Get()
  @ApiOperation({ summary: 'List semua data organization_tu (paginated)' })
  @RequirePermission('konfigurasi', 'read-unit-tu')
  findAll(@Query() query: QueryOrganizationTuDto) {
    return this.service.findAll(query);
  }

  @Get('check-user/:persnum')
  @ApiOperation({ summary: 'Cek role Unit TU aktif untuk user (persnum)' })
  checkUser(@Param('persnum') persnum: string) {
    return this.service.checkUser(parseInt(persnum, 10));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail satu data organization_tu' })
  @RequirePermission('konfigurasi', 'read-unit-tu')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Buat data organization_tu baru' })
  @RequirePermission('konfigurasi', 'create')
  create(
    @Body() dto: CreateOrganizationTuDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.service.create(dto, user?.persnum);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update data organization_tu' })
  @RequirePermission('konfigurasi', 'update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationTuDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.service.update(id, dto, user?.persnum);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus data organization_tu' })
  @RequirePermission('konfigurasi', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
