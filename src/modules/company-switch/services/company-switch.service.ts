import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RelationSp } from '../../master-data/relation_sp/entities/relation_sp.entity';
import { OmCompany } from '../../master-data/company/entities/om-company.entity';
import { OmPosition } from '../../master-data/position/entities/om-position.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { AvailableCompanyDto } from '../dto/switch-company.dto';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Interface for company switch data
 * Used to pass data to AuthService.switchCompany()
 */
export interface CompanySwitchData {
  company: string;
  companyText: string;
  position: string;
  positionText: string;
  organization: string;
  organizationText: string;
  area: string;
  areaText: string;
  subArea: string;
  subAreaText: string;
  bodTag?: string;
  abbreviation?: string;
}

@Injectable()
export class CompanySwitchService {
  constructor(
    @InjectRepository(RelationSp)
    private readonly relationSpRepo: Repository<RelationSp>,
    @InjectRepository(OmCompany)
    private readonly companyRepo: Repository<OmCompany>,
    @InjectRepository(OmPosition)
    private readonly positionRepo: Repository<OmPosition>,
    private readonly orgDataService: OrgDataService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get all available companies for a user
   * Queries om_relation_sp to find all active positions across companies for a persnum
   *
   * @param persnum - User's persnum
   * @param currentCompany - Current active company from JWT
   * @returns List of available companies with position info
   */
  async getAvailableCompanies(
    persnum: number,
    currentCompany: string,
  ): Promise<{
    success: boolean;
    companies: AvailableCompanyDto[];
    currentCompany: {
      company: string;
      companyText: string;
      position: string;
      positionText: string;
      bodTag: string;
    };
    total: number;
  }> {
    // Get today's date in local timezone (Asia/Jakarta = UTC+7)
    const now = new Date();
    const localDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = localDate.toISOString().split('T')[0];

    console.log(
      '[CompanySwitchService] Getting available companies for persnum:',
      persnum,
    );
    console.log('[CompanySwitchService] Current company:', currentCompany);
    console.log('[CompanySwitchService] Today:', todayStr);

    // Query om_relation_sp for all active positions of this person
    const relationSpRecords = await this.relationSpRepo
      .createQueryBuilder('sp')
      .where('sp.relation_persnum = :persnum', { persnum })
      .andWhere('sp.startDate <= :today', { today: todayStr })
      .andWhere('sp.endDate >= :today', { today: todayStr })
      .orderBy('sp.company', 'ASC')
      .addOrderBy('sp.position_text', 'ASC')
      .getMany();

    console.log(
      '[CompanySwitchService] Found relation_sp records:',
      relationSpRecords.length,
    );

    if (relationSpRecords.length === 0) {
      return {
        success: true,
        companies: [],
        currentCompany: {
          company: currentCompany,
          companyText: '',
          position: '',
          positionText: '',
          bodTag: '',
        },
        total: 0,
      };
    }

    // Get company details
    const companyIds = [...new Set(relationSpRecords.map((r) => r.company))];
    const companies = await this.companyRepo
      .createQueryBuilder('c')
      .where('c.company IN (:...companyIds)', { companyIds })
      .getMany();

    console.log('[CompanySwitchService] Found companies:', companies.length);

    const companyMap = new Map(companies.map((c) => [c.company, c]));

    // Get position details with organization data from org_data
    const positionDataMap = new Map<number, any>();

    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (latestOrgData?.position_json) {
        const positionJson = latestOrgData.position_json as any[];
        for (const pos of positionJson) {
          positionDataMap.set(pos.position, pos);
        }
      }
    } catch (error) {
      console.warn(
        '[CompanySwitchService] Could not load org_data:',
        error.message,
      );
    }

    // Build available companies list
    const availableCompanies: AvailableCompanyDto[] = relationSpRecords.map(
      (sp) => {
        const companyInfo = companyMap.get(sp.company);
        const positionInfo = sp.position
          ? positionDataMap.get(sp.position)
          : null;

        return {
          relationSpId: sp.id,
          company: sp.company || 0,
          companyText:
            companyInfo?.longText ||
            companyInfo?.shortText ||
            `Company ${sp.company}`,
          position: sp.position || 0,
          positionText:
            sp.position_text ||
            positionInfo?.position_text ||
            `Position ${sp.position}`,
          organization: positionInfo?.organization_id?.toString() || '',
          organizationText: positionInfo?.organization_text || '',
          area: positionInfo?.area || '',
          areaText: positionInfo?.area_text || '',
          subArea: positionInfo?.sub_area?.toString() || '',
          subAreaText: positionInfo?.sub_area_text || '',
          bodTag: positionInfo?.bod_tag || '',
          startDate: sp.startDate || '',
          endDate: sp.endDate || '',
          isCurrentCompany: String(sp.company) === String(currentCompany),
          isDefaultCompany: sp === relationSpRecords[0], // First one is considered default
        };
      },
    );

    // Find current company info
    const currentCompanyInfo =
      availableCompanies.find((c) => c.isCurrentCompany) ||
      availableCompanies[0];

    return {
      success: true,
      companies: availableCompanies,
      currentCompany: {
        company: String(currentCompanyInfo?.company || currentCompany),
        companyText: currentCompanyInfo?.companyText || '',
        position: String(currentCompanyInfo?.position || ''),
        positionText: currentCompanyInfo?.positionText || '',
        bodTag: currentCompanyInfo?.bodTag || '',
      },
      total: availableCompanies.length,
    };
  }

  /**
   * Get company switch data for JWT generation
   * Validates the switch request and returns complete position data
   *
   * @param persnum - User's persnum
   * @param relationSpId - ID of om_relation_sp record (optional)
   * @param company - Company ID to switch to (optional)
   * @param position - Position ID to switch to (optional)
   * @param resetToDefault - Reset to default company
   * @returns CompanySwitchData for JWT generation
   */
  async getCompanySwitchData(
    persnum: number,
    relationSpId?: string,
    company?: string,
    position?: string,
    resetToDefault = false,
  ): Promise<CompanySwitchData | null> {
    // If reset to default, get first om_relation_sp record
    if (resetToDefault) {
      return this.getDefaultCompany(persnum);
    }

    // Validate input
    if (!relationSpId && !company && !position) {
      throw new BadRequestException(
        'Harus menyediakan relationSpId atau company/position untuk switch company',
      );
    }

    // Get today's date in local timezone
    const now = new Date();
    const localDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = localDate.toISOString().split('T')[0];

    let relationSp: RelationSp | null = null;

    if (relationSpId) {
      // Find by relationSpId
      relationSp = await this.relationSpRepo
        .createQueryBuilder('sp')
        .where('sp.id = :id', { id: relationSpId })
        .andWhere('sp.relation_persnum = :persnum', { persnum })
        .andWhere('sp.startDate <= :today', { today: todayStr })
        .andWhere('sp.endDate >= :today', { today: todayStr })
        .getOne();

      if (!relationSp) {
        throw new NotFoundException(
          'Data posisi tidak ditemukan atau tidak aktif untuk user ini',
        );
      }
    } else {
      // Find by company and/or position
      const qb = this.relationSpRepo
        .createQueryBuilder('sp')
        .where('sp.relation_persnum = :persnum', { persnum })
        .andWhere('sp.startDate <= :today', { today: todayStr })
        .andWhere('sp.endDate >= :today', { today: todayStr });

      if (company) {
        qb.andWhere('sp.company = :company', { company: parseInt(company) });
      }

      if (position) {
        qb.andWhere('sp.position = :position', {
          position: parseInt(position),
        });
      }

      relationSp = await qb.getOne();

      if (!relationSp) {
        throw new NotFoundException(
          'Data posisi tidak ditemukan atau tidak aktif untuk company/position ini',
        );
      }
    }

    // Get company info
    const companyInfo = await this.companyRepo
      .createQueryBuilder('c')
      .where('c.company = :company', { company: relationSp.company })
      .getOne();

    console.log(
      '[CompanySwitchService] Company info:',
      companyInfo ? 'found' : 'not found',
    );

    // Get complete position data from org_data
    let positionData: any = null;
    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (latestOrgData?.position_json) {
        const positionJson = latestOrgData.position_json as any[];
        positionData = positionJson.find(
          (p) =>
            p.position === relationSp.position &&
            p.company === relationSp.company,
        );

        // If not found with company filter, try without
        if (!positionData) {
          positionData = positionJson.find(
            (p) => p.position === relationSp.position,
          );
        }
      }
    } catch (error) {
      console.warn(
        '[CompanySwitchService] Could not load position from org_data:',
        error.message,
      );
    }

    // Build switch data
    const switchData: CompanySwitchData = {
      company: String(relationSp.company),
      companyText:
        companyInfo?.longText ||
        companyInfo?.shortText ||
        `Company ${relationSp.company}`,
      position: String(relationSp.position),
      positionText:
        relationSp.position_text ||
        positionData?.position_text ||
        `Position ${relationSp.position}`,
      organization: positionData?.organization_id?.toString() || '',
      organizationText: positionData?.organization_text || '',
      area: positionData?.area || '',
      areaText: positionData?.area_text || '',
      subArea: positionData?.sub_area?.toString() || '',
      subAreaText: positionData?.sub_area_text || '',
      bodTag: positionData?.bod_tag || '',
      abbreviation: positionData?.position_abbreviation || '',
    };

    console.log('[CompanySwitchService] Switch data prepared:', switchData);

    return switchData;
  }

  /**
   * Check if user has multiple companies
   * Quick check for UI to show/hide company switcher
   */
  async hasMultipleCompanies(persnum: number): Promise<boolean> {
    const now = new Date();
    const localDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = localDate.toISOString().split('T')[0];

    const count = await this.relationSpRepo
      .createQueryBuilder('sp')
      .select('COUNT(DISTINCT sp.company)', 'count')
      .where('sp.relation_persnum = :persnum', { persnum })
      .andWhere('sp.startDate <= :today', { today: todayStr })
      .andWhere('sp.endDate >= :today', { today: todayStr })
      .getRawOne();

    return parseInt(count?.count || '0') > 1;
  }

  /**
   * Get default company for a user
   * Used when resetting to original company
   */
  async getDefaultCompany(persnum: number): Promise<CompanySwitchData | null> {
    const now = new Date();
    const localDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = localDate.toISOString().split('T')[0];

    // Get first (default) relation_sp record
    const defaultRelation = await this.relationSpRepo
      .createQueryBuilder('sp')
      .where('sp.relation_persnum = :persnum', { persnum })
      .andWhere('sp.startDate <= :today', { today: todayStr })
      .andWhere('sp.endDate >= :today', { today: todayStr })
      .orderBy('sp.company', 'ASC')
      .getOne();

    if (!defaultRelation) {
      return null;
    }

    return this.getCompanySwitchData(persnum, defaultRelation.id);
  }
}
