import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { UserRoleEntity, UserRole } from '../entities/user-role.entity';
import {
  UserRoleHistoryEntity,
  RoleAction,
} from '../entities/user-role-history.entity';
import { Person } from '../../master-data/person/entities/person.entity';
import {
  SearchUsersDto,
  SearchUsersResponseDto,
  UserListItemDto,
} from '../dto/search-users.dto';
import {
  AssignRoleDto,
  AssignRoleResponseDto,
  UpdateRoleResponseDto,
} from '../dto/assign-role.dto';
import { RemoveRoleResponseDto } from '../dto/remove-role.dto';
import { OrgDataService } from '../../master-data/org_data/org_data.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(UserRoleHistoryEntity)
    private readonly userRoleHistoryRepo: Repository<UserRoleHistoryEntity>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly orgDataService: OrgDataService,
  ) {}

  /**
   * Get list of users with their roles
   * Search by name, username, or persnum
   * Filter by role
   *
   * Refactored: bulk queries + Map lookup (no N+1).
   */
  async searchUsers(query: SearchUsersDto): Promise<SearchUsersResponseDto> {
    // Step 1: ambil daftar Person sesuai filter
    let persons: Person[] = [];
    if (query.search) {
      const searchTerm = `%${query.search}%`;
      const persnumSearch = isNaN(Number(query.search))
        ? null
        : Number(query.search);

      persons = await this.personRepo.find({
        where: persnumSearch
          ? [
              { persnum: persnumSearch, endDate: '9999-12-31' },
              { name: Like(searchTerm), endDate: '9999-12-31' },
              { uname: Like(searchTerm), endDate: '9999-12-31' },
            ]
          : [
              { name: Like(searchTerm), endDate: '9999-12-31' },
              { uname: Like(searchTerm), endDate: '9999-12-31' },
            ],
        order: { name: 'ASC' },
      });
    } else {
      // No search term — ambil semua admin/superadmin lalu fetch person batch
      const allUserRoles = await this.userRoleRepo.find({
        where: { role: In([UserRole.ADMIN, UserRole.SUPERADMIN]) },
        order: { createdAt: 'DESC' },
      });

      const persnums = allUserRoles
        .map((u) => u.persnum)
        .filter((p): p is number => p != null);
      if (persnums.length === 0) {
        return {
          success: true,
          message: 'Berhasil mengambil data pengguna',
          data: {
            users: [],
            summary: {
              total: 0,
              total_admin: 0,
              total_superadmin: 0,
              total_regular_users: 0,
            },
          },
        };
      }

      persons = await this.personRepo.find({
        where: { persnum: In(persnums) },
      });
    }

    if (persons.length === 0) {
      return {
        success: true,
        message: 'Berhasil mengambil data pengguna',
        data: {
          users: [],
          summary: {
            total: 0,
            total_admin: 0,
            total_superadmin: 0,
            total_regular_users: 0,
          },
        },
      };
    }

    // Step 2: bulk fetch roles untuk semua persnum
    const persnums = persons
      .map((p) => p.persnum)
      .filter((p): p is number => p != null);
    const userRoles = await this.userRoleRepo.find({
      where: { persnum: In(persnums) },
    });
    const roleMap = new Map(userRoles.map((r) => [r.persnum, r]));

    // Step 3: build position info Map dari position_json sekali (no N+1)
    const orgData = await this.orgDataService.findLatestOrg();
    const positionInfoMap = new Map<
      number,
      { bodTag: string | null; positionText: string | null }
    >();
    if (orgData?.position_json && Array.isArray(orgData.position_json)) {
      const persnumSet = new Set(persnums);
      for (const pos of orgData.position_json) {
        const pn = pos.persnum_person ?? pos.persnum;
        if (pn != null) {
          const pnNum = Number(pn);
          if (persnumSet.has(pnNum) && !positionInfoMap.has(pnNum)) {
            positionInfoMap.set(pnNum, {
              bodTag: pos.bod_tag ?? null,
              positionText: pos.position_text ?? null,
            });
          }
        }
      }
    }

    // Step 4: build response
    const users: UserListItemDto[] = [];
    for (const person of persons) {
      if (!person.persnum) continue;

      const userRole = roleMap.get(person.persnum);

      // Filter by role kalau diminta
      if (query.role && (!userRole || userRole.role !== query.role)) {
        continue;
      }

      const posInfo = positionInfoMap.get(person.persnum);

      users.push({
        persnum: person.persnum,
        name: person.name || '',
        uname: person.uname || '',
        role: userRole?.role || null,
        bod_tag: posInfo?.bodTag || null,
        position_text: posInfo?.positionText || null,
        status: 'aktif',
        assigned_at: userRole?.createdAt || null,
      });
    }

    const totalAdmin = users.filter((u) => u.role === UserRole.ADMIN).length;
    const totalSuperadmin = users.filter(
      (u) => u.role === UserRole.SUPERADMIN,
    ).length;
    const totalRegular = users.filter((u) => !u.role).length;

    return {
      success: true,
      message: 'Berhasil mengambil data pengguna',
      data: {
        users,
        summary: {
          total: users.length,
          total_admin: totalAdmin,
          total_superadmin: totalSuperadmin,
          total_regular_users: totalRegular,
        },
      },
    };
  }

  /**
   * Get user detail by persnum
   * Check if user exists and return user info + current role
   */
  async getUserByPersnum(persnum: number): Promise<{
    success: boolean;
    data: UserListItemDto;
  }> {
    const person = await this.personRepo.findOne({
      where: { persnum },
    });

    if (!person || !person.persnum) {
      throw new NotFoundException(
        `User dengan persnum ${persnum} tidak ditemukan`,
      );
    }

    // Get user role if exists
    const userRole = await this.userRoleRepo.findOne({
      where: { persnum },
    });

    // Get bod_tag and position_text from org data
    let bodTag: string | null = null;
    let positionText: string | null = null;
    try {
      const orgData = await this.orgDataService.findByPersnum(persnum);
      bodTag = orgData?.bodTag || null;
      positionText = orgData?.positionText || null;
    } catch {
      bodTag = null;
      positionText = null;
    }

    return {
      success: true,
      data: {
        persnum: person.persnum,
        name: person.name || '',
        uname: person.uname || '',
        role: userRole?.role || null,
        bod_tag: bodTag,
        position_text: positionText,
        status: person.endDate === '9999-12-31' ? 'aktif' : 'tidak_aktif',
        assigned_at: userRole?.createdAt || null,
      },
    };
  }

  /**
   * Assign role (admin/superadmin) to user
   * Only superadmin can assign roles
   */
  async assignRole(
    persnum: number,
    dto: AssignRoleDto,
    assignedBy: number,
  ): Promise<AssignRoleResponseDto> {
    // Validate user exists in pa_personal
    const person = await this.personRepo.findOne({
      where: { persnum },
    });

    if (!person) {
      throw new NotFoundException(
        `User dengan persnum ${persnum} tidak ditemukan`,
      );
    }

    // Check if user is active
    if (person.endDate !== '9999-12-31') {
      throw new BadRequestException(
        `User dengan persnum ${persnum} tidak aktif`,
      );
    }

    // Fetch id_position from target user's org data
    let targetIdPosition = '';
    try {
      const targetOrgData = await this.orgDataService.findByPersnum(persnum);
      targetIdPosition = targetOrgData?.position?.toString() || '';
    } catch {
      targetIdPosition = '';
    }

    // Check if user already has a role
    let userRole = await this.userRoleRepo.findOne({
      where: { persnum },
    });

    if (userRole) {
      // Update existing role
      const oldRole = userRole.role;
      userRole.role = dto.role;
      userRole.idPosition = targetIdPosition;
      await this.userRoleRepo.save(userRole);

      // Log to history
      await this.userRoleHistoryRepo.save({
        id: uuidv4(),
        persnum,
        role: dto.role,
        action: RoleAction.ASSIGNED,
        assignedBy,
      });

      return {
        success: true,
        message: `Role berhasil diubah dari ${oldRole} menjadi ${dto.role}`,
        data: {
          persnum,
          role: dto.role,
          assigned_by: assignedBy,
          assigned_at: new Date(),
        },
      };
    }

    // Create new role assignment
    userRole = this.userRoleRepo.create({
      id: uuidv4(),
      persnum,
      role: dto.role,
      idPosition: targetIdPosition,
    });

    await this.userRoleRepo.save(userRole);

    // Log to history
    await this.userRoleHistoryRepo.save({
      id: uuidv4(),
      persnum,
      role: dto.role,
      action: RoleAction.ASSIGNED,
      assignedBy,
    });

    return {
      success: true,
      message: `Role ${dto.role} berhasil diberikan kepada user`,
      data: {
        persnum,
        role: dto.role,
        assigned_by: assignedBy,
        assigned_at: new Date(),
      },
    };
  }

  /**
   * Update existing role for user
   * Only superadmin can update roles
   */
  async updateRole(
    persnum: number,
    dto: AssignRoleDto,
    updatedBy: number,
  ): Promise<UpdateRoleResponseDto> {
    // Check if user has a role
    const userRole = await this.userRoleRepo.findOne({
      where: { persnum },
    });

    if (!userRole) {
      throw new NotFoundException(
        `User dengan persnum ${persnum} tidak memiliki role untuk diubah`,
      );
    }

    const previousRole = userRole.role;

    // Fetch id_position from target user's org data
    try {
      const targetOrgData = await this.orgDataService.findByPersnum(persnum);
      if (targetOrgData?.position) {
        userRole.idPosition = targetOrgData.position.toString();
      }
    } catch {
      // keep existing idPosition if org data fetch fails
    }

    // Update role
    userRole.role = dto.role;
    await this.userRoleRepo.save(userRole);

    // Log to history
    await this.userRoleHistoryRepo.save({
      id: uuidv4(),
      persnum,
      role: dto.role,
      action: RoleAction.ASSIGNED,
      assignedBy: updatedBy,
    });

    return {
      success: true,
      message: `Role berhasil diubah dari ${previousRole} menjadi ${dto.role}`,
      data: {
        persnum,
        previous_role: previousRole,
        new_role: dto.role,
        updated_by: updatedBy,
        updated_at: new Date(),
      },
    };
  }

  /**
   * Remove role from user (revert to regular user)
   * Only superadmin can remove roles
   */
  async removeRole(
    persnum: number,
    removedBy: number,
  ): Promise<RemoveRoleResponseDto> {
    // Check if user has a role
    const userRole = await this.userRoleRepo.findOne({
      where: { persnum },
    });

    if (!userRole) {
      throw new NotFoundException(
        `User dengan persnum ${persnum} tidak memiliki role admin/superadmin`,
      );
    }

    const previousRole = userRole.role;

    // Remove role
    await this.userRoleRepo.remove(userRole);

    // Log to history
    await this.userRoleHistoryRepo.save({
      id: uuidv4(),
      persnum,
      role: previousRole,
      action: RoleAction.REMOVED,
      assignedBy: removedBy,
    });

    return {
      success: true,
      message: `Role ${previousRole} berhasil dihapus, user kembali menjadi user biasa`,
      data: {
        persnum,
        previous_role: previousRole,
        removed_by: removedBy,
        removed_at: new Date(),
      },
    };
  }
}
