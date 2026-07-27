import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { RoleEntity, RoleName } from '../entities/role.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { RbacUserRoleEntity } from '../entities/rbac-user-role.entity';
import {
  utilitasResources,
  utilitasSuperAdminPermissions,
} from './utilitas-matrix';

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
    entities: [
      RoleEntity,
      ResourceEntity,
      PermissionEntity,
      RolePermissionEntity,
      RbacUserRoleEntity,
    ],
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

  const permIdByName = new Map<string, string>();
  for (const rDef of utilitasResources) {
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
  console.log(
    `✅ Utilitas matrix: ${utilitasResources.length} resources + ${permIdByName.size} permissions upserted`,
  );

  const superadmin = await roleRepo.findOne({
    where: { name: RoleName.SUPERADMIN },
  });
  if (!superadmin) {
    console.warn('⚠️ Role SUPERADMIN not found');
    await dataSource.destroy();
    return;
  }

  const existing = await rpRepo.find({ where: { roleId: superadmin.id } });
  const existingPermIds = new Set(existing.map((rp) => rp.permissionId));
  const toAdd: { id: string; roleId: string; permissionId: string }[] = [];
  for (const permName of utilitasSuperAdminPermissions) {
    const pid = permIdByName.get(permName);
    if (!pid) continue;
    if (!existingPermIds.has(pid)) {
      toAdd.push({ id: uuidv4(), roleId: superadmin.id, permissionId: pid });
    }
  }
  if (toAdd.length > 0) await rpRepo.save(toAdd);
  console.log(
    `✅ ${toAdd.length} Utilitas permissions assigned to SUPERADMIN (existing ${existing.length})`,
  );

  await dataSource.destroy();
  console.log('🎉 Utilitas matrix seed complete');
}

main().catch((e) => {
  console.error('❌ Utilitas matrix seed failed:', e);
  process.exit(1);
});
