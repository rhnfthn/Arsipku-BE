import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  SelectQueryBuilder,
  LessThan,
  MoreThan,
  Between,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DelegasiEntity } from '../entities/delegasi.entity';
import { CreateDelegasiDto } from '../dto/create-delegasi.dto';
import { UpdateDelegasiDto } from '../dto/update-delegasi.dto';
import { QueryDelegasiDto } from '../dto/query-delegasi.dto';
import {
  PositionStatus,
  getDelegablePositionStatuses,
  POSITION_STATUS_LABELS,
} from '../../../common/enums/position-status.enum';
import { PositionService } from '../../master-data/position/position.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities';
import { OrganizationTuService } from '../../organization-tu/organization-tu.service';

// Interface untuk data dari position_json (cached org data)
interface PositionData {
  position: number;
  position_text: string;
  position_abbreviation: string | null;
  chief: number;
  departType: string | null;
  persnum_person: number | null;
  persnum_person_text: string | null;
  organization_id: number;
  organization_text: string;
  organization_abbreviation: string | null;
  organization_parent: number | null;
  organization_parent_text: string | null;
  sub_area: number | null;
  sub_area_text: string | null;
  area: string | null;
  area_text: string | null;
  level: number;
  divisi_id: number | null;
  divisi_name: string | null;
  direktorat_id: number | null;
  direktorat_name: string | null;
  company: number | null;
  company_name: string | null;
  bod_tag: string | null;
}

export interface DelegasiStatus {
  code: 'aktif' | 'tidak_aktif' | 'kedaluwarsa';
  label: string;
}

export interface DelegasiWithStatus extends DelegasiEntity {
  status: DelegasiStatus;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class DelegasiService {
  constructor(
    @InjectRepository(DelegasiEntity)
    private delegasiRepository: Repository<DelegasiEntity>,
    private readonly positionService: PositionService,
    private readonly orgDataService: OrgDataService,
    private readonly notificationService: NotificationService,
    private readonly organizationTuService: OrganizationTuService,
  ) {}

  /**
   * Format Date ke string YYYY-MM-DD (untuk kolom date organization_tu).
   */
  private toDateStr(d: Date | string): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Calculate delegation status based on dates
   */
  private calculateStatus(
    delegasi: DelegasiEntity,
    today: Date = new Date(),
  ): DelegasiStatus {
    const startDate = new Date(delegasi.start_date);
    const endDate = new Date(delegasi.end_date);

    // Reset time part for date comparison
    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (today < startDate) {
      return { code: 'tidak_aktif', label: 'Tidak Aktif' };
    } else if (today > endDate) {
      return { code: 'kedaluwarsa', label: 'Kedaluwarsa' };
    } else {
      return { code: 'aktif', label: 'Aktif' };
    }
  }

  /**
   * Add status to delegasi entity
   */
  private addStatus(delegasi: DelegasiEntity): DelegasiWithStatus {
    return {
      ...delegasi,
      status: this.calculateStatus(delegasi),
    };
  }

  /**
   * Resolve person name from latest org_data position_json by persnum.
   * Used to keep as_persnum and as_name consistent when updating delegasi.
   */
  private async resolvePersonNameByPersnum(
    persnum?: string,
  ): Promise<string | undefined> {
    if (!persnum) {
      return undefined;
    }

    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (
        !latestOrgData?.position_json ||
        !Array.isArray(latestOrgData.position_json)
      ) {
        return undefined;
      }

      const positionData = (latestOrgData.position_json as PositionData[]).find(
        (p) =>
          p.persnum_person !== null &&
          String(p.persnum_person) === String(persnum),
      );

      return positionData?.persnum_person_text || undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        '[DelegasiService] Failed to resolve person name by persnum:',
        message,
      );
      return undefined;
    }
  }

  /**
   * Resolve position data from latest org_data.position_json by position id.
   */
  private async resolvePositionDataByPosition(
    position?: string,
  ): Promise<PositionData | undefined> {
    if (!position) {
      return undefined;
    }

    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (
        !latestOrgData?.position_json ||
        !Array.isArray(latestOrgData.position_json)
      ) {
        return undefined;
      }

      return (latestOrgData.position_json as PositionData[]).find(
        (p) => String(p.position) === String(position),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        '[DelegasiService] Failed to resolve position data by position:',
        message,
      );
      return undefined;
    }
  }

  private async notifyDelegasi(
    delegasi: DelegasiEntity,
    target: 'delegate' | 'owner' = 'delegate',
    title = 'Delegasi jabatan',
    body?: string,
  ) {
    const positionId =
      target === 'delegate' ? delegasi.as_position : delegasi.position;
    const userPersnum =
      target === 'delegate' ? delegasi.as_persnum : delegasi.persnum;
    if (!positionId) return;

    await this.notificationService.createNotification({
      positionId: String(positionId),
      userPersnum: userPersnum ? Number(userPersnum) : undefined,
      type: NotificationType.DELEGASI,
      title,
      body:
        body ||
        `${delegasi.name || 'Pemberi delegasi'} mendelegasikan ${delegasi.position_text || 'jabatan'} kepada ${delegasi.as_name || 'penerima delegasi'}`,
      data: {
        action: 'OPEN_DELEGASI',
        delegasiId: delegasi.id,
        positionStatus: delegasi.position_status,
        startDate: delegasi.start_date,
        endDate: delegasi.end_date,
        positionId: delegasi.position,
        asPositionId: delegasi.as_position,
      },
    });
  }

  /**
   * Create new delegasi
   */
  async create(
    createDelegasiDto: CreateDelegasiDto,
    user?: any,
  ): Promise<DelegasiWithStatus> {
    // Validate that position_status is delegable (not YBS)
    if (createDelegasiDto.position_status === PositionStatus.YBS) {
      throw new BadRequestException(
        'Position status YBS tidak dapat didelegasikan',
      );
    }

    // Validate dates
    const startDate = new Date(createDelegasiDto.start_date);
    const endDate = new Date(createDelegasiDto.end_date);

    if (endDate < startDate) {
      throw new BadRequestException(
        'Tanggal selesai harus setelah tanggal mulai',
      );
    }

    // Check for overlapping delegation for same position and person
    if (createDelegasiDto.persnum && createDelegasiDto.as_position) {
      const overlapping = await this.delegasiRepository
        .createQueryBuilder('d')
        .where('d.persnum = :persnum', { persnum: createDelegasiDto.persnum })
        .andWhere('d.as_position = :as_position', {
          as_position: createDelegasiDto.as_position,
        })
        .andWhere('d.position_status = :position_status', {
          position_status: createDelegasiDto.position_status,
        })
        .andWhere('(d.start_date <= :endDate AND d.end_date >= :startDate)', {
          startDate: createDelegasiDto.start_date,
          endDate: createDelegasiDto.end_date,
        })
        .getOne();

      if (overlapping) {
        throw new BadRequestException(
          'Sudah ada delegasi yang overlap untuk personil dan jabatan yang sama',
        );
      }
    }

    // Auto-fill delegator data dari JWT user jika tidak disediakan atau null
    // Note: JWT menggunakan camelCase (positionText), DB menggunakan snake_case (position_text)
    const delegasiData = { ...createDelegasiDto };

    if (user) {
      // Handle undefined atau null values - auto-fill dari JWT (dengan mapping field names)
      if (!delegasiData.position || delegasiData.position === null)
        delegasiData.position = user.position;
      if (!delegasiData.position_text || delegasiData.position_text === null)
        delegasiData.position_text = user.positionText;
      if (!delegasiData.persnum || delegasiData.persnum === null)
        delegasiData.persnum = String(user.persnum);
      if (!delegasiData.name || delegasiData.name === null)
        delegasiData.name = user.nama;
      if (!delegasiData.organization || delegasiData.organization === null)
        delegasiData.organization = user.organization;
      if (
        !delegasiData.organization_text ||
        delegasiData.organization_text === null
      )
        delegasiData.organization_text = user.organizationText;
      if (!delegasiData.area || delegasiData.area === null)
        delegasiData.area = user.area;
      if (!delegasiData.area_text || delegasiData.area_text === null)
        delegasiData.area_text = user.areaText;
      if (!delegasiData.sub_area || delegasiData.sub_area === null)
        delegasiData.sub_area = user.subArea;
      if (!delegasiData.sub_area_text || delegasiData.sub_area_text === null)
        delegasiData.sub_area_text = user.subAreaText;
      if (!delegasiData.company || delegasiData.company === null)
        delegasiData.company = user.company;
      if (!delegasiData.company_text || delegasiData.company_text === null)
        delegasiData.company_text = user.companyText;
    }

    // Auto-fill delegate position data (as_*) dari org_data.position_json
    // CATATAN: as_persnum dan as_name harus datang dari input Personil (frontend)
    // Di sini hanya auto-fill data posisi (as_position_text, as_organization, dll)
    if (delegasiData.as_position) {
      try {
        // Get position data from org_data (position_json has complete data)
        const today = new Date().toISOString().split('T')[0];
        const orgData = await this.orgDataService.findOrg(today);

        if (orgData && orgData.position_json) {
          const positionJsonData = orgData.position_json as PositionData[];
          const positionData = positionJsonData.find(
            (p) => String(p.position) === String(delegasiData.as_position),
          );

          if (positionData) {
            // Auto-fill data posisi as_* dari position_json
            // TIDAK auto-fill as_persnum dan as_name karena itu harus dari input Personil
            if (!delegasiData.as_position_text) {
              delegasiData.as_position_text =
                positionData.position_text || undefined;
            }
            if (!delegasiData.as_organization) {
              delegasiData.as_organization = positionData.organization_id
                ? String(positionData.organization_id)
                : undefined;
            }
            if (!delegasiData.as_organization_text) {
              delegasiData.as_organization_text =
                positionData.organization_text || undefined;
            }
            if (!delegasiData.as_area) {
              delegasiData.as_area = positionData.area || undefined;
            }
            if (!delegasiData.as_area_text) {
              delegasiData.as_area_text = positionData.area_text || undefined;
            }
            if (!delegasiData.as_sub_area) {
              delegasiData.as_sub_area = positionData.sub_area
                ? String(positionData.sub_area)
                : undefined;
            }
            if (!delegasiData.as_sub_area_text) {
              delegasiData.as_sub_area_text =
                positionData.sub_area_text || undefined;
            }
            // Auto-fill company dari position_json jika belum ada
            if (!delegasiData.company) {
              delegasiData.company = positionData.company
                ? String(positionData.company)
                : undefined;
            }
            if (!delegasiData.company_text) {
              delegasiData.company_text =
                positionData.company_name || undefined;
            }
            // TIDAK auto-fill as_persnum dan as_name di sini
            // as_persnum dan as_name harus dikirim dari frontend (dari Personil dropdown)
          }
        }
      } catch (error) {
        // Jika gagal query org_data, tetap lanjutkan tanpa auto-fill
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          'Failed to auto-fill delegate position data from org_data:',
          message,
        );
      }
    }

    const delegasi = this.delegasiRepository.create({
      ...delegasiData,
      id: delegasiData.id || uuidv4(),
    });

    const saved = await this.delegasiRepository.save(delegasi);
    this.notifyDelegasi(saved, 'delegate', 'Delegasi baru').catch((error) =>
      console.warn(
        '[DelegasiService] Failed to send create notification:',
        error?.message,
      ),
    );

    // Integrasi organization_tu: jika position_status === SE (Sekretaris),
    // sync ke tabel organization_tu sebagai sekretaris_delegasi.
    if (saved.position_status === PositionStatus.SE && saved.as_persnum) {
      this.organizationTuService
        .createFromDelegasi({
          delegasiId: saved.id,
          persnum: Number(saved.as_persnum),
          area_id: saved.as_area ?? null,
          organization_id: saved.as_organization
            ? String(saved.as_organization)
            : null,
          sub_area_id: saved.as_sub_area ? String(saved.as_sub_area) : null,
          valid_from: this.toDateStr(saved.start_date),
          valid_to: saved.end_date ? this.toDateStr(saved.end_date) : null,
          created_by: saved.persnum ? Number(saved.persnum) : null,
        })
        .catch((error) =>
          console.warn(
            '[DelegasiService] Failed to sync organization_tu on create:',
            error?.message,
          ),
        );
    }

    return this.addStatus(saved);
  }

  /**
   * Find all delegasi with filtering, sorting, and pagination
   */
  async findAll(
    query: QueryDelegasiDto,
  ): Promise<PaginatedResult<DelegasiWithStatus>> {
    const {
      search,
      company,
      position_status,
      persnum,
      as_persnum,
      position,
      as_position,
      status,
      sort = 'terbaru',
      page = 1,
      limit = 10,
    } = query;

    const qb = this.delegasiRepository.createQueryBuilder('d');

    // Apply filters
    if (search) {
      qb.andWhere(
        '(d.name LIKE :search OR d.as_name LIKE :search OR d.position_text LIKE :search OR d.as_position_text LIKE :search OR d.organization_text LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (company) {
      qb.andWhere('d.company = :company', { company });
    }

    if (position_status) {
      qb.andWhere('d.position_status = :position_status', { position_status });
    }

    if (persnum) {
      qb.andWhere('d.persnum = :persnum', { persnum });
    }

    if (as_persnum) {
      qb.andWhere('d.as_persnum = :as_persnum', { as_persnum });
    }

    if (position) {
      qb.andWhere('d.position = :position', { position });
    }

    if (as_position) {
      qb.andWhere('d.as_position = :as_position', { as_position });
    }

    // Apply sorting
    switch (sort) {
      case 'terlama':
        qb.orderBy('d.create_at', 'ASC');
        break;
      case 'nama_asc':
        qb.orderBy('d.name', 'ASC');
        break;
      case 'nama_desc':
        qb.orderBy('d.name', 'DESC');
        break;
      case 'terbaru':
      default:
        qb.orderBy('d.create_at', 'DESC');
        break;
    }

    // Get all for status filtering (if needed)
    const allResults = await qb.getMany();

    // Add status and filter by status if needed
    let resultsWithStatus = allResults.map((d) => this.addStatus(d));

    if (status && status !== 'all') {
      resultsWithStatus = resultsWithStatus.filter(
        (d) => d.status.code === status,
      );
    }

    // Apply pagination
    const total = resultsWithStatus.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedData = resultsWithStatus.slice(offset, offset + limit);

    return {
      data: paginatedData,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Find one delegasi by ID
   */
  async findOne(id: string): Promise<DelegasiWithStatus> {
    const delegasi = await this.delegasiRepository.findOne({
      where: { id },
    });

    if (!delegasi) {
      throw new NotFoundException('Delegasi tidak ditemukan');
    }

    return this.addStatus(delegasi);
  }

  /**
   * Find active delegations for a person
   */
  async findActiveByPersnum(persnum: string): Promise<DelegasiWithStatus[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const delegations = await this.delegasiRepository
      .createQueryBuilder('d')
      .where('d.persnum = :persnum', { persnum })
      .andWhere('d.start_date <= :today', { today: todayStr })
      .andWhere('d.end_date >= :today', { today: todayStr })
      .getMany();

    return delegations.map((d) => this.addStatus(d));
  }

  /**
   * Find active delegations for a position (where person is delegating AS this position)
   */
  async findActiveByAsPosition(
    as_position: string,
  ): Promise<DelegasiWithStatus[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const delegations = await this.delegasiRepository
      .createQueryBuilder('d')
      .where('d.as_position = :as_position', { as_position })
      .andWhere('d.start_date <= :today', { today: todayStr })
      .andWhere('d.end_date >= :today', { today: todayStr })
      .getMany();

    return delegations.map((d) => this.addStatus(d));
  }

  /**
   * Update delegasi
   */
  async update(
    id: string,
    updateDelegasiDto: UpdateDelegasiDto,
  ): Promise<DelegasiWithStatus> {
    const delegasi = await this.delegasiRepository.findOne({ where: { id } });

    if (!delegasi) {
      throw new NotFoundException('Delegasi tidak ditemukan');
    }

    // Validate position_status if being updated
    if (updateDelegasiDto.position_status === PositionStatus.YBS) {
      throw new BadRequestException(
        'Position status YBS tidak dapat didelegasikan',
      );
    }

    // Validate dates if being updated
    const startDate = updateDelegasiDto.start_date
      ? new Date(updateDelegasiDto.start_date)
      : new Date(delegasi.start_date);
    const endDate = updateDelegasiDto.end_date
      ? new Date(updateDelegasiDto.end_date)
      : new Date(delegasi.end_date);

    if (endDate < startDate) {
      throw new BadRequestException(
        'Tanggal selesai harus setelah tanggal mulai',
      );
    }

    const updateData: Record<string, any> = { ...updateDelegasiDto };

    // Keep as_position and all derived as_* fields synchronized.
    if (updateData.as_position !== undefined) {
      const currentAsPosition = delegasi.as_position
        ? String(delegasi.as_position)
        : '';
      const nextAsPosition = updateData.as_position
        ? String(updateData.as_position)
        : '';
      const isAsPositionChanged = currentAsPosition !== nextAsPosition;

      if (isAsPositionChanged) {
        if (nextAsPosition) {
          const resolvedAsPositionData =
            await this.resolvePositionDataByPosition(nextAsPosition);

          if (resolvedAsPositionData) {
            // Always trust org_data as source of truth for position metadata.
            updateData.as_position_text =
              resolvedAsPositionData.position_text || null;
            updateData.as_organization = resolvedAsPositionData.organization_id
              ? String(resolvedAsPositionData.organization_id)
              : null;
            updateData.as_organization_text =
              resolvedAsPositionData.organization_text || null;
            updateData.as_area = resolvedAsPositionData.area || null;
            updateData.as_area_text = resolvedAsPositionData.area_text || null;
            updateData.as_sub_area = resolvedAsPositionData.sub_area
              ? String(resolvedAsPositionData.sub_area)
              : null;
            updateData.as_sub_area_text =
              resolvedAsPositionData.sub_area_text || null;
          } else {
            // Avoid returning stale derived values when as_position changes but lookup fails.
            if (updateData.as_position_text === undefined)
              updateData.as_position_text = null;
            if (updateData.as_organization === undefined)
              updateData.as_organization = null;
            if (updateData.as_organization_text === undefined)
              updateData.as_organization_text = null;
            if (updateData.as_area === undefined) updateData.as_area = null;
            if (updateData.as_area_text === undefined)
              updateData.as_area_text = null;
            if (updateData.as_sub_area === undefined)
              updateData.as_sub_area = null;
            if (updateData.as_sub_area_text === undefined)
              updateData.as_sub_area_text = null;
          }
        } else {
          // If as_position is cleared, clear all dependent as_* fields too.
          if (updateData.as_position_text === undefined)
            updateData.as_position_text = null;
          if (updateData.as_organization === undefined)
            updateData.as_organization = null;
          if (updateData.as_organization_text === undefined)
            updateData.as_organization_text = null;
          if (updateData.as_area === undefined) updateData.as_area = null;
          if (updateData.as_area_text === undefined)
            updateData.as_area_text = null;
          if (updateData.as_sub_area === undefined)
            updateData.as_sub_area = null;
          if (updateData.as_sub_area_text === undefined)
            updateData.as_sub_area_text = null;
        }
      }
    }

    // Keep as_name synchronized when as_persnum changes.
    if (updateData.as_persnum !== undefined) {
      const currentAsPersnum = delegasi.as_persnum
        ? String(delegasi.as_persnum)
        : '';
      const nextAsPersnum = updateData.as_persnum
        ? String(updateData.as_persnum)
        : '';
      const isAsPersnumChanged = currentAsPersnum !== nextAsPersnum;

      if (isAsPersnumChanged) {
        if (nextAsPersnum) {
          const resolvedAsName =
            await this.resolvePersonNameByPersnum(nextAsPersnum);
          if (resolvedAsName) {
            updateData.as_name = resolvedAsName;
          } else if (updateData.as_name === undefined) {
            // Avoid returning stale name when persnum changes but lookup fails.
            updateData.as_name = null;
          }
        } else if (updateData.as_name === undefined) {
          updateData.as_name = null;
        }
      }
    }

    // Manually update fields
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined) {
        delegasi[key] = updateData[key];
      }
    });

    const saved = await this.delegasiRepository.save(delegasi);
    this.notifyDelegasi(saved, 'delegate', 'Delegasi diperbarui').catch(
      (error) =>
        console.warn(
          '[DelegasiService] Failed to send update notification:',
          error?.message,
        ),
    );

    // Integrasi organization_tu: sync record jika position_status === SE.
    if (saved.position_status === PositionStatus.SE && saved.as_persnum) {
      this.organizationTuService
        .updateFromDelegasi(saved.id, {
          persnum: Number(saved.as_persnum),
          area_id: saved.as_area ?? null,
          organization_id: saved.as_organization
            ? String(saved.as_organization)
            : null,
          sub_area_id: saved.as_sub_area ? String(saved.as_sub_area) : null,
          valid_from: this.toDateStr(saved.start_date),
          valid_to: saved.end_date ? this.toDateStr(saved.end_date) : null,
          updated_by: saved.persnum ? Number(saved.persnum) : null,
        })
        .catch((error) =>
          console.warn(
            '[DelegasiService] Failed to sync organization_tu on update:',
            error?.message,
          ),
        );
    }

    return this.addStatus(saved);
  }

  /**
   * Remove delegasi
   */
  async remove(id: string): Promise<{ message: string }> {
    const delegasi = await this.delegasiRepository.findOne({ where: { id } });

    if (!delegasi) {
      throw new NotFoundException('Delegasi tidak ditemukan');
    }

    // Integrasi organization_tu: deactivate record jika delegasi SE dihapus.
    if (delegasi.position_status === PositionStatus.SE) {
      this.organizationTuService
        .deactivateFromDelegasi(delegasi.id)
        .catch((error) =>
          console.warn(
            '[DelegasiService] Failed to deactivate organization_tu on remove:',
            error?.message,
          ),
        );
    }

    await this.delegasiRepository.remove(delegasi);
    this.notifyDelegasi(
      delegasi,
      'owner',
      'Delegasi dihapus',
      `Delegasi untuk ${delegasi.as_name || delegasi.as_position_text || 'personil'} telah dihapus`,
    ).catch((error) =>
      console.warn(
        '[DelegasiService] Failed to send remove notification:',
        error?.message,
      ),
    );
    return {
      message: `Delegasi untuk ${delegasi.name || 'personil'} berhasil dihapus`,
    };
  }

  /**
   * Get available position statuses for delegation
   */
  getPositionStatuses(): { value: PositionStatus; label: string }[] {
    return getDelegablePositionStatuses().map((status) => ({
      value: status,
      label: POSITION_STATUS_LABELS[status],
    }));
  }

  /**
   * Check if a person has active delegation for a specific position
   */
  async hasActiveDelegation(
    persnum: string,
    as_position: string,
  ): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const count = await this.delegasiRepository
      .createQueryBuilder('d')
      .where('d.persnum = :persnum', { persnum })
      .andWhere('d.as_position = :as_position', { as_position })
      .andWhere('d.start_date <= :today', { today: todayStr })
      .andWhere('d.end_date >= :today', { today: todayStr })
      .getCount();

    return count > 0;
  }

  /**
   * Get delegation statistics
   */
  async getStatistics(company?: string): Promise<{
    total: number;
    aktif: number;
    tidak_aktif: number;
    kedaluwarsa: number;
    by_position_status: Record<string, number>;
  }> {
    const qb = this.delegasiRepository.createQueryBuilder('d');

    if (company) {
      qb.where('d.company = :company', { company });
    }

    const all = await qb.getMany();
    const withStatus = all.map((d) => this.addStatus(d));

    const statistics = {
      total: all.length,
      aktif: withStatus.filter((d) => d.status.code === 'aktif').length,
      tidak_aktif: withStatus.filter((d) => d.status.code === 'tidak_aktif')
        .length,
      kedaluwarsa: withStatus.filter((d) => d.status.code === 'kedaluwarsa')
        .length,
      by_position_status: {} as Record<string, number>,
    };

    // Count by position status
    for (const d of all) {
      if (d.position_status) {
        statistics.by_position_status[d.position_status] =
          (statistics.by_position_status[d.position_status] || 0) + 1;
      }
    }

    return statistics;
  }

  /**
   * Get available roles for user profile switch
   * Returns all active delegations where current user RECEIVES delegation (as_persnum)
   * Used in profile dropdown to switch between roles
   */
  async getAvailableRoles(persnum: string): Promise<{
    delegations: Array<{
      id: string;
      // Role yang didelegasikan kepada user
      delegated_role: {
        position_status: PositionStatus;
        position_status_label: string;
        description: string; // Deskripsi singkat role
        persnum: string; // Persnum penerima delegasi
        name: string; // Nama penerima delegasi
        position: string;
        position_text: string;
        organization: string;
        organization_text: string;
        area: string;
        area_text: string;
        sub_area: string;
        sub_area_text: string;
        company: string;
        company_text: string;
        bod_tag: string | null;
      };
      // Info orang yang memberi delegasi (pemilik jabatan asli)
      delegated_from: {
        persnum: string;
        name: string;
        position: string;
        position_text: string;
      };
      // Periode delegasi
      period: {
        start_date: Date;
        end_date: Date;
      };
    }>;
  }> {
    // Use local date (Asia/Jakarta timezone) instead of UTC
    const now = new Date();
    const localDate = new Date(now.getTime() + 7 * 60 * 60 * 1000); // UTC+7
    const todayStr = localDate.toISOString().split('T')[0];

    console.log(
      '[getAvailableRoles] Searching for persnum:',
      persnum,
      'today:',
      todayStr,
    );

    // Get all active delegations where current user RECEIVES delegation (as_persnum)
    const activeDelegations = await this.delegasiRepository
      .createQueryBuilder('d')
      .where('d.as_persnum = :persnum', { persnum })
      .andWhere('d.start_date <= :today', { today: todayStr })
      .andWhere('d.end_date >= :today', { today: todayStr })
      .orderBy('d.position_status', 'ASC')
      .addOrderBy('d.as_position_text', 'ASC')
      .getMany();

    console.log(
      '[getAvailableRoles] Active delegations found:',
      activeDelegations.length,
    );

    // Lookup bod_tag from org_data position_json
    let positionJsonData: PositionData[] = [];
    try {
      const today = new Date().toISOString().split('T')[0];
      const orgData = await this.orgDataService.findOrg(today);
      if (orgData && orgData.position_json) {
        positionJsonData = orgData.position_json as PositionData[];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        '[getAvailableRoles] Failed to fetch org_data for bod_tag:',
        message,
      );
    }

    const delegations = activeDelegations.map((d) => {
      const positionStatusLabel =
        POSITION_STATUS_LABELS[d.position_status] || d.position_status;

      // Find bod_tag for as_position from position_json
      const posMatch = positionJsonData.find(
        (p) => String(p.position) === String(d.as_position),
      );
      const bodTag = posMatch?.bod_tag ?? null;

      return {
        id: d.id,
        // Role yang didelegasikan kepada user (yang bisa dipakai)
        delegated_role: {
          position_status: d.position_status,
          position_status_label: positionStatusLabel,
          description: `Anda bertindak sebagai ${positionStatusLabel} untuk jabatan ${d.as_position_text}`,
          persnum: d.as_persnum,
          name: d.as_name,
          position: d.as_position,
          position_text: d.as_position_text,
          organization: d.as_organization,
          organization_text: d.as_organization_text,
          area: d.as_area,
          area_text: d.as_area_text,
          sub_area: d.as_sub_area,
          sub_area_text: d.as_sub_area_text,
          company: d.company,
          company_text: d.company_text,
          bod_tag: bodTag,
        },
        // Info orang yang memberi delegasi (pemilik jabatan asli)
        delegated_from: {
          persnum: d.persnum,
          name: d.name,
          position: d.position,
          position_text: d.position_text,
        },
        // Periode delegasi
        period: {
          start_date: d.start_date,
          end_date: d.end_date,
        },
      };
    });

    return { delegations };
  }

  /**
   * Switch role - Activate a delegated role or switch back to original role
   * @param persnum - Persnum of the user
   * @param delegasiId - ID of delegation to activate (optional)
   * @param position - Position to activate (optional)
   * @param positionStatus - Position status to activate (optional)
   * @param resetToOriginal - Set true to reset to original role (YBS)
   * @returns Delegation info if switching to delegated role, or null if reset to original
   */
  async getDelegationForRoleSwitch(
    persnum: string,
    delegasiId?: string,
    position?: string,
    positionStatus?: PositionStatus,
    resetToOriginal = false,
  ): Promise<DelegasiWithStatus | null> {
    // If reset to original, return null (caller will use original org_data)
    if (resetToOriginal) {
      return null;
    }

    // Validate input
    if (!delegasiId && !position && !positionStatus) {
      throw new BadRequestException(
        'Harus menyediakan delegasiId atau position/positionStatus untuk switch role',
      );
    }

    // Use local date (Asia/Jakarta timezone) instead of UTC
    const now = new Date();
    const localDate = new Date(now.getTime() + 7 * 60 * 60 * 1000); // UTC+7
    const todayStr = localDate.toISOString().split('T')[0];

    let delegasi: DelegasiEntity | null = null;

    if (delegasiId) {
      // Find by delegation ID
      delegasi = await this.delegasiRepository
        .createQueryBuilder('d')
        .where('d.id = :delegasiId', { delegasiId })
        .andWhere('d.as_persnum = :persnum', { persnum })
        .andWhere('d.start_date <= :today', { today: todayStr })
        .andWhere('d.end_date >= :today', { today: todayStr })
        .getOne();

      if (!delegasi) {
        throw new NotFoundException(
          'Delegasi tidak ditemukan atau tidak aktif untuk user ini',
        );
      }
    } else {
      // Find by position and position_status
      const qb = this.delegasiRepository
        .createQueryBuilder('d')
        .where('d.as_persnum = :persnum', { persnum })
        .andWhere('d.start_date <= :today', { today: todayStr })
        .andWhere('d.end_date >= :today', { today: todayStr });

      if (position) {
        qb.andWhere('d.as_position = :position', { position });
      }

      if (positionStatus) {
        qb.andWhere('d.position_status = :positionStatus', { positionStatus });
      }

      delegasi = await qb.getOne();

      if (!delegasi) {
        throw new NotFoundException(
          'Delegasi tidak ditemukan atau tidak aktif untuk position ini',
        );
      }
    }

    return this.addStatus(delegasi);
  }
}
