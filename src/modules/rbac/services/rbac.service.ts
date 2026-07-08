import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  RoleEntity,
  RoleName,
  ResourceEntity,
  PermissionEntity,
  RolePermissionEntity,
  RbacUserRoleEntity,
} from '../entities';
import type { ActivePermission, ActiveRoleInfo } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionCacheService } from '../../../common/guards/permission-cache.service';
import { NotificationGateway } from '../../notification/gateways/notification.gateway';
import { Person } from '../../master-data/person/entities/person.entity';
import { rbacMatrixTree, type MatrixHalaman } from '../seeder/rbac-matrix-data';
import { utamaMatrix } from '../seeder/utama-matrix';
import { utilitasMatrix } from '../seeder/utilitas-matrix';
import { administrasiMatrix } from '../seeder/administrasi-matrix';
import { laporanMatrix } from '../seeder/laporan-matrix';
import { faqMatrix } from '../seeder/faq-matrix';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(ResourceEntity)
    private readonly resourceRepo: Repository<ResourceEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepo: Repository<RolePermissionEntity>,
    @InjectRepository(RbacUserRoleEntity)
    private readonly rbacUserRoleRepo: Repository<RbacUserRoleEntity>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly permissionCache: PermissionCacheService,
    private readonly dataSource: DataSource,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  /**
   * Group flat rolePermissions ke bentuk { resource, actions[] }[]
   */
  groupPermissionsByResource(
    rps: { permission: { action: string; resource: { name: string } } }[],
  ): ActivePermission[] {
    const map = new Map<string, Set<string>>();
    for (const rp of rps) {
      const resName = rp.permission.resource.name;
      if (!map.has(resName)) map.set(resName, new Set());
      map.get(resName)!.add(rp.permission.action);
    }
    return Array.from(map.entries()).map(([resource, actions]) => ({
      resource,
      actions: Array.from(actions),
    }));
  }

  /**
   * Build activeRole + activePermissions + roles[] dari persnum.
   * Jika user tidak punya baris di rbac_user_role → default ke USER.
   */
  async buildActiveRoleAndPermissions(persnum: number): Promise<{
    activeRole: ActiveRoleInfo | null;
    activePermissions: ActivePermission[];
    roles: ActiveRoleInfo[];
    role: 'user' | 'admin' | 'superadmin';
  }> {
    const userRoles = await this.rbacUserRoleRepo.find({
      where: { persnum, active: true },
      relations: ['role', 'role.rolePermissions', 'role.rolePermissions.permission', 'role.rolePermissions.permission.resource'],
    });

    if (userRoles.length === 0) {
      // Default USER
      const userRole = await this.roleRepo.findOne({
        where: { name: RoleName.USER },
        relations: ['rolePermissions', 'rolePermissions.permission', 'rolePermissions.permission.resource'],
      });
      const activePermissions = this.groupPermissionsByResource(
        (userRole?.rolePermissions ?? []) as any,
      );
      const roles: ActiveRoleInfo[] = userRole
        ? [{ id: userRole.id, name: userRole.name }]
        : [];
      return {
        activeRole: userRole ? { id: userRole.id, name: userRole.name } : null,
        activePermissions,
        roles,
        role: 'user',
      };
    }

    const permissionsMap = new Map<string, Set<string>>();
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions ?? []) {
        const resName = rp.permission.resource.name;
        if (!permissionsMap.has(resName)) permissionsMap.set(resName, new Set());
        permissionsMap.get(resName)!.add(rp.permission.action);
      }
    }
    const activePermissions: ActivePermission[] = Array.from(permissionsMap.entries()).map(
      ([resource, actions]) => ({ resource, actions: Array.from(actions) }),
    );

    const roles: ActiveRoleInfo[] = userRoles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
    }));

    const activeRole = { id: userRoles[0].role.id, name: userRoles[0].role.name };
    const role = (activeRole.name.toLowerCase() as 'user' | 'admin' | 'superadmin');

    return { activeRole, activePermissions, roles, role };
  }

  /**
   * Ambil 1 role + relations untuk switch-role.
   */
  async getRoleWithPermissions(roleId: string): Promise<RoleEntity | null> {
    return this.roleRepo.findOne({
      where: { id: roleId },
      relations: ['rolePermissions', 'rolePermissions.permission', 'rolePermissions.permission.resource'],
    });
  }

  // ============================================================
  // CRUD Role
  // ============================================================

  async findAllRoles(): Promise<RoleEntity[]> {
    return this.roleRepo.find({
      relations: ['rolePermissions', 'rolePermissions.permission'],
      order: { name: 'ASC' },
    });
  }

  async findRoleById(id: string): Promise<RoleEntity | null> {
    return this.roleRepo.findOne({
      where: { id },
      relations: ['rolePermissions', 'rolePermissions.permission', 'rolePermissions.permission.resource'],
    });
  }

  async findRoleByName(name: RoleName): Promise<RoleEntity | null> {
    return this.roleRepo.findOne({ where: { name } });
  }

  async createRole(data: { name: RoleName; description?: string }): Promise<RoleEntity> {
    const role = this.roleRepo.create({
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description ?? null,
    });
    return this.roleRepo.save(role);
  }

  async updateRole(id: string, data: { name?: RoleName; description?: string | null }): Promise<RoleEntity | null> {
    await this.roleRepo.update(id, {
      ...(data.name ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
    });
    return this.findRoleById(id);
  }

  /**
   * Hapus role.
   *
   * Bug B3 fix: pre-check apakah role masih dipakai user aktif sebelum hapus.
   * Jika masih dipakai → throw BadRequestException dengan jumlah user terdampak.
   * Jika tidak dipakai → hapus role_permission dulu, lalu hapus role (atomic via transaction).
   */
  async deleteRole(id: string): Promise<void> {
    // 1. Cek apakah role masih dipakai user aktif
    const userCount = await this.rbacUserRoleRepo.count({
      where: { roleId: id, active: true },
    });
    if (userCount > 0) {
      throw new BadRequestException(
        `Role tidak bisa dihapus karena masih digunakan oleh ${userCount} user. ` +
          'Hapus assignment user terlebih dahulu.',
      );
    }

    // 2. Hapus role_permission & role dalam transaction (atomic)
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(RolePermissionEntity).delete({ roleId: id });
      await manager.getRepository(RbacUserRoleEntity).delete({ roleId: id });
      await manager.getRepository(RoleEntity).delete(id);
    });

    // 3. Invalidate cache (jika ada user yang sebelumnya punya role ini nonaktif)
    this.permissionCache.invalidateAll();
  }

  /**
   * Assign ulang seluruh permission ke role (replace) — V2: transactional + diff.
   *
   * Bug B5 fix:
   * - Bungkus dalam transaction → atomic (rollback jika gagal di tengah)
   * - Diff: hanya hapus & insert yang berubah → no-op jika tidak ada perubahan
   * - Race-safe via transaction isolation (READ COMMITTED default)
   *
   * Bug B1 fix: invalidate seluruh permission cache karena perubahan permission
   * role berdampak ke semua user yang punya role ini.
   */
  async assignPermissionsToRole(roleId: string, permissionIds: string[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const rolePermRepo = manager.getRepository(RolePermissionEntity);
      const existing = await rolePermRepo.find({ where: { roleId } });
      const existingIds = new Set(existing.map((rp) => rp.permissionId));
      const newIds = new Set(permissionIds);

      // Diff: hanya yang berubah (dedupe permissionIds via Set)
      const toAdd = [...new Set(permissionIds.filter((id) => !existingIds.has(id)))];
      const toRemove = existing.filter((rp) => !newIds.has(rp.permissionId));

      if (toRemove.length > 0) {
        await rolePermRepo.delete(toRemove.map((rp) => rp.id));
      }
      if (toAdd.length > 0) {
        const rows = toAdd.map((pid) =>
          rolePermRepo.create({ id: crypto.randomUUID(), roleId, permissionId: pid }),
        );
        await rolePermRepo.save(rows);
      }
    });

    // Invalidate semua cache — user dengan role ini harus re-query permission
    this.permissionCache.invalidateAll();
    // Real-time: emit ke semua user dengan role ini agar FE refresh permission
    try {
      const role = await this.roleRepo.findOne({ where: { id: roleId } });
      if (role) {
        this.notificationGateway.emitRbacPermissionChanged(role.name, { roleId });
      }
    } catch {}
  }

  // ============================================================
  // Resource & Permission (read-only untuk UI matrix)
  // ============================================================

  async findAllResources(): Promise<ResourceEntity[]> {
    return this.resourceRepo.find({
      relations: ['permissions'],
      order: { name: 'ASC' },
    });
  }

  async findAllPermissions(): Promise<PermissionEntity[]> {
    return this.permissionRepo.find({
      relations: ['resource'],
      order: { name: 'ASC' },
    });
  }

  // ============================================================
  // Matrix (Excel-style tree)
  // ============================================================

  async findUtamaMatrix(roleId?: string): Promise<{
    tree: any;
    assignedPermissionIds: string[];
  }> {
    return this.buildMatrixTree(utamaMatrix, roleId);
  }

  async findUtilitasMatrix(roleId?: string): Promise<{
    tree: any;
    assignedPermissionIds: string[];
  }> {
    return this.buildMatrixTree(utilitasMatrix, roleId);
  }

  async findAdministrasiMatrix(roleId?: string): Promise<{
    tree: any;
    assignedPermissionIds: string[];
  }> {
    return this.buildMatrixTree(administrasiMatrix, roleId);
  }

  async findLaporanMatrix(roleId?: string): Promise<{
    tree: any;
    assignedPermissionIds: string[];
  }> {
    return this.buildMatrixTree(laporanMatrix, roleId);
  }

  async findFaqMatrix(roleId?: string): Promise<{
    tree: any;
    assignedPermissionIds: string[];
  }> {
    return this.buildMatrixTree(faqMatrix, roleId);
  }

  private async buildMatrixTree(
    node: any,
    roleId?: string,
  ): Promise<{ tree: any; assignedPermissionIds: string[] }> {
    const allPerms = await this.permissionRepo.find({ select: ['id', 'name', 'action', 'resourceId'] });
    const nameToId = new Map<string, string>();
    for (const p of allPerms) nameToId.set(p.name, p.id);

    const tree = JSON.parse(JSON.stringify(node));
    for (const menu of tree.menus ?? []) {
      for (const sub of menu.subMenus ?? []) {
        for (const fitur of sub.fiturs ?? []) {
          for (const perm of fitur.permissions ?? []) {
            const name = `${perm.resource}.${perm.action}`;
            perm.permissionId = nameToId.get(name) ?? null;
            perm.permissionName = name;
          }
        }
      }
    }

    const assignedPermissionIds: string[] = [];
    if (roleId) {
      const rolePerms = await this.rolePermissionRepo.find({ where: { roleId }, select: ['permissionId'] });
      assignedPermissionIds.push(...rolePerms.map((rp) => rp.permissionId));
    }

    return { tree, assignedPermissionIds };
  }

  async findMatrix(roleId?: string): Promise<{
    tree: MatrixHalaman[];
    assignedPermissionIds: string[];
    assignedPermissionNames: string[];
  }> {
    const allPerms = await this.permissionRepo.find({
      select: ['id', 'name', 'action', 'resourceId'],
    });
    const nameToId = new Map<string, string>();
    const idToName = new Map<string, string>();
    for (const p of allPerms) {
      nameToId.set(p.name, p.id);
      idToName.set(p.id, p.name);
    }

    // Build tree with permissionIds injected
    const buildTree = (nodes: MatrixHalaman[]): MatrixHalaman[] => {
      return nodes.map((node) => ({
        ...node,
        menus: node.menus.map((menu) => ({
          ...menu,
          subMenus: menu.subMenus.map((sub) => ({
            ...sub,
            fiturs: sub.fiturs.map((fitur) => ({
              ...fitur,
              permissions: fitur.permissions.map((perm) => {
                const name = `${perm.resource}.${perm.action}`;
                return {
                  ...perm,
                  permissionId: nameToId.get(name) ?? null,
                  permissionName: name,
                };
              }),
            })),
          })),
        })),
      }));
    };

    const assignedPermissionIds: string[] = [];
    if (roleId) {
      const rolePerms = await this.rolePermissionRepo.find({
        where: { roleId },
        select: ['permissionId'],
      });
      assignedPermissionIds.push(...rolePerms.map((rp) => rp.permissionId));
    }
    const assignedPermissionNames = assignedPermissionIds
      .map((id) => idToName.get(id))
      .filter((n): n is string => !!n);

    return {
      tree: buildTree(rbacMatrixTree),
      assignedPermissionIds,
      assignedPermissionNames,
    };
  }

  // ============================================================
  // User-Role assignment
  // ============================================================

  async findUserRoles(persnum: number): Promise<RbacUserRoleEntity[]> {
    return this.rbacUserRoleRepo.find({
      where: { persnum },
      relations: ['role'],
    });
  }

  /**
   * Bug B7 fix: ambil profile user (persnum, name) by persnum exact.
   * Tidak pakai LIKE query — langsung find by persnum.
   * Note: position_text tidak ada di pa_personal, ada di org_data. Untuk simplicity,
   * return name saja; positionText bisa di-fetch terpisah jika diperlukan.
   */
  async findUserProfile(persnum: number): Promise<{
    persnum: number;
    name: string;
    positionText: string | null;
  } | null> {
    const person = await this.personRepo.findOne({ where: { persnum } });
    if (!person) return null;
    return {
      persnum: person.persnum as number,
      name: person.name || '',
      positionText: null, // pa_personal tidak punya position_text; ambil dari org_data jika perlu
    };
  }

  /**
   * Bug B6 fix: list semua user dengan role (join rbac_user_role + rbac_role + pa_personal).
   * Support search (nama/persnum) & filter by role name. Pagination via skip/take.
   */
  async findAllUserRoles(query: {
    search?: string;
    roleName?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: {
      id: string;
      persnum: number;
      name: string;
      roleId: string;
      roleName: string;
      unitKerja: string | null;
      active: boolean;
      positionText: string | null;
      createdAt: Date;
    }[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.rbacUserRoleRepo
      .createQueryBuilder('ur')
      .innerJoinAndSelect('ur.role', 'role')
      .leftJoinAndSelect(
        'pa_personal',
        'person',
        'person.persnum = ur.persnum',
      );

    if (query.roleName) {
      qb.andWhere('role.name = :roleName', { roleName: query.roleName });
    }

    if (query.search) {
      const term = `%${query.search}%`;
      qb.andWhere(
        '(person.name LIKE :term OR CAST(ur.persnum AS CHAR) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('ur.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    const data = rows.map((ur) => ({
      id: ur.id,
      persnum: ur.persnum,
      name: '', // diisi dari join person — ambil via raw atau query terpisah
      roleId: ur.roleId,
      roleName: ur.role?.name ?? '',
      unitKerja: ur.unitKerja,
      active: ur.active,
      positionText: null,
      createdAt: ur.createdAt,
    }));

    // Fill name & positionText dari person (bulk query untuk hindari N+1)
    if (data.length > 0) {
      const persnums = data.map((d) => d.persnum);
      const persons = await this.personRepo.find({
        where: { persnum: In(persnums as any[]) },
      });
      const personMap = new Map(persons.map((p) => [p.persnum, p]));
      for (const item of data) {
        const p = personMap.get(item.persnum);
        if (p) {
          item.name = p.name || '';
          item.positionText = (p as any).position_text || null;
        }
      }
    }

    return { data, total, page, limit };
  }

  async assignRoleToUser(persnum: number, roleId: string, unitKerja?: string | null): Promise<RbacUserRoleEntity> {
    // Bug B4 fix: throw error jika user sudah punya role ini & active
    const existing = await this.rbacUserRoleRepo.findOne({
      where: { persnum, roleId, unitKerja: unitKerja ?? null as any },
    });

    if (existing && existing.active) {
      throw new BadRequestException(
        `User sudah memiliki role ini${unitKerja ? ` (unit kerja: ${unitKerja})` : ''}.`,
      );
    }

    // Validasi: 1 user hanya boleh 1 role aktif.
    // Hapus (deactivate) semua role aktif lain sebelum assign role baru.
    const activeRoles = await this.rbacUserRoleRepo.find({
      where: { persnum, active: true },
    });
    for (const ar of activeRoles) {
      if (ar.roleId !== roleId) {
        await this.rbacUserRoleRepo.delete(ar.id);
      }
    }

    let result: RbacUserRoleEntity;
    if (existing && !existing.active) {
      // Re-activate jika sebelumnya dinonaktifkan
      existing.active = true;
      result = await this.rbacUserRoleRepo.save(existing);
    } else {
      const row = this.rbacUserRoleRepo.create({
        id: crypto.randomUUID(),
        persnum,
        roleId,
        unitKerja: unitKerja ?? null,
        active: true,
      });
      result = await this.rbacUserRoleRepo.save(row);
    }
    // Bug B1 fix: invalidate cache user ini agar permission baru efektif segera
    this.permissionCache.invalidate(persnum);
    // Real-time: emit ke user yg di-assign agar FE auto-refresh profile
    try {
      const assignedRole = await this.roleRepo.findOne({ where: { id: roleId } });
      this.notificationGateway.emitRbacRoleChanged(persnum, {
        action: 'assigned',
        roleName: assignedRole?.name,
      });
    } catch {}
    return result;
  }

  async removeRoleFromUser(persnum: number, roleId: string): Promise<void> {
    // Bug B9 fix: proteksi "last superadmin" — sistem harus punya minimal 1 superadmin
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (role?.name === RoleName.SUPERADMIN) {
      // Cek apakah user ini benar-benar punya role SUPERADMIN aktif
      const userHasSuperadmin = await this.rbacUserRoleRepo.findOne({
        where: { persnum, roleId, active: true },
      });
      if (userHasSuperadmin) {
        // Hitung total superadmin aktif
        const superadminCount = await this.rbacUserRoleRepo.count({
          where: { roleId, active: true },
        });
        if (superadminCount <= 1) {
          throw new BadRequestException(
            'Tidak bisa menghapus role SUPERADMIN dari user terakhir. ' +
              'Sistem harus memiliki minimal 1 superadmin aktif.',
          );
        }
      }
    }

    await this.rbacUserRoleRepo.delete({ persnum, roleId });
    // Bug B1 fix: invalidate cache user ini
    this.permissionCache.invalidate(persnum);
    // Real-time: emit ke user yg di-remove agar FE auto-refresh profile
    try {
      this.notificationGateway.emitRbacRoleChanged(persnum, {
        action: 'removed',
        roleName: role?.name,
      });
    } catch {}
  }

  /**
   * Ambil role aktif (yang paling prioritas: SUPERADMIN > ADMIN > USER)
   * untuk list persnum secara batch. User tanpa baris di rbac_user_role → default USER.
   */
  async getActiveRolesForPersnums(persnums: number[]): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    if (persnums.length === 0) return result;

    const priority = { SUPERADMIN: 3, ADMIN: 2, USER: 1 };
    const rows = await this.rbacUserRoleRepo.find({
      where: { persnum: In(persnums as any[]), active: true },
      relations: ['role'],
    });

    // group per persnum → ambil role dengan prioritas tertinggi
    const perUser = new Map<number, string[]>();
    for (const row of rows) {
      const arr = perUser.get(row.persnum) ?? [];
      arr.push(row.role.name);
      perUser.set(row.persnum, arr);
    }

    for (const p of persnums) {
      const roles = perUser.get(p);
      if (!roles || roles.length === 0) {
        result.set(p, RoleName.USER); // default
      } else {
        roles.sort((a, b) => (priority[b] ?? 0) - (priority[a] ?? 0));
        result.set(p, roles[0]);
      }
    }
    return result;
  }
}