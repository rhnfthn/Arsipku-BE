import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  RoleEntity,
  RoleName,
  ResourceEntity,
  PermissionEntity,
  RolePermissionEntity,
  RbacUserRoleEntity,
} from '../entities';
import type { ActivePermission, ActiveRoleInfo } from '../../auth/interfaces/jwt-payload.interface';

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

  async deleteRole(id: string): Promise<void> {
    await this.roleRepo.delete(id);
  }

  /**
   * Assign ulang seluruh permission ke role (replace).
   */
  async assignPermissionsToRole(roleId: string, permissionIds: string[]): Promise<void> {
    await this.rolePermissionRepo.delete({ roleId });
    if (permissionIds.length === 0) return;
    const rows = permissionIds.map((pid) =>
      this.rolePermissionRepo.create({ id: crypto.randomUUID(), roleId, permissionId: pid }),
    );
    await this.rolePermissionRepo.save(rows);
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
  // User-Role assignment
  // ============================================================

  async findUserRoles(persnum: number): Promise<RbacUserRoleEntity[]> {
    return this.rbacUserRoleRepo.find({
      where: { persnum },
      relations: ['role'],
    });
  }

  async assignRoleToUser(persnum: number, roleId: string, unitKerja?: string | null): Promise<RbacUserRoleEntity> {
    // Upsert: jika sudah ada (persnum+role+unitKerja), aktifkan; jika tidak buat baru.
    const existing = await this.rbacUserRoleRepo.findOne({
      where: { persnum, roleId, unitKerja: unitKerja ?? null as any },
    });
    if (existing) {
      existing.active = true;
      return this.rbacUserRoleRepo.save(existing);
    }
    const row = this.rbacUserRoleRepo.create({
      id: crypto.randomUUID(),
      persnum,
      roleId,
      unitKerja: unitKerja ?? null,
      active: true,
    });
    return this.rbacUserRoleRepo.save(row);
  }

  async removeRoleFromUser(persnum: number, roleId: string): Promise<void> {
    await this.rbacUserRoleRepo.delete({ persnum, roleId });
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