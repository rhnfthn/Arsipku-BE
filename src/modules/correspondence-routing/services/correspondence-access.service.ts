import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import {
  CORRESPONDENCE_DOCUMENT_TYPES,
  CorrespondenceAccessPolicy,
  CorrespondenceDocumentType,
} from '../entities/correspondence-access-policy.entity';
import { UpdateCorrespondenceAccessDto } from '../dto/correspondence-access.dto';
import { RoutingConfigCacheService } from './routing-config-cache.service';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';

type AccessPosition = {
  position: number | string;
  company?: number | string;
  bod_tag?: string | null;
  chief?: number | string | null;
  area?: string | null;
  area_text?: string | null;
};

@Injectable()
export class CorrespondenceAccessService {
  constructor(
    @InjectRepository(CorrespondenceAccessPolicy)
    private readonly repo: Repository<CorrespondenceAccessPolicy>,
    private readonly orgDataService: OrgDataService,
    private readonly cache: RoutingConfigCacheService,
    @Optional() private readonly realtime?: RealtimeEmitService,
  ) {}

  async list(company: number) {
    this.assertCompany(company);
    const policies = await this.repo.find({
      where: { company },
      order: { document_type: 'ASC' },
    });
    const org = await this.orgDataService.findLatestOrg();
    const positions = (org?.position_json ?? []) as AccessPosition[];
    const areaMap = new Map<string, string>();
    for (const position of positions) {
      if (Number(position.company) !== Number(company) || !position.area)
        continue;
      areaMap.set(
        String(position.area),
        position.area_text || String(position.area),
      );
    }
    return {
      policies,
      document_types: [...CORRESPONDENCE_DOCUMENT_TYPES],
      bod_tags: [
        ...new Set(
          positions
            .filter((position) => Number(position.company) === Number(company))
            .map((position) => String(position.bod_tag || 'NONE')),
        ),
      ].sort(),
      areas: [...areaMap.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'id')),
    };
  }

  async upsert(company: number, dto: UpdateCorrespondenceAccessDto) {
    this.assertCompany(company);
    if (dto.area_mode === 'SELECTED' && dto.area_ids.length === 0) {
      throw new BadRequestException(
        'Minimal satu area harus dipilih untuk mode area terpilih',
      );
    }
    let policy = await this.repo.findOneBy({
      company,
      document_type: dto.document_type,
    });
    if (!policy) {
      policy = this.repo.create({ id: uuidv4(), company });
    }
    Object.assign(policy, {
      document_type: dto.document_type,
      bod_tags: dto.bod_tags.length ? dto.bod_tags : null,
      chief_values: dto.chief_values.length ? dto.chief_values : null,
      area_mode: dto.area_mode,
      area_ids: dto.area_mode === 'SELECTED' ? dto.area_ids : null,
      is_active: dto.is_active ? 1 : 0,
    });
    const saved = await this.repo.save(policy);
    this.cache.invalidate();
    this.realtime?.emitCorrespondenceRoutingUpdate({
      mutationId: uuidv4(),
      entityType: 'correspondence_access_policy',
      entityId: saved.id,
      action: 'upsert',
      occurredAt: new Date().toISOString(),
    });
    return saved;
  }

  async capabilities(
    companyInput: string | number,
    positionInput: string | number,
  ) {
    const company = Number(companyInput);
    const positionId = Number(positionInput);
    if (!Number.isInteger(company) || !Number.isInteger(positionId)) {
      throw new BadRequestException('Company atau position user tidak valid');
    }
    const org = await this.orgDataService.findLatestOrg();
    const positions = (org?.position_json ?? []) as AccessPosition[];
    const position = positions.find(
      (item) =>
        Number(item.company) === company &&
        Number(item.position) === positionId,
    );
    if (!position) {
      throw new BadRequestException(
        'Position user tidak ditemukan pada org data',
      );
    }
    const policies = await this.repo.find({ where: { company } });
    const policyByDocument = new Map(
      policies.map((policy) => [policy.document_type, policy]),
    );
    const access = Object.fromEntries(
      CORRESPONDENCE_DOCUMENT_TYPES.map((documentType) => {
        const policy = policyByDocument.get(documentType);
        return [
          documentType,
          policy
            ? this.matches(policy, position)
            : this.legacyAccess(documentType, position),
        ];
      }),
    ) as Record<CorrespondenceDocumentType, boolean>;
    return {
      access,
      configured_document_types: policies.map((policy) => policy.document_type),
      profile: {
        bod_tag: position.bod_tag || '',
        chief: Number(position.chief || 0),
        area: position.area || '',
        area_text: position.area_text || '',
      },
    };
  }

  private matches(
    policy: CorrespondenceAccessPolicy,
    position: AccessPosition,
  ) {
    if (!policy.is_active) return false;
    const bodTag = String(position.bod_tag || 'NONE');
    if (policy.bod_tags?.length && !policy.bod_tags.includes(bodTag))
      return false;
    const chief = Number(position.chief || 0);
    if (policy.chief_values?.length && !policy.chief_values.includes(chief)) {
      return false;
    }
    if (
      policy.area_mode === 'SELECTED' &&
      !policy.area_ids?.includes(String(position.area || ''))
    ) {
      return false;
    }
    return true;
  }

  private legacyAccess(
    documentType: CorrespondenceDocumentType,
    position: AccessPosition,
  ) {
    const bodTag = String(position.bod_tag || '');
    if (bodTag === 'BOD' || bodTag === 'BOD-1') return true;
    if (bodTag === 'BOD-2' || bodTag === 'BOD-3') {
      return ['ND', 'DI'].includes(documentType);
    }
    return !bodTag && documentType === 'KA';
  }

  private assertCompany(company: number) {
    if (!Number.isInteger(company) || company <= 0) {
      throw new BadRequestException('Company tidak valid');
    }
  }
}
