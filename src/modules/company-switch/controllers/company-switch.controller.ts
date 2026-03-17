import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CompanySwitchService } from '../services/company-switch.service';
import { AuthService } from '../../auth/services/auth.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  SwitchCompanyDto,
  AvailableCompaniesResponseDto,
  SwitchCompanyResponseDto,
} from '../dto/switch-company.dto';

@ApiTags('Company Switch')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('company-switch')
export class CompanySwitchController {
  constructor(
    private readonly companySwitchService: CompanySwitchService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Get all available companies for the current user
   * Returns list of companies where user has active positions
   * 
   * GET /company-switch/available-companies
   */
  @Get('available-companies')
  @ApiOperation({
    summary: 'Get available companies for switch',
    description: 'Returns all companies where the current user has active positions (from om_relation_sp)',
  })
  @ApiResponse({ status: 200, type: AvailableCompaniesResponseDto })
  async getAvailableCompanies(
    @CurrentUser() user: JwtPayload,
  ): Promise<AvailableCompaniesResponseDto> {
    return this.companySwitchService.getAvailableCompanies(
      user.persnum,
      user.company,
    );
  }

  /**
   * Check if user has multiple companies
   * Quick endpoint for UI to show/hide company switcher
   * 
   * GET /company-switch/has-multiple
   */
  @Get('has-multiple')
  @ApiOperation({
    summary: 'Check if user has multiple companies',
    description: 'Quick check for UI to determine if company switcher should be shown',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        hasMultiple: { type: 'boolean' },
      },
    },
  })
  async hasMultipleCompanies(@CurrentUser() user: JwtPayload) {
    const hasMultiple = await this.companySwitchService.hasMultipleCompanies(user.persnum);
    return { hasMultiple };
  }

  /**
   * Get current active company info
   * 
   * GET /company-switch/current
   */
  @Get('current')
  @ApiOperation({
    summary: 'Get current active company',
    description: 'Returns the current active company and position from JWT',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        companyText: { type: 'string' },
        position: { type: 'string' },
        positionText: { type: 'string' },
        organization: { type: 'string' },
        organizationText: { type: 'string' },
        bodTag: { type: 'string' },
      },
    },
  })
  getCurrentCompany(@CurrentUser() user: JwtPayload) {
    return {
      company: user.company,
      companyText: user.companyText,
      position: user.position,
      positionText: user.positionText,
      organization: user.organization,
      organizationText: user.organizationText,
      area: user.area,
      areaText: user.areaText,
      subArea: user.subArea,
      subAreaText: user.subAreaText,
      bodTag: user.bodTag,
    };
  }

  /**
   * Switch to a different company or reset to default
   * 
   * POST /company-switch/switch
   * 
   * Example payload to switch company:
   * { "relationSpId": "uuid-123" }
   * OR
   * { "company": "2000", "position": "60001234" }
   * 
   * Example payload to reset to default:
   * { "resetToDefault": true }
   */
  @Post('switch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Switch to a different company',
    description: 'Generate new JWT with different company/position data, or reset to default company',
  })
  @ApiResponse({ status: 200, type: SwitchCompanyResponseDto })
  async switchCompany(
    @Body() dto: SwitchCompanyDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SwitchCompanyResponseDto> {
    // Get company switch data from service
    const switchData = await this.companySwitchService.getCompanySwitchData(
      user.persnum,
      dto.relationSpId,
      dto.company,
      dto.position,
      dto.resetToDefault,
    );

    // Generate new JWT with auth service
    const result = await this.authService.switchCompany(user, switchData);

    return {
      success: true,
      message: result.message,
      data: {
        accessToken: result.accessToken,
        user: result.user,
        ...(switchData && {
          activeCompany: {
            company: parseInt(switchData.company),
            companyText: switchData.companyText,
            position: parseInt(switchData.position),
            positionText: switchData.positionText,
          },
        }),
      },
    };
  }

  /**
   * Reset to default company (shortcut endpoint)
   * 
   * POST /company-switch/reset
   * 
   * Resets user to their original/default company from om_relation_sp
   * This is a convenience endpoint - equivalent to POST /switch with { resetToDefault: true }
   */
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset to default company',
    description: 'Reset user back to their original/default company and position from om_relation_sp',
  })
  @ApiResponse({ status: 200, type: SwitchCompanyResponseDto })
  async resetToDefault(
    @CurrentUser() user: JwtPayload,
  ): Promise<SwitchCompanyResponseDto> {
    // Get default company data from service (first om_relation_sp record)
    const defaultCompanyData = await this.companySwitchService.getDefaultCompany(user.persnum);
    
    // Generate new JWT with default company data
    const result = await this.authService.switchCompany(user, defaultCompanyData);

    return {
      success: true,
      message: 'Berhasil kembali ke company default',
      data: {
        accessToken: result.accessToken,
        user: result.user,
        ...(defaultCompanyData && {
          activeCompany: {
            company: parseInt(defaultCompanyData.company),
            companyText: defaultCompanyData.companyText,
            position: parseInt(defaultCompanyData.position),
            positionText: defaultCompanyData.positionText,
          },
        }),
      },
    };
  }
}
