import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RbacService } from '../services/rbac.service';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { CurrentUser, RequirePermission } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateRoleDto, UpdateRoleDto } from '../dto/create-role.dto';
import { AssignPermissionDto } from '../dto/assign-permission.dto';
import { AssignRoleDto } from '../dto/assign-role.dto';
import { SwitchRoleDto } from '../dto/switch-role.dto';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '../../../common/enums/role-name.enum';
import { RoleEntity } from '../entities';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditModule } from '../../audit/enums/audit-module.enum';

@ApiTags('RBAC')
@ApiBearerAuth()
@Controller('rbac')
export class RbacController {
  constructor(
    private readonly rbacService: RbacService,
    private readonly jwtService: JwtService,
  ) {}

  // ============================================================
  // Debug / me — ambil info RBAC dari JWT
  // ============================================================

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return {
      success: true,
      data: {
        persnum: user.persnum,
        role: user.role,
        activeRole: user.activeRole ?? null,
        roles: user.roles ?? [],
        activePermissions: user.activePermissions ?? [],
      },
    };
  }

  // ============================================================
  // Roles
  // ============================================================

  @Get('roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async listRoles() {
    const roles = await this.rbacService.findAllRoles();
    return {
      success: true,
      data: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissionCount: r.rolePermissions?.length ?? 0,
        permissions: (r.rolePermissions ?? []).map((rp) => ({
          id: rp.permissionId,
          name: rp.permission?.name,
        })),
      })),
    };
  }

  @Post('roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'create')
  @AuditLog({
    module: AuditModule.RBAC,
    action: AuditAction.CREATE,
    entityType: 'role',
    captureDiff: true,
  })
  async createRole(@Body() dto: CreateRoleDto) {
    const role = await this.rbacService.createRole(dto);
    return { success: true, data: role };
  }

  @Patch('roles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'update')
  @AuditLog({
    module: AuditModule.RBAC,
    action: AuditAction.UPDATE,
    entityType: 'role',
    entityIdParam: 'id',
    captureDiff: true,
  })
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.rbacService.updateRole(id, dto);
    return { success: true, data: role };
  }

  @Delete('roles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'delete')
  @AuditLog({
    module: AuditModule.RBAC,
    action: AuditAction.DELETE,
    entityType: 'role',
    entityIdParam: 'id',
  })
  async deleteRole(@Param('id') id: string) {
    await this.rbacService.deleteRole(id);
    return { success: true, message: 'Role deleted' };
  }

  // ============================================================
  // Resource & Permissions
  // ============================================================

  @Get('resources')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async listResources() {
    const resources = await this.rbacService.findAllResources();
    return {
      success: true,
      data: resources.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: (r.permissions ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          action: p.action,
          description: p.description,
        })),
      })),
    };
  }

  @Get('permissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async listPermissions() {
    const permissions = await this.rbacService.findAllPermissions();
    return {
      success: true,
      data: permissions.map((p) => ({
        id: p.id,
        name: p.name,
        action: p.action,
        description: p.description,
        resource: p.resource?.name,
        resourceId: p.resourceId,
      })),
    };
  }

  // ============================================================
  // Role <-> Permission assignment (matrix)
  // ============================================================

  @Get('matrix')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async getMatrix(@Query('roleId') roleId?: string) {
    const result = await this.rbacService.findMatrix(roleId);
    return { success: true, data: result };
  }

  @Get('matrix/utama')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async getUtamaMatrix(@Query('roleId') roleId?: string) {
    const result = await this.rbacService.findUtamaMatrix(roleId);
    return { success: true, data: result };
  }

  @Get('matrix/utilitas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async getUtilitasMatrix(@Query('roleId') roleId?: string) {
    const result = await this.rbacService.findUtilitasMatrix(roleId);
    return { success: true, data: result };
  }

  @Get('matrix/administrasi')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async getAdministrasiMatrix(@Query('roleId') roleId?: string) {
    const result = await this.rbacService.findAdministrasiMatrix(roleId);
    return { success: true, data: result };
  }

  @Get('matrix/laporan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async getLaporanMatrix(@Query('roleId') roleId?: string) {
    const result = await this.rbacService.findLaporanMatrix(roleId);
    return { success: true, data: result };
  }

  @Get('matrix/faq')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async getFaqMatrix(@Query('roleId') roleId?: string) {
    const result = await this.rbacService.findFaqMatrix(roleId);
    return { success: true, data: result };
  }

  @Get('matrix/kelola')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async getKelolaMatrix(@Query('roleId') roleId?: string) {
    const result = await this.rbacService.findKelolaMatrix(roleId);
    return { success: true, data: result };
  }

  @Get('matrix/tugas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'read')
  async getTugasMatrix(@Query('roleId') roleId?: string) {
    const result = await this.rbacService.findTugasMatrix(roleId);
    return { success: true, data: result };
  }

  @Put('roles/:id/permissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('role', 'assign-permission')
  @AuditLog({
    module: AuditModule.RBAC,
    action: AuditAction.UPDATE,
    entityType: 'role',
    entityIdParam: 'id',
    subEntityType: 'permission',
    captureDiff: true,
  })
  async assignPermissions(
    @Param('id') id: string,
    @Body() dto: AssignPermissionDto,
  ) {
    await this.rbacService.assignPermissionsToRole(
      id,
      dto.permissionIds,
      dto.matrixPermissionIds,
    );
    return { success: true, message: 'Permissions assigned to role' };
  }

  // ============================================================
  // User <-> Role assignment
  // ============================================================

  /**
   * Bug B6 fix: GET /rbac/users — list semua user dengan role (pagination, search, filter).
   */
  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('user', 'read')
  async listUserRolesTable(
    @Query()
    query: {
      search?: string;
      roleName?: string;
      page?: string;
      limit?: string;
    },
  ) {
    const result = await this.rbacService.findAllUserRoles({
      search: query.search,
      roleName: query.roleName,
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 10,
    });
    return {
      success: true,
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Bug B7 fix: GET /rbac/users/:persnum/profile — ambil profile user by persnum exact.
   */
  @Get('users/:persnum/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('user', 'read')
  async getUserProfile(@Param('persnum', ParseIntPipe) persnum: number) {
    const profile = await this.rbacService.findUserProfile(persnum);
    if (!profile) {
      return {
        success: false,
        data: null,
        message: `User dengan persnum ${persnum} tidak ditemukan`,
      };
    }
    return { success: true, data: profile };
  }

  @Get('users/:persnum/roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('user', 'read')
  async listUserRoles(@Param('persnum', ParseIntPipe) persnum: number) {
    const rows = await this.rbacService.findUserRoles(persnum);
    return {
      success: true,
      data: rows.map((ur) => ({
        id: ur.id,
        roleId: ur.roleId,
        roleName: ur.role?.name,
        unitKerja: ur.unitKerja,
        active: ur.active,
        createdAt: ur.createdAt,
      })),
    };
  }

  @Post('users/:persnum/roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('user', 'assign-role')
  @AuditLog({
    module: AuditModule.RBAC,
    action: AuditAction.CREATE,
    entityType: 'user',
    entityIdParam: 'persnum',
    subEntityType: 'role',
  })
  async assignRoleToUser(
    @Param('persnum', ParseIntPipe) persnum: number,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const row = await this.rbacService.assignRoleToUser(
      persnum,
      dto.roleId,
      dto.unitKerja ?? null,
    );
    return {
      success: true,
      data: {
        id: row.id,
        persnum: row.persnum,
        roleId: row.roleId,
        unitKerja: row.unitKerja,
        active: row.active,
        assignedBy: user.persnum,
      },
    };
  }

  @Delete('users/:persnum/roles/:roleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('user', 'assign-role')
  @AuditLog({
    module: AuditModule.RBAC,
    action: AuditAction.DELETE,
    entityType: 'user',
    entityIdParam: 'persnum',
    subEntityType: 'role',
    subEntityIdParam: 'roleId',
  })
  async removeRoleFromUser(
    @Param('persnum', ParseIntPipe) persnum: number,
    @Param('roleId') roleId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.rbacService.removeRoleFromUser(persnum, roleId);
    return {
      success: true,
      data: { persnum, roleId, removedBy: user.persnum },
    };
  }

  // ============================================================
  // Batch: ambil role prioritas untuk list persnum (default USER)
  // ============================================================

  @Post('users/roles-batch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('user', 'read')
  async getRolesBatch(@Body() body: { persnums: number[] }) {
    const persnums = Array.isArray(body?.persnums) ? body.persnums : [];
    const map = await this.rbacService.getActiveRolesForPersnums(persnums);
    const data: { persnum: number; role: string }[] = [];
    for (const p of persnums) {
      data.push({ persnum: p, role: map.get(p) || 'USER' });
    }
    return { success: true, data };
  }

  // ============================================================
  // Switch role (re-sign JWT)
  // ============================================================

  @Post('switch-role')
  @UseGuards(JwtAuthGuard)
  async switchRole(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SwitchRoleDto,
  ) {
    const allowed = (user.roles ?? []).some((r) => r.id === dto.roleId);
    if (!allowed) throw new ForbiddenException('You do not have this role');

    const role: RoleEntity | null =
      await this.rbacService.getRoleWithPermissions(dto.roleId);
    if (!role) throw new ForbiddenException('Role not found');

    const activePermissions = this.rbacService.groupPermissionsByResource(
      (role.rolePermissions ?? []) as any,
    );

    const { exp, iat, ...base } = user as any;
    const newPayload: JwtPayload = {
      ...base,
      activeRole: { id: role.id, name: role.name },
      activePermissions,
      role: role.name.toLowerCase() as 'user' | 'admin' | 'superadmin',
    };

    const expiresIn =
      exp && typeof exp === 'number'
        ? Math.max(Math.floor((exp * 1000 - Date.now()) / 1000), 3600)
        : 86400;

    const accessToken = await this.jwtService.signAsync(newPayload, {
      expiresIn,
    });

    return {
      success: true,
      data: {
        message: `Active role switched to ${role.name}`,
        accessToken,
        activeRole: newPayload.activeRole,
        activePermissions,
      },
    };
  }
}
