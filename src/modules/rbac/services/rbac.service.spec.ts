import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import {
  RoleEntity,
  ResourceEntity,
  PermissionEntity,
  RolePermissionEntity,
  RbacUserRoleEntity,
} from '../entities';
import { RoleName } from '../../../common/enums/role-name.enum';
import { PermissionCacheService } from '../../../common/guards/permission-cache.service';
import { Person } from '../../master-data/person/entities/person.entity';
import { RbacService } from './rbac.service';
import { NotificationGateway } from '../../notification/gateways/notification.gateway';

describe('RbacService', () => {
  let service: RbacService;
  let roleRepo: any;
  let rolePermissionRepo: any;
  let rbacUserRoleRepo: any;
  let personRepo: any;
  let permissionCache: any;
  let dataSource: any;
  let txManager: any;
  let notificationGateway: any;

  beforeEach(async () => {
    roleRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => x),
      update: jest.fn(),
      delete: jest.fn(),
    };
    rolePermissionRepo = {
      find: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => x),
      delete: jest.fn(),
    };
    rbacUserRoleRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => x),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      })),
    };
    personRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    permissionCache = {
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
      invalidateAll: jest.fn(),
      cleanupExpired: jest.fn(),
    };

    // Mock DataSource transaction — panggil callback dengan txManager
    txManager = {
      getRepository: jest.fn((entity: any) => {
        // Return mock repo sesuai entity
        if (entity === RolePermissionEntity) return rolePermissionRepo;
        if (entity === RbacUserRoleEntity) return rbacUserRoleRepo;
        if (entity === RoleEntity) return roleRepo;
        return { delete: jest.fn(), save: jest.fn() };
      }),
    };
    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(txManager)),
    };
    notificationGateway = {
      emitRbacRoleChanged: jest.fn(),
      emitRbacPermissionChanged: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: getRepositoryToken(RoleEntity), useValue: roleRepo },
        { provide: getRepositoryToken(ResourceEntity), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(PermissionEntity), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(RolePermissionEntity), useValue: rolePermissionRepo },
        { provide: getRepositoryToken(RbacUserRoleEntity), useValue: rbacUserRoleRepo },
        { provide: getRepositoryToken(Person), useValue: personRepo },
        { provide: PermissionCacheService, useValue: permissionCache },
        { provide: DataSource, useValue: dataSource },
        { provide: NotificationGateway, useValue: notificationGateway },
      ],
    }).compile();

    service = module.get<RbacService>(RbacService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================
  // B5: assignPermissionsToRole — transaction + diff
  // ============================================================
  describe('assignPermissionsToRole (B5: transaction + diff)', () => {
    it('should add only new permissions (diff)', async () => {
      rolePermissionRepo.find.mockResolvedValue([
        { id: 'rp-1', roleId: 'role-1', permissionId: 'perm-1' },
        { id: 'rp-2', roleId: 'role-1', permissionId: 'perm-2' },
      ]);

      // new: perm-1 (existing), perm-3 (new)
      await service.assignPermissionsToRole('role-1', ['perm-1', 'perm-3']);

      // toRemove: perm-2 (not in new)
      expect(rolePermissionRepo.delete).toHaveBeenCalledWith(['rp-2']);
      // toAdd: perm-3
      expect(rolePermissionRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ roleId: 'role-1', permissionId: 'perm-3' }),
      ]);
      expect(permissionCache.invalidateAll).toHaveBeenCalled();
    });

    it('should be no-op when no change', async () => {
      rolePermissionRepo.find.mockResolvedValue([
        { id: 'rp-1', roleId: 'role-1', permissionId: 'perm-1' },
      ]);

      await service.assignPermissionsToRole('role-1', ['perm-1']);

      expect(rolePermissionRepo.delete).not.toHaveBeenCalled();
      expect(rolePermissionRepo.save).not.toHaveBeenCalled();
      expect(permissionCache.invalidateAll).toHaveBeenCalled();
    });

    it('should remove all when permissionIds empty', async () => {
      rolePermissionRepo.find.mockResolvedValue([
        { id: 'rp-1', roleId: 'role-1', permissionId: 'perm-1' },
      ]);

      await service.assignPermissionsToRole('role-1', []);

      expect(rolePermissionRepo.delete).toHaveBeenCalledWith(['rp-1']);
      expect(rolePermissionRepo.save).not.toHaveBeenCalled();
    });

    it('should add all when role has no existing permissions', async () => {
      rolePermissionRepo.find.mockResolvedValue([]);

      await service.assignPermissionsToRole('role-1', ['perm-1', 'perm-2']);

      expect(rolePermissionRepo.delete).not.toHaveBeenCalled();
      expect(rolePermissionRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ permissionId: 'perm-1' }),
        expect.objectContaining({ permissionId: 'perm-2' }),
      ]);
    });

    it('should run inside transaction', async () => {
      rolePermissionRepo.find.mockResolvedValue([]);
      await service.assignPermissionsToRole('role-1', ['perm-1']);
      expect(dataSource.transaction).toHaveBeenCalled();
    });
  });

  // ============================================================
  // B3: deleteRole — pre-check user assigned
  // ============================================================
  describe('deleteRole (B3: pre-check user assigned)', () => {
    it('should throw BadRequestException when role still has active users', async () => {
      rbacUserRoleRepo.count.mockResolvedValue(3);

      await expect(service.deleteRole('role-1')).rejects.toThrow(BadRequestException);
      await expect(service.deleteRole('role-1')).rejects.toThrow('3 user');
    });

    it('should delete role_permission and role in transaction when no users', async () => {
      rbacUserRoleRepo.count.mockResolvedValue(0);

      await service.deleteRole('role-1');

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(permissionCache.invalidateAll).toHaveBeenCalled();
    });
  });

  // ============================================================
  // B4: assignRoleToUser — throw duplicate active
  // ============================================================
  describe('assignRoleToUser (B4: throw duplicate active)', () => {
    it('should throw BadRequestException when role already active', async () => {
      rbacUserRoleRepo.findOne.mockResolvedValue({
        id: 'ur-1',
        persnum: 123,
        roleId: 'role-1',
        active: true,
      });

      await expect(service.assignRoleToUser(123, 'role-1', null)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.assignRoleToUser(123, 'role-1', null)).rejects.toThrow(
        'sudah memiliki role',
      );
    });

    it('should re-activate when existing is nonaktif', async () => {
      const existing = { id: 'ur-1', persnum: 123, roleId: 'role-1', active: false };
      rbacUserRoleRepo.findOne.mockResolvedValue(existing);
      rbacUserRoleRepo.find.mockResolvedValue([]);

      const result = await service.assignRoleToUser(123, 'role-1', null);

      expect(existing.active).toBe(true);
      expect(rbacUserRoleRepo.save).toHaveBeenCalledWith(existing);
      expect(permissionCache.invalidate).toHaveBeenCalledWith(123);
    });

    it('should create new when not exists', async () => {
      rbacUserRoleRepo.findOne.mockResolvedValue(null);
      rbacUserRoleRepo.find.mockResolvedValue([]);

      const result = await service.assignRoleToUser(123, 'role-1', null);

      expect(rbacUserRoleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ persnum: 123, roleId: 'role-1', active: true }),
      );
      expect(permissionCache.invalidate).toHaveBeenCalledWith(123);
    });

    it('should throw with unit kerja info when duplicate with unitKerja', async () => {
      rbacUserRoleRepo.findOne.mockResolvedValue({
        id: 'ur-1',
        persnum: 123,
        roleId: 'role-1',
        unitKerja: 'CGK',
        active: true,
      });

      await expect(service.assignRoleToUser(123, 'role-1', 'CGK')).rejects.toThrow(
        'unit kerja: CGK',
      );
    });
  });

  // ============================================================
  // removeRoleFromUser (B9: last superadmin protection)
  // ============================================================
  describe('removeRoleFromUser', () => {
    it('should delete assignment for non-SUPERADMIN role', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: RoleName.ADMIN });

      await service.removeRoleFromUser(123, 'role-1');

      expect(rbacUserRoleRepo.delete).toHaveBeenCalledWith({ persnum: 123, roleId: 'role-1' });
      expect(permissionCache.invalidate).toHaveBeenCalledWith(123);
    });

    it('should throw BadRequestException when removing last SUPERADMIN', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-sa', name: RoleName.SUPERADMIN });
      rbacUserRoleRepo.findOne.mockResolvedValue({
        id: 'ur-1',
        persnum: 123,
        roleId: 'role-sa',
        active: true,
      });
      rbacUserRoleRepo.count.mockResolvedValue(1);

      await expect(service.removeRoleFromUser(123, 'role-sa')).rejects.toThrow(
        BadRequestException,
      );
      expect(rbacUserRoleRepo.delete).not.toHaveBeenCalled();
    });

    it('should allow removing SUPERADMIN when there are more than 1', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-sa', name: RoleName.SUPERADMIN });
      rbacUserRoleRepo.findOne.mockResolvedValue({
        id: 'ur-1',
        persnum: 123,
        roleId: 'role-sa',
        active: true,
      });
      rbacUserRoleRepo.count.mockResolvedValue(3);

      await service.removeRoleFromUser(123, 'role-sa');

      expect(rbacUserRoleRepo.delete).toHaveBeenCalledWith({ persnum: 123, roleId: 'role-sa' });
      expect(permissionCache.invalidate).toHaveBeenCalledWith(123);
    });

    it('should not throw when removing SUPERADMIN user does not have', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-sa', name: RoleName.SUPERADMIN });
      rbacUserRoleRepo.findOne.mockResolvedValue(null);

      await service.removeRoleFromUser(123, 'role-sa');

      expect(rbacUserRoleRepo.delete).toHaveBeenCalledWith({ persnum: 123, roleId: 'role-sa' });
    });
  });

  // ============================================================
  // getActiveRolesForPersnums
  // ============================================================
  describe('getActiveRolesForPersnums', () => {
    it('should return empty map for empty input', async () => {
      const result = await service.getActiveRolesForPersnums([]);
      expect(result.size).toBe(0);
    });

    it('should prioritize SUPERADMIN > ADMIN > USER', async () => {
      rbacUserRoleRepo.find.mockResolvedValue([
        { persnum: 1, role: { name: RoleName.ADMIN } },
        { persnum: 1, role: { name: RoleName.SUPERADMIN } },
        { persnum: 2, role: { name: RoleName.USER } },
      ]);

      const result = await service.getActiveRolesForPersnums([1, 2]);

      expect(result.get(1)).toBe(RoleName.SUPERADMIN);
      expect(result.get(2)).toBe(RoleName.USER);
    });

    it('should default to USER when persnum has no role', async () => {
      rbacUserRoleRepo.find.mockResolvedValue([]);

      const result = await service.getActiveRolesForPersnums([99]);

      expect(result.get(99)).toBe(RoleName.USER);
    });
  });

  // ============================================================
  // B7: findUserProfile
  // ============================================================
  describe('findUserProfile (B7)', () => {
    it('should return profile when person exists', async () => {
      personRepo.findOne.mockResolvedValue({ persnum: 123, name: 'John Doe' });

      const result = await service.findUserProfile(123);

      expect(result).toEqual({
        persnum: 123,
        name: 'John Doe',
        positionText: null,
      });
    });

    it('should return null when person not found', async () => {
      personRepo.findOne.mockResolvedValue(null);

      const result = await service.findUserProfile(999);

      expect(result).toBeNull();
    });
  });

  // ============================================================
  // B6: findAllUserRoles
  // ============================================================
  describe('findAllUserRoles (B6)', () => {
    it('should return paginated list', async () => {
      rbacUserRoleRepo.createQueryBuilder.mockReturnValue({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            { id: 'ur-1', persnum: 123, roleId: 'r1', role: { name: 'ADMIN' }, unitKerja: null, active: true, createdAt: new Date() },
          ],
          1,
        ]),
      });
      personRepo.find.mockResolvedValue([{ persnum: 123, name: 'John' }]);

      const result = await service.findAllUserRoles({ page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.data[0].name).toBe('John');
      expect(result.data[0].roleName).toBe('ADMIN');
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should default page to 1 and limit to 10', async () => {
      rbacUserRoleRepo.createQueryBuilder.mockReturnValue({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });

      const result = await service.findAllUserRoles({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });
});