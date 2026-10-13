import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  OrganizationTuEntity,
  OrganizationTuRole,
} from './entities/organization-tu.entity';
import {
  CreateOrganizationTuDto,
  UpdateOrganizationTuDto,
  QueryOrganizationTuDto,
} from './dto/organization-tu.dto';
import { OrgDataService } from '../master-data/org_data/org_data.service';

export interface OrganizationTuListItem {
  id: string;
  persnum: number;
  user_name: string | null;
  role: OrganizationTuRole;
  area_id: string | null;
  area_text: string | null;
  organization_id: string | null;
  organization_text: string | null;
  sub_area_id: string | null;
  sub_area_text: string | null;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
  is_currently_valid: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
  delegasi_id: string | null;
}

export interface PaginatedOrgTuResult {
  data: OrganizationTuListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CheckUserResult {
  persnum: number;
  has_unit_dokumen: boolean;
  has_sekretaris_delegasi: boolean;
  active_assignments: Array<{
    id: string;
    role: OrganizationTuRole;
    area_id: string | null;
    area_text: string | null;
    organization_id: string | null;
    organization_text: string | null;
    sub_area_id: string | null;
    sub_area_text: string | null;
    valid_from: string;
    valid_to: string | null;
  }>;
}

@Injectable()
export class OrganizationTuService {
  private readonly logger = new Logger(OrganizationTuService.name);

  constructor(
    @InjectRepository(OrganizationTuEntity)
    private readonly repo: Repository<OrganizationTuEntity>,
    private readonly orgDataService: OrgDataService,
  ) {}

  // ============================================
  // Helper: resolve nama user + area + org + sub_area dari org_data
  // ============================================
  private async resolveReferenceNames(
    persnum: number,
    areaId?: string | null,
    organizationId?: string | null,
    subAreaId?: string | null,
  ): Promise<{
    user_name: string | null;
    area_text: string | null;
    organization_text: string | null;
    sub_area_text: string | null;
  }> {
    const result = {
      user_name: null as string | null,
      area_text: null as string | null,
      organization_text: null as string | null,
      sub_area_text: null as string | null,
    };

    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (!latestOrgData) return result;

      // Resolve user name dari position_json
      if (
        latestOrgData.position_json &&
        Array.isArray(latestOrgData.position_json)
      ) {
        const positionData = (latestOrgData.position_json as any[]).find(
          (p) =>
            p.persnum_person !== null &&
            p.persnum_person !== undefined &&
            String(p.persnum_person) === String(persnum),
        );
        if (positionData) {
          result.user_name = positionData.persnum_person_text || null;
          // Sekaligus resolve area/org/sub_area dari posisi user jika tidak disediakan
          if (!areaId && positionData.area) {
            result.area_text = positionData.area_text || null;
          }
          if (!organizationId && positionData.organization_id) {
            result.organization_text = positionData.organization_text || null;
          }
          if (!subAreaId && positionData.sub_area) {
            result.sub_area_text = positionData.sub_area_text || null;
          }
        }
      }

      // Resolve area/org/sub_area text dari organization_json jika id diberikan
      if (
        latestOrgData.organization_json &&
        Array.isArray(latestOrgData.organization_json)
      ) {
        const orgJson = latestOrgData.organization_json as any[];

        const findArea = (areaCode: string) => {
          // area berada di root atau nested; cari di seluruh tree
          const search = (nodes: any[]): any | null => {
            for (const n of nodes) {
              if (String(n.area) === String(areaCode)) return n;
              if (n.children && Array.isArray(n.children)) {
                const found = search(n.children);
                if (found) return found;
              }
            }
            return null;
          };
          return search(orgJson);
        };

        if (areaId) {
          const areaNode = findArea(areaId);
          if (areaNode)
            result.area_text = areaNode.name || areaNode.area_text || null;
        }
        if (organizationId) {
          const findOrg = (nodes: any[]): any | null => {
            for (const n of nodes) {
              if (String(n.id) === String(organizationId)) return n;
              if (n.children && Array.isArray(n.children)) {
                const found = findOrg(n.children);
                if (found) return found;
              }
            }
            return null;
          };
          const orgNode = findOrg(orgJson);
          if (orgNode) result.organization_text = orgNode.name || null;
        }
        if (subAreaId) {
          const findSubArea = (nodes: any[]): any | null => {
            for (const n of nodes) {
              if (String(n.sub_area) === String(subAreaId)) return n;
              if (n.children && Array.isArray(n.children)) {
                const found = findSubArea(n.children);
                if (found) return found;
              }
            }
            return null;
          };
          const subNode = findSubArea(orgJson);
          if (subNode)
            result.sub_area_text =
              subNode.name || subNode.sub_area_text || null;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to resolve reference names: ${message}`);
    }

    return result;
  }

  private isCurrentlyValid(
    valid_from: string,
    valid_to: string | null,
    today = new Date(),
  ): boolean {
    const todayStr = today.toISOString().split('T')[0];
    if (valid_from > todayStr) return false;
    if (valid_to && valid_to < todayStr) return false;
    return true;
  }

  private async mapToListItem(
    entity: OrganizationTuEntity,
  ): Promise<OrganizationTuListItem> {
    const names = await this.resolveReferenceNames(
      entity.persnum,
      entity.area_id,
      entity.organization_id,
      entity.sub_area_id,
    );
    return {
      id: entity.id,
      persnum: entity.persnum,
      user_name: names.user_name,
      role: entity.role,
      area_id: entity.area_id,
      area_text: names.area_text,
      organization_id: entity.organization_id,
      organization_text: names.organization_text,
      sub_area_id: entity.sub_area_id,
      sub_area_text: names.sub_area_text,
      valid_from: entity.valid_from,
      valid_to: entity.valid_to,
      is_active: entity.is_active,
      is_currently_valid:
        entity.is_active &&
        this.isCurrentlyValid(entity.valid_from, entity.valid_to),
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      created_by: entity.created_by,
      updated_by: entity.updated_by,
      delegasi_id: entity.delegasi_id,
    };
  }

  // ============================================
  // Validasi tumpang tindih
  // ============================================
  private async validateOverlap(
    persnum: number,
    role: OrganizationTuRole,
    area_id: string | null,
    organization_id: string | null,
    sub_area_id: string | null,
    valid_from: string,
    valid_to: string | null,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.repo
      .createQueryBuilder('ot')
      .where('ot.persnum = :persnum', { persnum })
      .andWhere('ot.role = :role', { role })
      .andWhere('ot.is_active = :active', { active: true })
      .andWhere('ot.valid_from <= :validFrom', { validFrom: valid_from })
      .andWhere('(ot.valid_to IS NULL OR ot.valid_to >= :validFrom)', {
        validFrom: valid_from,
      });

    if (valid_to) {
      qb.andWhere('ot.valid_from <= :validTo', { validTo: valid_to }).andWhere(
        '(ot.valid_to IS NULL OR ot.valid_to >= :validFrom2)',
        { validFrom2: valid_from },
      );
    }

    // Match area/org/sub_area (null dianggap wildcard — overlap jika sama-sama null atau salah null)
    qb.andWhere('(ot.area_id = :area OR ot.area_id IS NULL OR :area IS NULL)', {
      area: area_id,
    });
    qb.andWhere(
      '(ot.organization_id = :org OR ot.organization_id IS NULL OR :org IS NULL)',
      { org: organization_id },
    );
    qb.andWhere(
      '(ot.sub_area_id = :sub OR ot.sub_area_id IS NULL OR :sub IS NULL)',
      { sub: sub_area_id },
    );

    if (excludeId) {
      qb.andWhere('ot.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new BadRequestException(
        'User sudah memiliki role yang sama aktif di area/organization/sub_area yang tumpang tindih pada periode tersebut.',
      );
    }
  }

  // ============================================
  // CREATE
  // ============================================
  async create(
    dto: CreateOrganizationTuDto,
    creatorPersnum?: number,
  ): Promise<OrganizationTuListItem> {
    // Validasi tanggal
    if (dto.valid_to && dto.valid_to < dto.valid_from) {
      throw new BadRequestException(
        'Tanggal berakhir harus setelah atau sama dengan tanggal mulai.',
      );
    }

    await this.validateOverlap(
      dto.persnum,
      dto.role,
      dto.area_id ?? null,
      dto.organization_id ?? null,
      dto.sub_area_id ?? null,
      dto.valid_from,
      dto.valid_to ?? null,
    );

    const entity = this.repo.create({
      id: uuidv4(),
      persnum: dto.persnum,
      role: dto.role,
      area_id: dto.area_id ?? null,
      organization_id: dto.organization_id ?? null,
      sub_area_id: dto.sub_area_id ?? null,
      valid_from: dto.valid_from,
      valid_to: dto.valid_to ?? null,
      is_active: dto.is_active ?? true,
      created_by: creatorPersnum ?? null,
      updated_by: creatorPersnum ?? null,
      delegasi_id: null,
    });

    const saved = await this.repo.save(entity);
    return this.mapToListItem(saved);
  }

  // ============================================
  // FIND ALL (paginated)
  // ============================================
  async findAll(query: QueryOrganizationTuDto): Promise<PaginatedOrgTuResult> {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.max(1, parseInt(query.limit || '10', 10));

    const qb = this.repo.createQueryBuilder('ot');

    if (query.role) {
      qb.andWhere('ot.role = :role', { role: query.role });
    }
    if (query.area_id) {
      qb.andWhere('ot.area_id = :area', { area: query.area_id });
    }
    if (query.organization_id) {
      qb.andWhere('ot.organization_id = :org', { org: query.organization_id });
    }
    if (query.sub_area_id) {
      qb.andWhere('ot.sub_area_id = :sub', { sub: query.sub_area_id });
    }
    if (query.persnum) {
      qb.andWhere('ot.persnum = :persnum', {
        persnum: parseInt(query.persnum, 10),
      });
    }
    if (query.is_active !== undefined && query.is_active !== '') {
      qb.andWhere('ot.is_active = :active', {
        active: query.is_active === 'true' || query.is_active === '1',
      });
    }

    // Search by user name — perlu resolve persnum dari org_data
    if (query.search) {
      const persnums = await this.searchPersnumByName(query.search);
      if (persnums.length > 0) {
        qb.andWhere('ot.persnum IN (:...persnums)', { persnums });
      } else {
        // Tidak ada match → return empty
        qb.andWhere('1 = 0');
      }
    }

    // Sort
    const sort = query.sort || 'terbaru';
    switch (sort) {
      case 'terlama':
        qb.orderBy('ot.created_at', 'ASC');
        break;
      case 'valid_from_asc':
        qb.orderBy('ot.valid_from', 'ASC');
        break;
      case 'valid_from_desc':
        qb.orderBy('ot.valid_from', 'DESC');
        break;
      case 'terbaru':
      default:
        qb.orderBy('ot.created_at', 'DESC');
        break;
    }

    qb.skip((page - 1) * limit).take(limit);

    const [entities, total] = await qb.getManyAndCount();
    const data = await Promise.all(entities.map((e) => this.mapToListItem(e)));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async searchPersnumByName(search: string): Promise<number[]> {
    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (
        !latestOrgData?.position_json ||
        !Array.isArray(latestOrgData.position_json)
      ) {
        return [];
      }
      const lower = search.toLowerCase();
      return (latestOrgData.position_json as any[])
        .filter(
          (p) =>
            p.persnum_person &&
            p.persnum_person_text &&
            String(p.persnum_person_text).toLowerCase().includes(lower),
        )
        .map((p) => Number(p.persnum_person))
        .filter((n) => !Number.isNaN(n));
    } catch (error) {
      this.logger.warn(
        `searchPersnumByName failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  // ============================================
  // FIND ONE
  // ============================================
  async findOne(id: string): Promise<OrganizationTuListItem> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Data organization_tu tidak ditemukan');
    }
    return this.mapToListItem(entity);
  }

  // ============================================
  // UPDATE
  // ============================================
  async update(
    id: string,
    dto: UpdateOrganizationTuDto,
    updaterPersnum?: number,
  ): Promise<OrganizationTuListItem> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Data organization_tu tidak ditemukan');
    }

    const nextPersnum = dto.persnum ?? entity.persnum;
    const nextRole = dto.role ?? entity.role;
    const nextArea = dto.area_id !== undefined ? dto.area_id : entity.area_id;
    const nextOrg =
      dto.organization_id !== undefined
        ? dto.organization_id
        : entity.organization_id;
    const nextSub =
      dto.sub_area_id !== undefined ? dto.sub_area_id : entity.sub_area_id;
    const nextValidFrom = dto.valid_from ?? entity.valid_from;
    const nextValidTo =
      dto.valid_to !== undefined ? dto.valid_to : entity.valid_to;

    if (nextValidTo && nextValidTo < nextValidFrom) {
      throw new BadRequestException(
        'Tanggal berakhir harus setelah atau sama dengan tanggal mulai.',
      );
    }

    // Validasi overlap hanya jika ada perubahan signifikan
    const changed =
      (dto.persnum !== undefined && dto.persnum !== entity.persnum) ||
      (dto.role !== undefined && dto.role !== entity.role) ||
      (dto.area_id !== undefined && dto.area_id !== entity.area_id) ||
      (dto.organization_id !== undefined &&
        dto.organization_id !== entity.organization_id) ||
      (dto.sub_area_id !== undefined &&
        dto.sub_area_id !== entity.sub_area_id) ||
      (dto.valid_from !== undefined && dto.valid_from !== entity.valid_from) ||
      (dto.valid_to !== undefined && dto.valid_to !== entity.valid_to) ||
      (dto.is_active !== undefined && dto.is_active !== entity.is_active);

    if (changed && (dto.is_active === undefined || dto.is_active === true)) {
      await this.validateOverlap(
        nextPersnum,
        nextRole,
        nextArea,
        nextOrg,
        nextSub,
        nextValidFrom,
        nextValidTo,
        id,
      );
    }

    entity.persnum = nextPersnum;
    entity.role = nextRole;
    entity.area_id = nextArea;
    entity.organization_id = nextOrg;
    entity.sub_area_id = nextSub;
    entity.valid_from = nextValidFrom;
    entity.valid_to = nextValidTo;
    if (dto.is_active !== undefined) entity.is_active = dto.is_active;
    entity.updated_by = updaterPersnum ?? null;

    const saved = await this.repo.save(entity);
    return this.mapToListItem(saved);
  }

  // ============================================
  // DELETE (hard delete)
  // ============================================
  async remove(id: string): Promise<{ message: string }> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Data organization_tu tidak ditemukan');
    }
    await this.repo.remove(entity);
    return { message: 'Data organization_tu berhasil dihapus' };
  }

  // ============================================
  // CHECK USER
  // ============================================
  async checkUser(persnum: number): Promise<CheckUserResult> {
    const todayStr = new Date().toISOString().split('T')[0];
    const assignments = await this.repo
      .createQueryBuilder('ot')
      .where('ot.persnum = :persnum', { persnum })
      .andWhere('ot.is_active = :active', { active: true })
      .andWhere('ot.valid_from <= :today', { today: todayStr })
      .andWhere('(ot.valid_to IS NULL OR ot.valid_to >= :today)', {
        today: todayStr,
      })
      .getMany();

    const enriched = await Promise.all(
      assignments.map(async (a) => {
        const names = await this.resolveReferenceNames(
          a.persnum,
          a.area_id,
          a.organization_id,
          a.sub_area_id,
        );
        return {
          id: a.id,
          role: a.role,
          area_id: a.area_id,
          area_text: names.area_text,
          organization_id: a.organization_id,
          organization_text: names.organization_text,
          sub_area_id: a.sub_area_id,
          sub_area_text: names.sub_area_text,
          valid_from: a.valid_from,
          valid_to: a.valid_to,
        };
      }),
    );

    return {
      persnum,
      has_unit_dokumen: assignments.some(
        (a) => a.role === OrganizationTuRole.UNIT_DOKUMEN,
      ),
      has_sekretaris_delegasi: assignments.some(
        (a) => a.role === OrganizationTuRole.SEKRETARIS_DELEGASI,
      ),
      active_assignments: enriched,
    };
  }

  // ============================================
  // Get active roles untuk persnum (dipakai AuthService)
  // Return array string role tambahan: ['tu'] | ['sekretaris'] | ['tu','sekretaris']
  // ============================================
  async getActiveRolesForPersnum(
    persnum: number,
    today = new Date(),
  ): Promise<string[]> {
    const todayStr = today.toISOString().split('T')[0];
    const assignments = await this.repo
      .createQueryBuilder('ot')
      .where('ot.persnum = :persnum', { persnum })
      .andWhere('ot.is_active = :active', { active: true })
      .andWhere('ot.valid_from <= :today', { today: todayStr })
      .andWhere('(ot.valid_to IS NULL OR ot.valid_to >= :today)', {
        today: todayStr,
      })
      .getMany();

    const roles: string[] = [];
    if (assignments.some((a) => a.role === OrganizationTuRole.UNIT_DOKUMEN)) {
      roles.push('tu');
    }
    if (
      assignments.some((a) => a.role === OrganizationTuRole.SEKRETARIS_DELEGASI)
    ) {
      roles.push('sekretaris');
    }
    return roles;
  }

  /**
   * Resolve area_id aktif untuk persnum (dari organization_tu).
   * Dipakai untuk scoping verifikasi usulan tertuju per area TU.
   * Return area_id pertama yang non-null; null jika tidak ada assignment.
   */
  async getActiveAreaForPersnum(
    persnum: number,
    today = new Date(),
  ): Promise<string | null> {
    const todayStr = today.toISOString().split('T')[0];
    const assignments = await this.repo
      .createQueryBuilder('ot')
      .where('ot.persnum = :persnum', { persnum })
      .andWhere('ot.is_active = :active', { active: true })
      .andWhere('ot.valid_from <= :today', { today: todayStr })
      .andWhere('(ot.valid_to IS NULL OR ot.valid_to >= :today)', {
        today: todayStr,
      })
      .getMany();

    const withArea = assignments.find((a) => a.area_id);
    return withArea?.area_id ?? null;
  }

  // ============================================
  // Integrasi Delegasi — dipanggil saat create delegasi dengan position_status SE
  // ============================================
  async createFromDelegasi(params: {
    delegasiId: string;
    persnum: number; // as_persnum (penerima delegasi)
    area_id?: string | null;
    organization_id?: string | null;
    sub_area_id?: string | null;
    valid_from: string;
    valid_to?: string | null;
    created_by?: number | null;
  }): Promise<OrganizationTuEntity | null> {
    try {
      // Cek apakah sudah ada record untuk delegasi ini
      const existing = await this.repo.findOne({
        where: { delegasi_id: params.delegasiId },
      });
      if (existing) {
        // Update record existing
        existing.persnum = params.persnum;
        existing.area_id = params.area_id ?? null;
        existing.organization_id = params.organization_id ?? null;
        existing.sub_area_id = params.sub_area_id ?? null;
        existing.valid_from = params.valid_from;
        existing.valid_to = params.valid_to ?? null;
        existing.is_active = true;
        existing.updated_by = params.created_by ?? null;
        return this.repo.save(existing);
      }

      const entity = this.repo.create({
        id: uuidv4(),
        persnum: params.persnum,
        role: OrganizationTuRole.SEKRETARIS_DELEGASI,
        area_id: params.area_id ?? null,
        organization_id: params.organization_id ?? null,
        sub_area_id: params.sub_area_id ?? null,
        valid_from: params.valid_from,
        valid_to: params.valid_to ?? null,
        is_active: true,
        created_by: params.created_by ?? null,
        updated_by: params.created_by ?? null,
        delegasi_id: params.delegasiId,
      });
      return this.repo.save(entity);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`createFromDelegasi failed: ${message}`);
      return null;
    }
  }

  // ============================================
  // Integrasi Delegasi — update / nonaktifkan
  // ============================================
  async updateFromDelegasi(
    delegasiId: string,
    params: {
      persnum?: number;
      area_id?: string | null;
      organization_id?: string | null;
      sub_area_id?: string | null;
      valid_from?: string;
      valid_to?: string | null;
      is_active?: boolean;
      updated_by?: number | null;
    },
  ): Promise<void> {
    try {
      const existing = await this.repo.findOne({
        where: { delegasi_id: delegasiId },
      });
      if (!existing) return;

      if (params.persnum !== undefined) existing.persnum = params.persnum;
      if (params.area_id !== undefined)
        existing.area_id = params.area_id ?? null;
      if (params.organization_id !== undefined)
        existing.organization_id = params.organization_id ?? null;
      if (params.sub_area_id !== undefined)
        existing.sub_area_id = params.sub_area_id ?? null;
      if (params.valid_from !== undefined)
        existing.valid_from = params.valid_from;
      if (params.valid_to !== undefined)
        existing.valid_to = params.valid_to ?? null;
      if (params.is_active !== undefined) existing.is_active = params.is_active;
      existing.updated_by = params.updated_by ?? null;

      await this.repo.save(existing);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`updateFromDelegasi failed: ${message}`);
    }
  }

  async deactivateFromDelegasi(delegasiId: string): Promise<void> {
    await this.updateFromDelegasi(delegasiId, { is_active: false });
  }
}
