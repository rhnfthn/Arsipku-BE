import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { DelegasiService } from '../services/delegasi.service';
import { CreateDelegasiDto } from '../dto/create-delegasi.dto';
import { UpdateDelegasiDto } from '../dto/update-delegasi.dto';
import { QueryDelegasiDto } from '../dto/query-delegasi.dto';
import { SwitchRoleDto } from '../dto/switch-role.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PositionService } from '../../master-data/position/position.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { AuthService } from '../../auth/services/auth.service';
import { DataSource } from 'typeorm';

@ApiTags('Delegasi')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('delegasi')
export class DelegasiController {
  constructor(
    private readonly delegasiService: DelegasiService,
    private readonly positionService: PositionService,
    private readonly orgDataService: OrgDataService,
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get all delegasi with filtering, sorting, and pagination
   * GET /delegasi
   */
  @Get()
  @ApiOperation({ summary: 'Get all delegasi with filtering and pagination' })
  findAll(@Query() query: QueryDelegasiDto) {
    return this.delegasiService.findAll(query);
  }

  /**
   * Get available position statuses for delegation dropdown
   * GET /delegasi/position-statuses
   */
  @Get('position-statuses')
  @ApiOperation({ summary: 'Get available position statuses for delegation' })
  getPositionStatuses() {
    return this.delegasiService.getPositionStatuses();
  }

  /**
   * Get list of personil (people with positions) for delegation dropdown
   * GET /delegasi/personil
   * Data diambil dari organization_build.position_json (org_data)
   * Menampilkan daftar orang beserta jabatan mereka saat ini
   * 
   * Filter berdasarkan role:
   * - superadmin: filter by area dari user yang login
   * - admin: filter by sub_area dari user yang login
   * - user: filter by sub_area dari user yang login
   */
  @Get('personil')
  @ApiOperation({ summary: 'Get list of personil for delegation' })
  async getPersonil(
    @Query('company') company?: string, 
    @Query('search') search?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();

      if (!latestOrgData || !latestOrgData.position_json) {
        return {
          success: true,
          data: [],
          message: 'Data org_data tidak tersedia',
        };
      }

      const positionJsonData = latestOrgData.position_json as any[];
      
      // Filter hanya posisi yang memiliki persnum_person (ada orang yang menjabat)
      let personilList = positionJsonData
        .filter(pos => pos.persnum_person && pos.persnum_person_text)
        .map(pos => ({
          persnum: String(pos.persnum_person),
          name: pos.persnum_person_text,
          // Jabatan saat ini untuk display
          currentPosition: pos.position,
          currentPositionText: pos.position_text,
          organization: pos.organization_id,
          organizationText: pos.organization_text,
          area: pos.area,
          areaText: pos.area_text,
          subArea: pos.sub_area,
          subAreaText: pos.sub_area_text,
          company: pos.company,
          companyText: pos.company_name,
          // Display text: Nama - Jabatan
          displayText: `${pos.persnum_person_text} - ${pos.position_text}`,
        }));

      // Filter by company if specified
      if (company) {
        personilList = personilList.filter(p => String(p.company) === String(company));
      }

      // Filter berdasarkan role user yang login
      if (user) {
        if (user.role === 'superadmin') {
          // Superadmin: filter by area dari user yang login
          if (user.area) {
            personilList = personilList.filter(p => String(p.area) === String(user.area));
          }
        } else {
          // Admin & User: filter by sub_area dari user yang login
          if (user.subArea) {
            personilList = personilList.filter(p => String(p.subArea) === String(user.subArea));
          }
        }
      }

      // Filter by search (name or position)
      if (search) {
        const searchLower = search.toLowerCase();
        personilList = personilList.filter(p => 
          p.name.toLowerCase().includes(searchLower) ||
          p.currentPositionText?.toLowerCase().includes(searchLower)
        );
      }

      // Remove duplicates by persnum (satu orang bisa punya beberapa jabatan)
      const uniquePersonil = personilList.reduce((acc, curr) => {
        const existing = acc.find(p => p.persnum === curr.persnum);
        if (!existing) {
          acc.push(curr);
        }
        return acc;
      }, [] as typeof personilList);

      // Sort by name
      uniquePersonil.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      return {
        success: true,
        data: uniquePersonil,
        total: uniquePersonil.length,
        filterApplied: {
          role: user?.role,
          area: user?.role === 'superadmin' ? user?.area : undefined,
          subArea: user?.role !== 'superadmin' ? user?.subArea : undefined,
        },
      };
    } catch (error) {
      console.warn('Error getting personil from org_data:', error.message);
      return {
        success: true,
        data: [],
        message: 'Gagal mengambil data personil',
      };
    }
  }

  /**
   * Get list of jabatan (positions) for delegation dropdown
   * GET /delegasi/jabatan
   * Data diambil dari organization_build.position_json (org_data)
   * position_json berisi flat array dengan complete data (area, organization, dll)
   * 
   * Filter berdasarkan role:
   * - superadmin: filter by area dari user yang login
   * - admin: filter by sub_area dari user yang login
   * - user: filter by sub_area dari user yang login
   */
  @Get('jabatan')
  @ApiOperation({ summary: 'Get list of jabatan for delegation with area info' })
  async getJabatan(
    @Query('company') company?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    try {
      // Get latest org data from organization_build table
      const latestOrgData = await this.orgDataService.findLatestOrg();

      if (!latestOrgData || !latestOrgData.position_json) {
        // Fallback ke query database langsung
        const positions = await this.positionService.findAll();
        return {
          success: true,
          data: positions.map(pos => ({
            id: String(pos.position),
            position: pos.position,
            shortText: pos.shortText,
            longText: pos.longText,
            abbreviation: pos.abbreviation,
            company: pos.company,
            displayText: pos.longText,
          })),
        };
      }

      // position_json is a flat array with complete position data
      const positionJsonData = latestOrgData.position_json as any[];
      let positionsList = positionJsonData.map(pos => ({
        id: String(pos.position),
        position: pos.position,
        shortText: pos.position_text,
        longText: pos.position_text,
        abbreviation: pos.position_abbreviation || '-',
        company: pos.company,
        companyText: pos.company_name,
        organization: pos.organization_id,
        organizationText: pos.organization_text,
        area: pos.area,
        areaText: pos.area_text,
        subArea: pos.sub_area,
        subAreaText: pos.sub_area_text,
        bodTag: pos.bod_tag,
        isChief: pos.chief === 1,
        persnum: pos.persnum_person,
        persnumText: pos.persnum_person_text,
        divisiId: pos.divisi_id,
        divisiName: pos.divisi_name,
        direktoratId: pos.direktorat_id,
        direktoratName: pos.direktorat_name,
        // Display text dengan sub_area sebagai pembeda
        displayText: pos.sub_area_text 
          ? `${pos.position_text} - ${pos.sub_area_text}`
          : pos.position_text,
      }));

      // Filter by company if specified
      if (company) {
        positionsList = positionsList.filter(pos => String(pos.company) === String(company));
      }

      // Filter berdasarkan role user yang login
      if (user) {
        if (user.role === 'superadmin') {
          // Superadmin: filter by area dari user yang login
          if (user.area) {
            positionsList = positionsList.filter(pos => String(pos.area) === String(user.area));
          }
        } else {
          // Admin & User: filter by sub_area dari user yang login
          if (user.subArea) {
            positionsList = positionsList.filter(pos => String(pos.subArea) === String(user.subArea));
          }
        }
      }

      // Sort by longText
      positionsList.sort((a, b) => (a.longText || '').localeCompare(b.longText || ''));

      return {
        success: true,
        data: positionsList,
        total: positionsList.length,
        filterApplied: {
          role: user?.role,
          area: user?.role === 'superadmin' ? user?.area : undefined,
          subArea: user?.role !== 'superadmin' ? user?.subArea : undefined,
        },
      };
    } catch (error) {
      // Fallback ke simple position list jika error
      console.warn('Error getting jabatan from org_data:', error.message);
      const positions = await this.positionService.findAll();
      return {
        success: true,
        data: positions.map(pos => ({
          id: String(pos.position),
          position: pos.position,
          shortText: pos.shortText,
          longText: pos.longText,
          abbreviation: pos.abbreviation,
          company: pos.company,
          displayText: pos.longText,
        })),
      };
    }
  }

  /**
   * Get delegation statistics
   * GET /delegasi/statistics
   */
  @Get('statistics')
  @ApiOperation({ summary: 'Get delegation statistics' })
  getStatistics(@Query('company') company?: string) {
    return this.delegasiService.getStatistics(company);
  }

  /**
   * Get active delegations for a person (as delegator)
   * GET /delegasi/by-persnum/:persnum
   */
  @Get('by-persnum/:persnum')
  @ApiOperation({ summary: 'Get active delegations by persnum (as delegator)' })
  findActiveByPersnum(@Param('persnum') persnum: string) {
    return this.delegasiService.findActiveByPersnum(persnum);
  }

  /**
   * Get available roles for user profile switch
   * Returns all active delegations where current user RECEIVES delegation
   * Used for profile dropdown to switch between roles
   * GET /delegasi/available-roles
   */
  @Get('available-roles')
  @ApiOperation({ summary: 'Get available roles for profile switch' })
  getAvailableRoles(@CurrentUser() user: JwtPayload) {
    return this.delegasiService.getAvailableRoles(String(user.persnum));
  }

  /**
   * Switch role to a delegated position or reset to original role
   * POST /delegasi/switch-role
   * 
   * Example payload to switch to delegated role:
   * { "delegasiId": "uuid-123" }
   * 
   * Example payload to reset to original role:
   * { "resetToOriginal": true }
   */
  @Post('switch-role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Switch role to delegated position or reset to original',
    description: 'Generate new JWT with delegated position data or reset to original role (YBS)',
  })
  async switchRole(
    @Body() dto: SwitchRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // Get delegation info from delegasi service
    const delegasi = await this.delegasiService.getDelegationForRoleSwitch(
      String(user.persnum),
      dto.delegasiId,
      dto.position,
      dto.positionStatus,
      dto.resetToOriginal,
    );

    // Generate new JWT with auth service
    const result = await this.authService.switchRole(user, delegasi);

    return {
      success: true,
      message: result.message,
      data: {
        accessToken: result.accessToken,
        user: result.user,
        ...(delegasi && {
          activeDelegation: {
            id: delegasi.id,
            position: delegasi.as_position,
            position_text: delegasi.as_position_text,
            position_status: delegasi.position_status,
            delegator_name: delegasi.name,
            delegator_position_text: delegasi.position_text,
          },
        }),
      },
    };
  }

  /**
   * Get active delegations for a position
   * GET /delegasi/by-position/:position
   */
  @Get('by-position/:position')
  @ApiOperation({ summary: 'Get active delegations by position' })
  findActiveByAsPosition(@Param('position') position: string) {
    return this.delegasiService.findActiveByAsPosition(position);
  }

  /**
   * Check if a person has active delegation for a position
   * GET /delegasi/check/:persnum/:position
   */
  @Get('check/:persnum/:position')
  @ApiOperation({ summary: 'Check if person has active delegation' })
  async checkActiveDelegation(
    @Param('persnum') persnum: string,
    @Param('position') position: string,
  ) {
    const hasActive = await this.delegasiService.hasActiveDelegation(persnum, position);
    return { hasActiveDelegation: hasActive };
  }

  /**
   * Get single delegasi by ID
   * GET /delegasi/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get delegasi by ID' })
  findOne(@Param('id') id: string) {
    return this.delegasiService.findOne(id);
  }

  /**
   * Create new delegasi
   * POST /delegasi
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new delegasi' })
  create(@Body() createDelegasiDto: CreateDelegasiDto, @CurrentUser() user: JwtPayload) {
    return this.delegasiService.create(createDelegasiDto, user);
  }

  /**
   * Update delegasi
   * PUT /delegasi/:id
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update delegasi' })
  update(@Param('id') id: string, @Body() updateDelegasiDto: UpdateDelegasiDto, @CurrentUser() user: JwtPayload) {
    return this.delegasiService.update(id, updateDelegasiDto);
  }

  /**
   * Delete delegasi
   * DELETE /delegasi/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete delegasi' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.delegasiService.remove(id);
  }
}
