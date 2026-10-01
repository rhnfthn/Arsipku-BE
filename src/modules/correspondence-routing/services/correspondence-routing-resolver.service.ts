import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { CorrespondenceRoutingRole as Role } from '../entities/correspondence-routing-role.entity';
import { CorrespondenceRoutingRoleMember as Member } from '../entities/correspondence-routing-role-member.entity';
import { CorrespondenceRoutingRule as Rule } from '../entities/correspondence-routing-rule.entity';
import { CorrespondenceRoutingRuleScope as Scope } from '../entities/correspondence-routing-rule-scope.entity';
import { RoutingPreviewDto } from '../dto/routing-preview.dto';
import { RoutingConfigCacheService } from './routing-config-cache.service';
import { matchesScopes, RoutingPosition } from './routing-config-validation';
import { CorrespondenceAccessService } from './correspondence-access.service';
import type { CorrespondenceDocumentType } from '../entities/correspondence-access-policy.entity';

export type RoutingDocumentType = 'DI' | 'SDI';
export type RoutingActionType = 'CREATE' | 'FORWARD';

export interface RoutingWarning {
  code:
    | 'FEATURE_DISABLED'
    | 'VACANT_POSITION'
    | 'NO_TARGET'
    | 'INVALID_SNAPSHOT'
    | 'RULE_NOT_ACTIVE';
  message: string;
  positionId?: number;
  ruleId?: string;
}

export interface RoutingTargetMetadata {
  routingSource: 'structural' | 'configured';
  routingRuleIds: string[];
  effect: 'ALLOW_SELECT' | 'AUTO_INCLUDE';
  mandatory: boolean;
}

export type ResolvedPosition = RoutingPosition & {
  routing_source?: 'structural' | 'configured';
  routing_rule_ids?: string[];
  routing_effect?: 'ALLOW_SELECT' | 'AUTO_INCLUDE';
  routing_mandatory?: boolean;
};

export interface EffectiveRoutingPlan {
  sender: ResolvedPosition;
  structuralRecipients: ResolvedPosition[];
  structuralCc: ResolvedPosition[];
  configuredRecipients: ResolvedPosition[];
  mandatoryCc: ResolvedPosition[];
  effectiveRecipients: ResolvedPosition[];
  selectableRecipients: ResolvedPosition[];
  warnings: RoutingWarning[];
  matchedRuleIds: string[];
  metadataByPositionId: Record<number, RoutingTargetMetadata>;
  summary: {
    structural: number;
    configured: number;
    mandatoryCc: number;
    vacant: number;
    invalid: number;
  };
}

export interface RoutingCapabilities {
  feature_enabled: boolean;
  can_create_sdi: boolean;
  matched_role_codes: string[];
  matched_rule_ids: string[];
  access: Record<CorrespondenceDocumentType, boolean>;
  configured_document_types: CorrespondenceDocumentType[];
  profile: {
    bod_tag: string;
    chief: number;
    area: string;
    area_text: string;
  };
}

interface RoutingInput {
  company: number;
  documentType: RoutingDocumentType;
  actionType: RoutingActionType;
  senderPositionId: number;
  effectiveDate?: string;
  structuralRecipients?: RoutingPosition[];
  structuralCc?: RoutingPosition[];
  includeInactiveRuleId?: string;
}

interface RoutingConfigSnapshot {
  roles: Role[];
  members: Member[];
  rules: Rule[];
  scopesByRule: Record<string, Scope[]>;
}

@Injectable()
export class CorrespondenceRoutingResolverService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Member)
    private readonly memberRepo: Repository<Member>,
    @InjectRepository(Rule)
    private readonly ruleRepo: Repository<Rule>,
    @InjectRepository(Scope)
    private readonly scopeRepo: Repository<Scope>,
    private readonly org: OrgDataService,
    private readonly cache: RoutingConfigCacheService,
    private readonly accessService: CorrespondenceAccessService,
  ) {}

  async preview(dto: RoutingPreviewDto): Promise<EffectiveRoutingPlan> {
    return this.resolve({
      company: dto.company,
      documentType: dto.documentType,
      actionType: dto.actionType,
      senderPositionId: dto.senderPositionId,
      effectiveDate: dto.effectiveDate,
      structuralRecipients: dto.structuralRecipients as
        | RoutingPosition[]
        | undefined,
      structuralCc: dto.structuralCc as RoutingPosition[] | undefined,
      includeInactiveRuleId: dto.includeInactiveRuleId,
    });
  }

  async getCapabilities(
    companyInput: string | number,
    positionInput: string | number,
  ): Promise<RoutingCapabilities> {
    const company = Number(companyInput);
    const positionId = Number(positionInput);
    if (!Number.isInteger(company) || company <= 0)
      throw new BadRequestException('Company user tidak valid');
    if (!Number.isInteger(positionId) || positionId <= 0)
      throw new BadRequestException('Position user tidak valid');

    const accessCapabilities = await this.accessService.capabilities(
      company,
      positionId,
    );
    const routingEnabled =
      process.env.CORRESPONDENCE_ROUTING_ENABLED === 'true';
    if (!routingEnabled) {
      return {
        feature_enabled: false,
        can_create_sdi: accessCapabilities.access.SDI,
        matched_role_codes: [],
        matched_rule_ids: [],
        ...accessCapabilities,
      };
    }

    const effectiveDate = new Date().toISOString().slice(0, 10);
    const config = await this.loadConfig(
      company,
      'SDI',
      'CREATE',
      effectiveDate,
    );
    // SDI access is unlocked by ANY functional role whose effective members
    // include this position AND that sources an active SDI CREATE PENERIMA
    // rule (e.g. MANAGER_OPERASI and DGM_PEO). Role codes must stay data-driven;
    // hardcoding them here silently blocks new business roles (UAT-E).
    const senderRoles = config.roles.filter((role) =>
      config.members.some(
        (member) =>
          member.role_id === role.id &&
          Number(member.position_id) === positionId &&
          this.effective(member, effectiveDate),
      ),
    );
    const senderRoleIds = new Set(senderRoles.map((role) => role.id));
    const primaryRules = config.rules.filter(
      (rule) =>
        senderRoleIds.has(rule.source_role_id) &&
        rule.delivery_type === 'PENERIMA',
    );

    const routingAllowsSdi = senderRoles.length > 0 && primaryRules.length > 0;
    if (!accessCapabilities.configured_document_types.includes('SDI')) {
      accessCapabilities.access.SDI =
        accessCapabilities.access.SDI || routingAllowsSdi;
    }

    return {
      feature_enabled: true,
      can_create_sdi: accessCapabilities.access.SDI,
      matched_role_codes: senderRoles.map((role) => role.code).sort(),
      matched_rule_ids: primaryRules.map((rule) => rule.id).sort(),
      ...accessCapabilities,
    };
  }

  async resolve(input: RoutingInput): Promise<EffectiveRoutingPlan> {
    const structuralRecipients = this.normalizePositions(
      input.structuralRecipients ?? [],
      'structural recipient',
    );
    const structuralCc = this.normalizePositions(
      input.structuralCc ?? [],
      'structural tembusan',
    );
    const senderPositionId = Number(input.senderPositionId);
    if (!Number.isInteger(senderPositionId) || senderPositionId <= 0)
      throw new BadRequestException('senderPositionId tidak valid');

    const effectiveDate =
      input.effectiveDate ?? new Date().toISOString().slice(0, 10);
    const orgService = this.org as unknown as Partial<
      Pick<
        OrgDataService,
        'findPositionSnapshot' | 'findLatestPositionSnapshot' | 'findOrg'
      >
    > &
      Pick<OrgDataService, 'findLatestOrg'>;
    let snapshot =
      typeof orgService.findPositionSnapshot === 'function'
        ? await orgService.findPositionSnapshot(effectiveDate).catch(() => null)
        : typeof orgService.findOrg === 'function'
          ? await orgService.findOrg(effectiveDate).catch(() => null)
          : null;
    if (!snapshot)
      snapshot =
        typeof orgService.findLatestPositionSnapshot === 'function'
          ? await orgService.findLatestPositionSnapshot()
          : await this.org.findLatestOrg();
    if (!snapshot || !Array.isArray(snapshot.position_json))
      throw new ServiceUnavailableException(
        'Snapshot organisasi tidak tersedia',
      );
    const positions = snapshot.position_json as RoutingPosition[];
    const positionById = new Map(
      positions
        .filter(
          (position) => Number(position.company) === Number(input.company),
        )
        .map((position) => [Number(position.position), position]),
    );
    const sender = positionById.get(senderPositionId);
    if (!sender)
      throw new ConflictException(
        'Sender tidak ditemukan pada company/snapshot organisasi',
      );

    const base = this.basePlan(sender, structuralRecipients, structuralCc);
    if (process.env.CORRESPONDENCE_ROUTING_ENABLED !== 'true') {
      base.warnings.push({
        code: 'FEATURE_DISABLED',
        message:
          'Routing konfigurasi nonaktif; hanya structural routing digunakan',
      });
      return this.finalizePlan(base);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))
      throw new BadRequestException('effectiveDate harus YYYY-MM-DD');
    const config = await this.loadConfig(
      input.company,
      input.documentType,
      input.actionType,
      effectiveDate,
      input.includeInactiveRuleId,
    );
    const sourceRoles = config.roles.filter((role) =>
      config.members.some(
        (member) =>
          member.role_id === role.id &&
          Number(member.position_id) === senderPositionId &&
          this.effective(member, effectiveDate),
      ),
    );
    const matchedRules = config.rules.filter((rule) =>
      sourceRoles.some((role) => role.id === rule.source_role_id),
    );
    const configured = new Map<number, ResolvedPosition>();
    const mandatoryCc = new Map<number, ResolvedPosition>();
    const matchedRuleIds = new Set<string>();
    for (const rule of matchedRules) {
      const scopes = config.scopesByRule[rule.id] ?? [];
      const targetMembers = config.members.filter(
        (member) =>
          member.role_id === rule.target_role_id &&
          this.effective(member, effectiveDate),
      );
      let foundTarget = false;
      for (const member of targetMembers) {
        const target = positionById.get(Number(member.position_id));
        if (!target || Number(target.position) === senderPositionId) continue;
        if (!this.matchesRule(rule, sender, target, scopes)) continue;
        foundTarget = true;
        matchedRuleIds.add(rule.id);
        const targetWithMetadata = this.decorate(target, {
          routingSource: 'configured',
          routingRuleIds: [rule.id],
          effect: rule.effect,
          mandatory: Boolean(rule.mandatory),
        });
        const destination =
          rule.delivery_type === 'TEMBUSAN' && rule.mandatory
            ? mandatoryCc
            : configured;
        const previous = destination.get(Number(target.position));
        destination.set(
          Number(target.position),
          previous
            ? this.mergeMetadata(previous, targetWithMetadata)
            : targetWithMetadata,
        );
        if (!target.persnum_person)
          base.warnings.push({
            code: 'VACANT_POSITION',
            message: `Position ${target.position} belum terisi`,
            positionId: Number(target.position),
            ruleId: rule.id,
          });
      }
      if (!foundTarget)
        base.warnings.push({
          code: 'NO_TARGET',
          message: `Rule ${rule.code} tidak memiliki target efektif`,
          ruleId: rule.id,
        });
    }
    base.configuredRecipients = [...configured.values()].sort((a, b) =>
      this.positionSort(a, b),
    );
    base.mandatoryCc = [...mandatoryCc.values()].sort((a, b) =>
      this.positionSort(a, b),
    );
    base.matchedRuleIds = [...matchedRuleIds].sort();
    for (const item of [...base.configuredRecipients, ...base.mandatoryCc]) {
      const positionId = Number(item.position);
      const metadata = this.metadata(item);
      const existing = base.metadataByPositionId[positionId];
      base.metadataByPositionId[positionId] = existing
        ? this.mergeTargetMetadata(existing, metadata)
        : metadata;
    }
    return this.finalizePlan(base);
  }

  private async loadConfig(
    company: number,
    documentType: RoutingDocumentType,
    actionType: RoutingActionType,
    effectiveDate: string,
    includeInactiveRuleId?: string,
  ): Promise<RoutingConfigSnapshot> {
    const key = `routing:${company}:${documentType}:${actionType}:${effectiveDate}:${includeInactiveRuleId ?? 'active'}`;
    const generation = this.cache.state().generation;
    const cached = this.cache.get<RoutingConfigSnapshot>(key);
    if (cached) return cached;
    const roles = await this.roleRepo.find({
      where: { company, is_active: 1 },
    });
    const activePeriod = (action: Rule['action_type']) => [
      {
        company,
        document_type: documentType,
        action_type: action,
        is_active: 1,
        valid_from: LessThanOrEqual(effectiveDate),
        valid_to: IsNull(),
      },
      {
        company,
        document_type: documentType,
        action_type: action,
        is_active: 1,
        valid_from: LessThanOrEqual(effectiveDate),
        valid_to: MoreThanOrEqual(effectiveDate),
      },
    ];
    const rules = await this.ruleRepo.find({
      where: [...activePeriod(actionType), ...activePeriod('BOTH')],
    });
    if (includeInactiveRuleId) {
      const inactive = await this.ruleRepo.findOneBy({
        id: includeInactiveRuleId,
      });
      const actionMatches =
        inactive &&
        (inactive.action_type === actionType ||
          inactive.action_type === 'BOTH');
      if (
        inactive &&
        !inactive.is_active &&
        inactive.company === company &&
        inactive.document_type === documentType &&
        actionMatches
      )
        rules.push(inactive);
    }
    const roleIds = roles.map((role) => role.id);
    const members = roleIds.length
      ? await this.memberRepo.find({
          where: { role_id: In(roleIds), is_active: 1 },
        })
      : [];
    const ruleIds = rules.map((rule) => rule.id);
    const scopeRows = ruleIds.length
      ? await this.scopeRepo.find({ where: { rule_id: In(ruleIds) } })
      : [];
    const scopesByRule: Record<string, Scope[]> = {};
    for (const scope of scopeRows)
      (scopesByRule[scope.rule_id] ??= []).push(scope);
    const result = { roles, members, rules, scopesByRule };
    this.cache.set(key, result, generation);
    return result;
  }

  private basePlan(
    sender: RoutingPosition,
    structuralRecipients: ResolvedPosition[],
    structuralCc: ResolvedPosition[],
  ): EffectiveRoutingPlan {
    const senderWithMetadata = this.decorate(sender, {
      routingSource: 'structural',
      routingRuleIds: [],
      effect: 'ALLOW_SELECT',
      mandatory: false,
    });
    const structural = structuralRecipients.filter(
      (item, index, all) =>
        Number(item.position) !== Number(sender.position) &&
        all.findIndex(
          (candidate) => Number(candidate.position) === Number(item.position),
        ) === index,
    );
    return {
      sender: senderWithMetadata,
      structuralRecipients: structural,
      structuralCc,
      configuredRecipients: [],
      mandatoryCc: [],
      effectiveRecipients: [],
      selectableRecipients: [],
      warnings: [],
      matchedRuleIds: [],
      metadataByPositionId: Object.fromEntries(
        structural.map((item) => [Number(item.position), this.metadata(item)]),
      ),
      summary: {
        structural: 0,
        configured: 0,
        mandatoryCc: 0,
        vacant: 0,
        invalid: 0,
      },
    };
  }

  private finalizePlan(plan: EffectiveRoutingPlan): EffectiveRoutingPlan {
    const primary = new Map<number, ResolvedPosition>();
    for (const item of plan.structuralRecipients)
      primary.set(Number(item.position), item);
    for (const item of plan.configuredRecipients)
      if (!primary.has(Number(item.position)))
        primary.set(Number(item.position), item);
    plan.effectiveRecipients = [...primary.values()];
    const primaryIds = new Set(
      plan.effectiveRecipients.map((item) => Number(item.position)),
    );
    plan.mandatoryCc = plan.mandatoryCc.filter(
      (item) => !primaryIds.has(Number(item.position)),
    );
    plan.selectableRecipients = [...plan.effectiveRecipients];
    for (const item of plan.effectiveRecipients) {
      const positionId = Number(item.position);
      const existing = plan.metadataByPositionId[positionId];
      // Keep configured provenance when a configured target is already present
      // in the structural list; the position remains deduplicated once.
      if (existing?.routingSource === 'configured') continue;
      plan.metadataByPositionId[positionId] = this.metadata(item);
    }
    plan.summary = {
      structural: plan.structuralRecipients.length,
      configured: plan.configuredRecipients.filter(
        (item) =>
          !plan.structuralRecipients.some(
            (structural) =>
              Number(structural.position) === Number(item.position),
          ),
      ).length,
      mandatoryCc: plan.mandatoryCc.length,
      vacant: [...plan.effectiveRecipients, ...plan.mandatoryCc].filter(
        (item) => !item.persnum_person,
      ).length,
      invalid: plan.warnings.filter(
        (warning) => warning.code === 'INVALID_SNAPSHOT',
      ).length,
    };
    return plan;
  }

  private matchesRule(
    rule: Rule,
    sender: RoutingPosition,
    target: RoutingPosition,
    scopes: Scope[],
  ) {
    if (
      !matchesScopes(sender, 'SOURCE', scopes) ||
      !matchesScopes(target, 'TARGET', scopes)
    )
      return false;
    // Mandatory SDI copies for GM/DGM use this scope so the recipient is the
    // official in the sender's area, never every member of the functional role.
    if (rule.scope_type === 'SAME_AREA')
      return sender.area != null && sender.area === target.area;
    if (rule.scope_type === 'SAME_SUB_AREA')
      return sender.sub_area != null && sender.sub_area === target.sub_area;
    if (
      rule.scope_type === 'EXPLICIT' &&
      !scopes.some((scope) => scope.include_flag)
    )
      return false;
    return rule.scope_type === 'ALL' || rule.scope_type === 'EXPLICIT';
  }

  private effective(member: Member, date: string) {
    return (
      member.valid_from <= date && (!member.valid_to || member.valid_to >= date)
    );
  }

  private normalizePositions(
    input: RoutingPosition[],
    label: string,
  ): ResolvedPosition[] {
    return input.map((position) => {
      const id = Number(position.position);
      if (!Number.isInteger(id) || id <= 0)
        throw new BadRequestException(`${label} position tidak valid`);
      return { ...position, position: id };
    });
  }

  private decorate(
    position: RoutingPosition,
    metadata: RoutingTargetMetadata,
  ): ResolvedPosition {
    return {
      ...position,
      routing_source: metadata.routingSource,
      routing_rule_ids: [...metadata.routingRuleIds],
      routing_effect: metadata.effect,
      routing_mandatory: metadata.mandatory,
    };
  }

  private mergeMetadata(
    a: ResolvedPosition,
    b: ResolvedPosition,
  ): ResolvedPosition {
    return {
      ...a,
      routing_rule_ids: [
        ...new Set([
          ...(a.routing_rule_ids ?? []),
          ...(b.routing_rule_ids ?? []),
        ]),
      ].sort(),
      routing_mandatory: Boolean(a.routing_mandatory || b.routing_mandatory),
    };
  }

  private metadata(position: ResolvedPosition): RoutingTargetMetadata {
    return {
      routingSource: position.routing_source ?? 'structural',
      routingRuleIds: position.routing_rule_ids ?? [],
      effect: position.routing_effect ?? 'ALLOW_SELECT',
      mandatory: Boolean(position.routing_mandatory),
    };
  }

  private mergeTargetMetadata(
    a: RoutingTargetMetadata,
    b: RoutingTargetMetadata,
  ): RoutingTargetMetadata {
    return {
      routingSource:
        a.routingSource === 'configured' || b.routingSource === 'configured'
          ? 'configured'
          : 'structural',
      routingRuleIds: [
        ...new Set([...a.routingRuleIds, ...b.routingRuleIds]),
      ].sort(),
      effect: a.mandatory || b.mandatory ? 'AUTO_INCLUDE' : a.effect,
      mandatory: Boolean(a.mandatory || b.mandatory),
    };
  }

  private positionSort(a: RoutingPosition, b: RoutingPosition) {
    return Number(a.position) - Number(b.position);
  }
}
