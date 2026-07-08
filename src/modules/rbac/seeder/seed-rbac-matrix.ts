import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { RoleEntity, RoleName } from '../entities/role.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import {
  rbacResourcesWithPermissions,
  rbacRolePermissionAssignments,
} from './rbac-matrix-data';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function buildDataSource(): DataSource {
  const env = process.env;
  return new DataSource({
    type: 'mysql',
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    username: env.DB_USER || 'root',
    password: env.DB_PASS || '',
    database: env.DB_NAME || 'arsipku',
    entities: [RoleEntity, ResourceEntity, PermissionEntity, RolePermissionEntity],
    synchronize: false,
    timezone: '+07:00',
  });
}

async function main() {
  const dataSource = buildDataSource();
  await dataSource.initialize();

  const roleRepo = dataSource.getRepository(RoleEntity);
  const resourceRepo = dataSource.getRepository(ResourceEntity);
  const permRepo = dataSource.getRepository(PermissionEntity);
  const rpRepo = dataSource.getRepository(RolePermissionEntity);

  // 1. Upsert resources + permissions from matrix data (idempotent by name)
  const permIdByName = new Map<string, string>();
  for (const rDef of rbacResourcesWithPermissions) {
    let resource = await resourceRepo.findOne({ where: { name: rDef.name } });
    if (!resource) {
      resource = resourceRepo.create({
        id: uuidv4(),
        name: rDef.name,
        description: rDef.description,
      });
    } else {
      resource.description = rDef.description;
    }
    await resourceRepo.save(resource);

    for (const pDef of rDef.permissions) {
      const permName = `${rDef.name}.${pDef.action}`;
      let perm = await permRepo.findOne({ where: { name: permName } });
      if (!perm) {
        perm = permRepo.create({
          id: uuidv4(),
          name: permName,
          description: pDef.description,
          action: pDef.action,
          resourceId: resource.id,
        });
      } else {
        perm.description = pDef.description;
        perm.action = pDef.action;
        perm.resourceId = resource.id;
      }
      await permRepo.save(perm);
      permIdByName.set(permName, perm.id);
    }
  }
  console.log(`✅ Matrix seed: ${rbacResourcesWithPermissions.length} resources + ${permIdByName.size} permissions upserted`);

  // 2. Assign matrix permissions to roles (merge/additive, does not remove existing)
  const roleNameToEntity: Record<string, RoleEntity> = {};
  for (const name of [RoleName.SUPERADMIN, RoleName.ADMIN, RoleName.USER]) {
    const role = await roleRepo.findOne({ where: { name } });
    if (!role) {
      console.warn(`⚠️ Role ${name} not found, skipping matrix assignment`);
      continue;
    }
    roleNameToEntity[name] = role;
  }

  for (const [roleKey, permNames] of Object.entries(rbacRolePermissionAssignments)) {
    const roleName = roleKey.toUpperCase() === 'SUPERADMIN' ? RoleName.SUPERADMIN
      : roleKey.toUpperCase() === 'ADMIN' ? RoleName.ADMIN
      : roleKey.toUpperCase() === 'USER' ? RoleName.USER
      : undefined;
    if (!roleName) continue;
    const role = roleNameToEntity[roleName];
    if (!role) continue;

    const existing = await rpRepo.find({ where: { roleId: role.id } });
    const existingPermIds = new Set(existing.map((rp) => rp.permissionId));
    const existingNameById = new Map(existing.map((rp) => [rp.permissionId, rp]));

    const toAdd: { id: string; roleId: string; permissionId: string }[] = [];
    for (const permName of permNames) {
      const pid = permIdByName.get(permName);
      if (!pid) {
        console.warn(`⚠️ Matrix permission "${permName}" not found (skip)`);
        continue;
      }
      if (!existingPermIds.has(pid)) {
        toAdd.push({ id: uuidv4(), roleId: role.id, permissionId: pid });
      }
    }
    if (toAdd.length > 0) {
      await rpRepo.save(toAdd);
    }
    console.log(`✅ ${toAdd.length} matrix permissions added to ${roleName} (existing ${existing.length})`);
  }

  await dataSource.destroy();
  console.log('🎉 RBAC matrix seed complete');
}

main().catch((e) => {
  console.error('❌ RBAC matrix seed failed:', e);
  process.exit(1);
});
