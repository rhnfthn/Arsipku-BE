import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrgDatumDto } from './dto/create-org_datum.dto';
import { UpdateOrgDatumDto } from './dto/update-org_datum.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { OrgDatum } from './entities/org_datum.entity';
import { Repository } from 'typeorm';

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const ORG_CACHE_TTL_MS = 5 * 60_000; // 5 menit
const PERSNUM_CACHE_MAX = 5_000;

@Injectable()
export class OrgDataService {
  // Cache untuk findLatestOrg() — data sama untuk semua user
  private latestOrgCache: CacheEntry<OrgDatum | null> | null = null;

  // Cache findOrg(tgl) — per tanggal
  private orgByDateCache = new Map<string, CacheEntry<OrgDatum | null>>();

  // Cache findByPersnum(persnum) — per user
  private persnumCache = new Map<number, CacheEntry<any | null>>();

  constructor(
    @InjectRepository(OrgDatum)
    private readonly cRepo: Repository<OrgDatum>,
  ) {}

  /** Bust seluruh cache (panggil saat data org_data berubah / regenerate) */
  invalidateCache() {
    this.latestOrgCache = null;
    this.orgByDateCache.clear();
    this.persnumCache.clear();
  }

  async findAll(): Promise<OrgDatum[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OrgDatum> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Data with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateOrgDatumDto): Promise<OrgDatum> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    const saved = await this.cRepo.save(newCompany);
    this.invalidateCache();
    return saved;
  }

  async update(id: string, dto: UpdateOrgDatumDto): Promise<OrgDatum> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    const saved = await this.cRepo.save(updated);
    this.invalidateCache();
    return saved;
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.cRepo.remove(company);
    this.invalidateCache();
    return { message: `Area ${id} deleted successfully` };
  }

  async createOrUpdate(tgl: string, organization_json: any, position_json: any) {
    if (!tgl) {
      throw new BadRequestException('Tanggal (tgl) is required');
    }

    const existing = await this.cRepo.findOne({ where: { tgl } });

    let result: OrgDatum;
    if (existing) {
      // UPDATE
      existing.organization_json = organization_json;
      existing.position_json = position_json;
      result = await this.cRepo.save(existing);
    } else {
      // INSERT
      const newData = this.cRepo.create({
        tgl,
        organization_json,
        position_json,
      });
      result = await this.cRepo.save(newData);
    }

    this.invalidateCache();
    return result;
  }

  async findOrg(tgl: string) {
    if (!tgl) {
      throw new BadRequestException('Tanggal (tgl) is required');
    }

    const now = Date.now();
    const cached = this.orgByDateCache.get(tgl);
    if (cached && cached.expires > now) {
      if (!cached.data) {
        throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
      }
      return cached.data;
    }

    const result = await this.cRepo.findOne({ where: { tgl } });
    this.orgByDateCache.set(tgl, {
      data: result || null,
      expires: now + ORG_CACHE_TTL_MS,
    });

    if (!result) {
      throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    }

    return result;
  }

  /**
   * Find latest org data (most recent by tgl)
   * Used when exact date match is not required
   */
  async findLatestOrg(): Promise<OrgDatum | null> {
    const now = Date.now();
    if (this.latestOrgCache && this.latestOrgCache.expires > now) {
      return this.latestOrgCache.data;
    }

    const result = await this.cRepo
      .createQueryBuilder('organization_build')
      .orderBy('organization_build.tgl', 'DESC')
      .limit(1)
      .getOne();

    this.latestOrgCache = {
      data: result || null,
      expires: now + ORG_CACHE_TTL_MS,
    };

    return result || null;
  }

  /**
   * Get all managerial positions (chief=1) from org_data
   * Returns all positions without any relational filters
   * 
   * @param tgl - Optional date (default: today)
   * @returns Array of all managerial positions
   */
  async getAllManagerialPositions(
    tgl?: string,
  ): Promise<{ success: boolean; data: any[]; total: number; tanggal: string }> {
    // Use today's date if not provided
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    // Get cached org data from org_data service
    const orgData = await this.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: any[] = orgData.position_json;

    // Filter only managerial positions (chief = 1)
    const managerialPositions = barisData.filter((x) => x.chief === 1);

    return {
      success: true,
      data: managerialPositions,
      total: managerialPositions.length,
      tanggal,
    };
  }

  /**
   * Find user by persnum from organization_json
   * Used for SSO authentication
   *
   * Structure: organization_json is nested hierarchy
   * User data is in: positions[].person.persnum
   *
   * Cached per persnum (5 menit) — payload organization_json bisa puluhan MB
   * jadi caching menghindari hit DB + JSON parse berulang.
   */
  async findByPersnum(persnum: number): Promise<any | null> {
    const now = Date.now();
    const cached = this.persnumCache.get(persnum);
    if (cached && cached.expires > now) {
      return cached.data;
    }

    try {
      // Reuse latest org data dengan cache (juga akan ter-cache 5 menit)
      const latestOrgData = await this.findLatestOrg();

      if (!latestOrgData || !latestOrgData.organization_json) {
        this.setPersnumCache(persnum, null);
        return null;
      }

      const orgJson = latestOrgData.organization_json;
      if (!Array.isArray(orgJson)) {
        this.setPersnumCache(persnum, null);
        return null;
      }

      // Helper mapper: flatten shape user/atasan response
      const mapPositionWithOrg = (org: any, position: any) => ({
        persnum: position.person?.persnum ?? null,
        nama: position.person?.persnum_text ?? null,
        company: org.company,
        companyText: org.company_name,
        area: org.area,
        areaText: org.area_text,
        subArea: org.sub_area,
        subAreaText: org.sub_area_text,
        organization: org.id,
        organizationText: org.name,
        organizationAbbreviation: org.abbreviation,
        position: position.position,
        positionText: position.position_text,
        positionAbbreviation: position.abbreviation,
        abbreviation: position.abbreviation || '', // Use position abbreviation
        isChief: position.chief === 1,
        bodTag: position.bod_tag,
      });

      // Recursive function to search user in nested structure
      const searchPersnum = parseInt(String(persnum));

      const findUserInOrg = (orgs: any[], parentOrg: any | null = null): any | null => {
        for (const org of orgs) {
          if (org.positions && Array.isArray(org.positions)) {
            for (const position of org.positions) {
              if (position.person && position.person.persnum) {
                const positionPersnum = parseInt(String(position.person.persnum));

                if (positionPersnum === searchPersnum) {
                  const userData = mapPositionWithOrg(org, position);

                  // Atasan langsung: position di organization parent (1 level di atas)
                  let atasanLangsung: any = null;
                  if (parentOrg?.positions && Array.isArray(parentOrg.positions)) {
                    const parentChief = parentOrg.positions.find(
                      (p: any) => p?.person?.persnum && p?.chief === 1,
                    );

                    if (parentChief) {
                      atasanLangsung = mapPositionWithOrg(parentOrg, parentChief);
                    }
                  }

                  return {
                    ...userData,
                    atasan_langsung: atasanLangsung,
                  };
                }
              }
            }
          }

          if (org.children && Array.isArray(org.children)) {
            const found = findUserInOrg(org.children, org);
            if (found) return found;
          }
        }
        return null;
      };

      const userOrg = findUserInOrg(orgJson);
      this.setPersnumCache(persnum, userOrg || null);
      return userOrg || null;
    } catch (error) {
      console.error('[OrgDataService] Error in findByPersnum:', error);
      throw error;
    }
  }

  /** Helper LRU-ish set untuk persnumCache (cap to PERSNUM_CACHE_MAX) */
  private setPersnumCache(persnum: number, data: any | null) {
    if (this.persnumCache.size >= PERSNUM_CACHE_MAX) {
      this.persnumCache.clear();
    }
    this.persnumCache.set(persnum, {
      data,
      expires: Date.now() + ORG_CACHE_TTL_MS,
    });
  }
}
