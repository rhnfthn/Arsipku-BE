import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  In,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { AuditTrailService } from '../../audit/services/audit-trail.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditModule } from '../../audit/enums/audit-module.enum';
import { CorrespondenceRoutingRole as Role } from '../entities/correspondence-routing-role.entity';
import { CorrespondenceRoutingRoleMember as Member } from '../entities/correspondence-routing-role-member.entity';
import { CorrespondenceRoutingRule as Rule } from '../entities/correspondence-routing-rule.entity';
import { CorrespondenceRoutingRuleScope as Scope } from '../entities/correspondence-routing-rule-scope.entity';
import {
  CreateRoutingRoleDto,
  CreateRoutingRuleDto,
  RoutingListDto,
  RoutingMembersDto,
  UpdateRoutingMemberDto,
  UpdateRoutingRoleDto,
  UpdateRoutingRuleDto,
} from '../dto/routing-admin.dto';
import { RoutingConfigCacheService } from './routing-config-cache.service';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';
import {
  matchesScopes,
  periodsOverlap,
  RoutingPosition,
  scopeValue,
  validatePeriod,
  validateRuleShape,
} from './routing-config-validation';

export interface RoutingAdminActor {
  persnum: number;
}
interface Change<T> {
  value: T;
  before?: unknown;
  after?: unknown;
}
interface RuleValidationContext {
  snapshot: { date: string | null; positions: RoutingPosition[] };
  positionsByCompany: Map<number, RoutingPosition[]>;
  positionByCompanyAndId: Map<number, Map<number, RoutingPosition>>;
  rolesById: Map<string, Role>;
  members: Member[];
  activeRules: Rule[];
  scopesByRule: Map<string, Scope[]>;
}

@Injectable()
export class CorrespondenceRoutingAdminService {
  private readonly logger = new Logger(CorrespondenceRoutingAdminService.name);
  constructor(
    private readonly ds: DataSource,
    private readonly org: OrgDataService,
    private readonly audit: AuditTrailService,
    private readonly cache: RoutingConfigCacheService,
    @Optional() private readonly realtime?: RealtimeEmitService,
  ) {}

  private async mutate<T>(
    actor: RoutingAdminActor,
    entityType: string,
    entityId: string,
    action: string,
    work: (em: EntityManager) => Promise<Change<T>>,
  ) {
    if (!Number.isInteger(actor.persnum) || actor.persnum <= 0)
      throw new ForbiddenException('Identitas admin tidak valid');
    const runner = this.ds.createQueryRunner();
    const mutationId = randomUUID();
    const lock = `cr-admin:${createHash('sha256').update(String(this.ds.options.database)).digest('hex').slice(0, 40)}`;
    let locked = false;
    let value: T;
    await runner.connect();
    try {
      const lockResult: unknown = await runner.query(
        'SELECT GET_LOCK(?, 5) AS acquired',
        [lock],
      );
      const acquired =
        Array.isArray(lockResult) &&
        lockResult[0] &&
        typeof lockResult[0] === 'object'
          ? Number((lockResult[0] as { acquired?: unknown }).acquired)
          : 0;
      if (acquired !== 1)
        throw new ConflictException('Konfigurasi sedang diperbarui; coba lagi');
      locked = true;
      await runner.startTransaction();
      const change = await work(runner.manager);
      // Mongo and MySQL are not one transaction. Persist an explicitly PRE_COMMIT event.
      let recorded: unknown;
      try {
        recorded = await this.audit.create({
          persnum: actor.persnum,
          module: AuditModule.CONFIG,
          action: AuditAction.CONFIG_CHANGE,
          entityType,
          entityId,
          oldValue: change.before,
          newValue: change.after,
          description: `Routing ${action}: prepared, SQL commit unconfirmed`,
          metadata: { mutationId, phase: 'PRE_COMMIT' },
        });
      } catch {
        throw new ServiceUnavailableException(
          'Audit konfigurasi tidak tersedia',
        );
      }
      if (!recorded)
        throw new ServiceUnavailableException(
          'Audit konfigurasi harus aktif sebelum perubahan disimpan',
        );
      await runner.commitTransaction();
      this.cache.invalidate();
      value = change.value;
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new ConflictException(
          'Kode atau periode konfigurasi sudah terdaftar',
        );
      throw error;
    } finally {
      if (locked) await runner.query('SELECT RELEASE_LOCK(?)', [lock]);
      await runner.release();
    }
    let auditStatus = 'confirmed';
    try {
      const confirmation = await this.audit.create({
        persnum: actor.persnum,
        module: AuditModule.CONFIG,
        action: AuditAction.CONFIG_CHANGE,
        entityType,
        entityId,
        description: `Routing ${action}: committed`,
        metadata: { mutationId, phase: 'COMMITTED' },
      });
      if (!confirmation) throw new Error('Audit disabled');
    } catch {
      auditStatus = 'confirmation_pending';
      this.logger.error(`Routing audit confirmation missing: ${mutationId}`);
    }
    this.realtime?.emitCorrespondenceRoutingUpdate({
      mutationId,
      entityType,
      entityId,
      action,
      occurredAt: new Date().toISOString(),
    });
    return { data: value, mutation_id: mutationId, audit_status: auditStatus };
  }

  private async snapshot() {
    const snapshot = await this.org.findLatestPositionSnapshot();
    if (!snapshot || !Array.isArray(snapshot.position_json))
      throw new ServiceUnavailableException(
        'Snapshot organisasi tidak tersedia',
      );
    return {
      date: snapshot.tgl,
      positions: snapshot.position_json as RoutingPosition[],
    };
  }

  private async row<T extends ObjectLiteral>(
    repo: Repository<T>,
    id: string,
  ): Promise<T> {
    const result = await repo.findOneBy({ id } as never);
    if (!result) throw new NotFoundException('Konfigurasi tidak ditemukan');
    return result;
  }

  private async list(repo: Repository<ObjectLiteral>, query: RoutingListDto) {
    const qb = repo.createQueryBuilder('e');
    if (query.company != null)
      qb.andWhere('e.company = :company', { company: query.company });
    if (query.is_active != null)
      qb.andWhere('e.is_active = :active', { active: query.is_active });
    if (query.search)
      qb.andWhere('(e.name LIKE :search OR e.code LIKE :search)', {
        search: `%${query.search}%`,
      });
    const [data, total] = await qb
      .orderBy('e.code', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return { data, total, page: query.page, limit: query.limit };
  }
  listRoles(query: RoutingListDto) {
    return this.list(this.ds.getRepository(Role), query);
  }
  listRules(query: RoutingListDto) {
    return this.list(this.ds.getRepository(Rule), query);
  }
  getRole(id: string) {
    return this.row(this.ds.getRepository(Role), id);
  }
  async getRule(id: string) {
    return {
      ...(await this.row(this.ds.getRepository(Rule), id)),
      scopes: await this.ds
        .getRepository(Scope)
        .find({ where: { rule_id: id }, order: { id: 'ASC' } }),
    };
  }

  createRole(dto: CreateRoutingRoleDto, actor: RoutingAdminActor) {
    const id = randomUUID();
    return this.mutate(actor, 'routing_role', id, 'create', async (em) => {
      const value = await em.getRepository(Role).save({
        ...dto,
        id,
        is_active: 1,
        created_by: actor.persnum,
        updated_by: actor.persnum,
      });
      return { value, after: value };
    });
  }
  updateRole(id: string, dto: UpdateRoutingRoleDto, actor: RoutingAdminActor) {
    return this.mutate(actor, 'routing_role', id, 'update', async (em) => {
      const before = await this.row(em.getRepository(Role), id);
      const value = await em
        .getRepository(Role)
        .save({ ...before, ...dto, updated_by: actor.persnum });
      return { value, before, after: value };
    });
  }
  private async assertRoleEditable(em: EntityManager, id: string) {
    const count = await em
      .getRepository(Rule)
      .createQueryBuilder('r')
      .where('(r.source_role_id = :id OR r.target_role_id = :id)', { id })
      .andWhere('r.is_active = 1')
      .getCount();
    if (count)
      throw new ConflictException(
        'Nonaktifkan rule yang memakai role sebelum mengubah membership/status role',
      );
  }

  private async assertRoleDeletable(em: EntityManager, id: string) {
    const [ruleCount, memberCount] = await Promise.all([
      em
        .getRepository(Rule)
        .createQueryBuilder('r')
        .where('(r.source_role_id = :id OR r.target_role_id = :id)', { id })
        .getCount(),
      em.getRepository(Member).countBy({ role_id: id }),
    ]);
    if (ruleCount || memberCount)
      throw new ConflictException(
        'Hapus seluruh rule dan member pada role sebelum menghapus role',
      );
  }

  toggleRole(id: string, active: boolean, actor: RoutingAdminActor) {
    return this.mutate(actor, 'routing_role', id, 'toggle', async (em) => {
      const before = await this.row(em.getRepository(Role), id);
      if (!active) await this.assertRoleEditable(em, id);
      const value = await em.getRepository(Role).save({
        ...before,
        is_active: Number(active),
        updated_by: actor.persnum,
      });
      return { value, before, after: value };
    });
  }
  deleteRole(id: string, actor: RoutingAdminActor) {
    return this.mutate(actor, 'routing_role', id, 'delete', async (em) => {
      const before = await this.row(em.getRepository(Role), id);
      await this.assertRoleDeletable(em, id);
      await em
        .getRepository(Role)
        .update(id, { is_active: 0, updated_by: actor.persnum });
      await em.getRepository(Role).softDelete(id);
      return { value: { id, deleted: true }, before, after: { deleted: true } };
    });
  }

  async listMembers(roleId: string, query: RoutingListDto) {
    const role = await this.getRole(roleId);
    const snapshot = await this.snapshot();
    const qb = this.ds
      .getRepository(Member)
      .createQueryBuilder('m')
      .where('m.role_id = :roleId', { roleId });
    if (query.is_active != null)
      qb.andWhere('m.is_active = :active', { active: query.is_active });
    const [rows, total] = await qb
      .orderBy('m.position_id', 'ASC')
      .addOrderBy('m.valid_from', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const positionById = new Map(
      snapshot.positions
        .filter((position) => Number(position.company) === role.company)
        .map((position) => [Number(position.position), position]),
    );
    return {
      data: rows.map((m) => {
        const position = positionById.get(m.position_id);
        return {
          ...m,
          position: position ?? null,
          found: !!position,
          vacant: !!position && !position.persnum_person,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
      snapshot_date: snapshot.date,
    };
  }
  private async checkMembers(
    em: EntityManager,
    role: Role,
    proposed: Array<{
      position_id: number;
      valid_from: string;
      valid_to?: string | null;
    }>,
    excludeId?: string,
  ) {
    const { positions } = await this.snapshot();
    const positionById = new Map(
      positions
        .filter((position) => Number(position.company) === role.company)
        .map((position) => [Number(position.position), position]),
    );
    const existing = (
      await em.getRepository(Member).findBy({ role_id: role.id })
    ).filter((m) => m.id !== excludeId);
    const candidates = [...existing];
    const warnings: number[] = [];
    for (const member of proposed) {
      validatePeriod(member.valid_from, member.valid_to);
      const position = positionById.get(member.position_id);
      if (!position)
        throw new BadRequestException(
          `Position ${member.position_id} tidak ada pada company/snapshot role`,
        );
      if (
        candidates.some(
          (m) =>
            m.position_id === member.position_id && periodsOverlap(m, member),
        )
      )
        throw new ConflictException(
          `Periode membership position ${member.position_id} overlap`,
        );
      candidates.push(member as Member);
      if (!position.persnum_person) warnings.push(member.position_id);
    }
    return { valid: true, vacant_position_ids: warnings };
  }
  async validateMembers(roleId: string, dto: RoutingMembersDto) {
    return this.checkMembers(
      this.ds.manager,
      await this.getRole(roleId),
      dto.members,
    );
  }
  addMembers(roleId: string, dto: RoutingMembersDto, actor: RoutingAdminActor) {
    return this.mutate(
      actor,
      'routing_role',
      roleId,
      'add-members',
      async (em) => {
        const role = await this.row(em.getRepository(Role), roleId);
        await this.assertRoleEditable(em, roleId);
        const validation = await this.checkMembers(em, role, dto.members);
        const members = await em.getRepository(Member).save(
          dto.members.map((m) => ({
            ...m,
            id: randomUUID(),
            role_id: roleId,
            is_active: Number(m.is_active ?? true),
            created_by: actor.persnum,
            updated_by: actor.persnum,
          })),
        );
        return { value: { members, ...validation }, after: members };
      },
    );
  }
  updateMember(
    roleId: string,
    id: string,
    dto: UpdateRoutingMemberDto,
    actor: RoutingAdminActor,
  ) {
    return this.mutate(actor, 'routing_member', id, 'update', async (em) => {
      const role = await this.row(em.getRepository(Role), roleId);
      const before = await this.row(em.getRepository(Member), id);
      if (before.role_id !== roleId)
        throw new NotFoundException('Member tidak ditemukan pada role');
      await this.assertRoleEditable(em, roleId);
      const value = {
        ...before,
        ...dto,
        is_active:
          dto.is_active == null ? before.is_active : Number(dto.is_active),
        updated_by: actor.persnum,
      };
      await this.checkMembers(em, role, [value], id);
      await em.getRepository(Member).save(value);
      return { value, before, after: value };
    });
  }
  deleteMember(roleId: string, id: string, actor: RoutingAdminActor) {
    return this.mutate(actor, 'routing_member', id, 'delete', async (em) => {
      await this.row(em.getRepository(Role), roleId);
      const before = await this.row(em.getRepository(Member), id);
      if (before.role_id !== roleId)
        throw new NotFoundException('Member tidak ditemukan pada role');
      await this.assertRoleEditable(em, roleId);
      await em
        .getRepository(Member)
        .update(id, { updated_by: actor.persnum, is_active: 0 });
      await em.getRepository(Member).softDelete(id);
      return { value: { id, deleted: true }, before, after: { deleted: true } };
    });
  }

  private async checkRule(
    em: EntityManager,
    rule: Rule,
    scopes: Scope[],
    activate = false,
    context?: RuleValidationContext,
  ) {
    validateRuleShape(rule, scopes);
    const source =
      context?.rolesById.get(rule.source_role_id) ??
      (await this.row(em.getRepository(Role), rule.source_role_id));
    const target =
      context?.rolesById.get(rule.target_role_id) ??
      (await this.row(em.getRepository(Role), rule.target_role_id));
    if (source.company !== rule.company || target.company !== rule.company)
      throw new BadRequestException('Company rule dan role harus sama');
    const snapshot = context?.snapshot ?? (await this.snapshot());
    const positions =
      context?.positionsByCompany.get(rule.company) ??
      snapshot.positions.filter((p) => Number(p.company) === rule.company);
    for (const scope of scopes)
      if (
        !positions.some(
          (p) => scopeValue(p, scope.entity_type) === scope.entity_id,
        )
      )
        throw new BadRequestException(
          `Scope ${scope.entity_type}:${scope.entity_id} tidak ditemukan pada company`,
        );
    if (!activate) return { valid: true, snapshot_date: snapshot.date };
    if (!source.is_active || !target.is_active)
      throw new ConflictException('Role source/target harus aktif');
    const today = new Date().toISOString().slice(0, 10);
    const date = rule.valid_from > today ? rule.valid_from : today;
    if (rule.valid_to && rule.valid_to < date)
      throw new ConflictException('Rule sudah kedaluwarsa');
    const members = context
      ? context.members.filter(
          (member) =>
            member.role_id === source.id || member.role_id === target.id,
        )
      : await em.getRepository(Member).find({
          where: [
            { role_id: source.id, is_active: 1 },
            { role_id: target.id, is_active: 1 },
          ],
        });
    const resolve = (id: string, side: string) =>
      members
        .filter(
          (m) =>
            m.role_id === id &&
            m.valid_from <= date &&
            (!m.valid_to || m.valid_to >= date),
        )
        .map((m) => {
          const p = context
            ? context.positionByCompanyAndId
                .get(rule.company)
                ?.get(m.position_id)
            : positions.find((x) => Number(x.position) === m.position_id);
          if (!p)
            throw new ConflictException(
              `Position ${m.position_id} tidak ada di snapshot`,
            );
          return p;
        })
        .filter((p) => matchesScopes(p, side, scopes));
    const sources = resolve(source.id, 'SOURCE');
    const targets = resolve(target.id, 'TARGET');
    if (!sources.length || !targets.length)
      throw new ConflictException(
        'Source/target tidak memiliki member efektif dalam scope',
      );
    for (const sender of sources) {
      const eligible = targets.filter(
        (p) =>
          Number(p.position) !== Number(sender.position) &&
          (rule.scope_type !== 'SAME_AREA' ||
            (sender.area != null && p.area === sender.area)) &&
          (rule.scope_type !== 'SAME_SUB_AREA' ||
            (sender.sub_area != null && p.sub_area === sender.sub_area)),
      );
      if (!eligible.length)
        throw new ConflictException(
          `Tidak ada target untuk source ${sender.position}`,
        );
    }
    const others = context
      ? context.activeRules.filter((other) => other.company === rule.company)
      : await em
          .getRepository(Rule)
          .findBy({ company: rule.company, is_active: 1 });
    const shape = (r: Rule) =>
      [
        r.document_type,
        r.source_role_id,
        r.target_role_id,
        r.delivery_type,
        r.effect,
        r.scope_type,
        r.behavior,
        r.mandatory,
      ].join('|');
    const scopeKey = (rows: Scope[]) =>
      rows
        .map(
          (s) =>
            `${s.side}:${s.entity_type}:${s.entity_id}:${Number(s.include_flag)}`,
        )
        .sort()
        .join('|');
    for (const other of others) {
      const actionOverlap =
        other.action_type === rule.action_type ||
        other.action_type === 'BOTH' ||
        rule.action_type === 'BOTH';
      if (
        other.id !== rule.id &&
        actionOverlap &&
        shape(other) === shape(rule) &&
        periodsOverlap(other, rule) &&
        scopeKey(
          context?.scopesByRule.get(other.id) ??
            (await em.getRepository(Scope).findBy({ rule_id: other.id })),
        ) === scopeKey(scopes)
      )
        throw new ConflictException(
          'Rule aktif duplikat dengan periode/aksi overlap',
        );
    }
    return {
      valid: true,
      snapshot_date: snapshot.date,
      effective_date: date,
      source_count: sources.length,
      target_count: targets.length,
      vacant_position_ids: [...sources, ...targets]
        .filter((p) => !p.persnum_person)
        .map((p) => p.position),
    };
  }
  createRule(dto: CreateRoutingRuleDto, actor: RoutingAdminActor) {
    const id = randomUUID();
    return this.mutate(actor, 'routing_rule', id, 'create', async (em) => {
      const { scopes: inputScopes, ...fields } = dto;
      const rule = em.getRepository(Rule).create({
        ...fields,
        id,
        mandatory: Number(dto.mandatory),
        priority: dto.priority ?? 100,
        is_active: 0,
        created_by: actor.persnum,
        updated_by: actor.persnum,
      });
      const scopes = inputScopes.map((s) =>
        em.getRepository(Scope).create({
          ...s,
          id: randomUUID(),
          rule_id: id,
          include_flag: Number(s.include_flag),
        }),
      );
      await this.checkRule(em, rule, scopes);
      await em.getRepository(Rule).save(rule);
      await em.getRepository(Scope).save(scopes);
      return { value: { ...rule, scopes }, after: { ...rule, scopes } };
    });
  }
  updateRule(id: string, dto: UpdateRoutingRuleDto, actor: RoutingAdminActor) {
    return this.mutate(actor, 'routing_rule', id, 'update', async (em) => {
      const before = await this.row(em.getRepository(Rule), id);
      if (before.is_active)
        throw new ConflictException('Nonaktifkan rule sebelum mengedit');
      const oldScopes = await em.getRepository(Scope).findBy({ rule_id: id });
      const { scopes: inputScopes, ...fields } = dto;
      const rule = em.getRepository(Rule).create({
        ...before,
        ...fields,
        mandatory:
          dto.mandatory == null ? before.mandatory : Number(dto.mandatory),
        updated_by: actor.persnum,
      });
      const scopes = inputScopes
        ? inputScopes.map((s) =>
            em.getRepository(Scope).create({
              ...s,
              id: randomUUID(),
              rule_id: id,
              include_flag: Number(s.include_flag),
            }),
          )
        : oldScopes;
      await this.checkRule(em, rule, scopes);
      await em.getRepository(Rule).save(rule);
      if (inputScopes) {
        await em.getRepository(Scope).delete({ rule_id: id });
        await em.getRepository(Scope).save(scopes);
      }
      return {
        value: { ...rule, scopes },
        before: { ...before, scopes: oldScopes },
        after: { ...rule, scopes },
      };
    });
  }
  async validateRule(id: string) {
    const rule = await this.getRule(id);
    return this.checkRule(this.ds.manager, rule, rule.scopes, true);
  }
  toggleRule(id: string, active: boolean, actor: RoutingAdminActor) {
    return this.mutate(actor, 'routing_rule', id, 'toggle', async (em) => {
      const before = await this.row(em.getRepository(Rule), id);
      if (active)
        await this.checkRule(
          em,
          before,
          await em.getRepository(Scope).findBy({ rule_id: id }),
          true,
        );
      const value = await em.getRepository(Rule).save({
        ...before,
        is_active: Number(active),
        updated_by: actor.persnum,
      });
      return { value, before, after: value };
    });
  }
  toggleAllRules(active: boolean, actor: RoutingAdminActor) {
    return this.mutate(
      actor,
      'routing_rule_bulk',
      active ? 'activate-all' : 'deactivate-all',
      'toggle-all',
      async (em) => {
        const [rules, roles, members, scopeRows, snapshot] = await Promise.all([
          em.getRepository(Rule).find({
            order: { priority: 'ASC', code: 'ASC' },
          }),
          em.getRepository(Role).find(),
          em.getRepository(Member).findBy({ is_active: 1 }),
          em.getRepository(Scope).find(),
          this.snapshot(),
        ]);
        const positionsByCompany = new Map<number, RoutingPosition[]>();
        const positionByCompanyAndId = new Map<
          number,
          Map<number, RoutingPosition>
        >();
        for (const position of snapshot.positions) {
          const company = Number(position.company);
          const companyPositions = positionsByCompany.get(company) ?? [];
          companyPositions.push(position);
          positionsByCompany.set(company, companyPositions);
          const companyIndex =
            positionByCompanyAndId.get(company) ??
            new Map<number, RoutingPosition>();
          companyIndex.set(Number(position.position), position);
          positionByCompanyAndId.set(company, companyIndex);
        }
        const scopesByRule = new Map<string, Scope[]>();
        for (const scope of scopeRows) {
          const ruleScopes = scopesByRule.get(scope.rule_id) ?? [];
          ruleScopes.push(scope);
          scopesByRule.set(scope.rule_id, ruleScopes);
        }
        const context: RuleValidationContext = {
          snapshot,
          positionsByCompany,
          positionByCompanyAndId,
          rolesById: new Map(roles.map((role) => [role.id, role])),
          members,
          activeRules: rules.filter((rule) => Boolean(rule.is_active)),
          scopesByRule,
        };
        const pending = rules.filter(
          (rule) => Boolean(rule.is_active) !== active,
        );

        // Validate sequentially in one SQL transaction so duplicate validation
        // sees earlier candidates. Persist all statuses with one bulk update.
        const changedIds: string[] = [];
        for (const rule of pending) {
          if (active) {
            await this.checkRule(
              em,
              rule,
              scopesByRule.get(rule.id) ?? [],
              true,
              context,
            );
            context.activeRules.push({ ...rule, is_active: 1 });
          }
          changedIds.push(rule.id);
        }
        if (changedIds.length)
          await em
            .getRepository(Rule)
            .update(
              { id: In(changedIds) },
              { is_active: Number(active), updated_by: actor.persnum },
            );

        const result = {
          is_active: active,
          changed_count: changedIds.length,
          changed_rule_ids: changedIds,
        };
        return {
          value: result,
          before: { is_active: !active, rule_ids: changedIds },
          after: result,
        };
      },
    );
  }
  deleteRule(id: string, actor: RoutingAdminActor) {
    return this.mutate(actor, 'routing_rule', id, 'delete', async (em) => {
      const before = await this.row(em.getRepository(Rule), id);
      if (before.is_active)
        throw new ConflictException('Nonaktifkan rule sebelum menghapus');
      await em.getRepository(Rule).update(id, { updated_by: actor.persnum });
      await em.getRepository(Rule).softDelete(id);
      return { value: { id, deleted: true }, before, after: { deleted: true } };
    });
  }
  async health() {
    const snapshot = await this.snapshot();
    const [roles, members, rules] = await Promise.all([
      this.ds.getRepository(Role).find(),
      this.ds.getRepository(Member).find(),
      this.ds.getRepository(Rule).find(),
    ]);
    const orphanMembers = members.filter((m) => {
      const role = roles.find((r) => r.id === m.role_id);
      return (
        !role ||
        !snapshot.positions.some(
          (p) =>
            Number(p.position) === m.position_id &&
            Number(p.company) === role.company,
        )
      );
    });
    const ruleIssues: { id: string; message: string }[] = [];
    for (const r of rules.filter((r) => r.is_active)) {
      try {
        await this.checkRule(
          this.ds.manager,
          r,
          await this.ds.getRepository(Scope).findBy({ rule_id: r.id }),
          true,
        );
      } catch (error) {
        ruleIssues.push({
          id: r.id,
          message: error instanceof Error ? error.message : 'Rule invalid',
        });
      }
    }
    return {
      feature_flag_enabled:
        process.env.CORRESPONDENCE_ROUTING_ENABLED === 'true',
      cache: this.cache.state(),
      latest_snapshot_date: snapshot.date,
      active_role_count: roles.filter((r) => r.is_active).length,
      active_rule_count: rules.filter((r) => r.is_active).length,
      orphan_member_ids: orphanMembers.map((m) => m.id),
      rule_issues: ruleIssues,
    };
  }
}
