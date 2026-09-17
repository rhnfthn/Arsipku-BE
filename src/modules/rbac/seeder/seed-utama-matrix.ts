import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { RoleEntity, RoleName } from '../entities/role.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { RbacUserRoleEntity } from '../entities/rbac-user-role.entity';
import { utamaResources, utamaSuperAdminPermissions } from './utama-matrix';
import { kelolaResources, kelolaSuperAdminPermissions } from './kelola-matrix';
import { tugasResources, tugasSuperAdminPermissions } from './tugas-matrix';

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

  // 1. Upsert resources + permissions (idempotent by name)
  const permIdByName = new Map<string, string>();
  for (const rDef of utamaResources) {
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

  // Kelola memakai resource yang sama dengan modul arsip dinamis. Upsert
  // additive di sini memastikan permission baru (Penggunaan dan action
  // Pemberkasan) tersedia untuk matrix editor tanpa menghapus permission lama.
  for (const rDef of kelolaResources) {
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

  for (const rDef of tugasResources) {
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

  // Retensi bukan lagi permission RBAC terpisah. Bersihkan assignment dan
  // record legacy agar tidak muncul kembali di daftar permission/resource.
  const legacyRetensiResource = await resourceRepo.findOne({
    where: { name: 'pemeliharaan.retensi' },
  });
  if (legacyRetensiResource) {
    const legacyRetensiPermissions = await permRepo.find({
      where: { resourceId: legacyRetensiResource.id },
      select: ['id'],
    });
    for (const permission of legacyRetensiPermissions) {
      await rpRepo.delete({ permissionId: permission.id });
      await permRepo.delete(permission.id);
    }
    await resourceRepo.delete(legacyRetensiResource.id);
  }

  console.log(
    `✅ Utama + Kelola + Tugas matrix: ${utamaResources.length + kelolaResources.length + tugasResources.length} resources + ${permIdByName.size} permissions upserted`,
  );

  // 2. Assign all Utama permissions to SUPERADMIN (additive)
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
  for (const permName of [...utamaSuperAdminPermissions, ...kelolaSuperAdminPermissions, ...tugasSuperAdminPermissions]) {
    const pid = permIdByName.get(permName);
    if (!pid) {
      console.warn(`⚠️ Permission "${permName}" not found`);
      continue;
    }
    if (!existingPermIds.has(pid)) {
      toAdd.push({ id: uuidv4(), roleId: superadmin.id, permissionId: pid });
    }
  }
  if (toAdd.length > 0) {
    await rpRepo.save(toAdd);
  }
  console.log(
    `✅ ${toAdd.length} Utama permissions assigned to SUPERADMIN (existing ${existing.length})`,
  );

  // Migrasi permission halaman Berbagi secara aman. Role yang sebelumnya
  // memiliki permission legacy naskah-share.read tetap mendapatkan akses ke
  // kedua submenu baru, tanpa membuka akses untuk role yang sebelumnya tidak
  // memiliki fitur Berbagi.
  const legacyShareRead = await permRepo.findOne({
    where: { name: 'naskah-share.read' },
  });
  const sharePagePermissionIds = [
    permIdByName.get('naskah-share.read-saya-bagikan'),
    permIdByName.get('naskah-share.read-dibagikan-kepada-saya'),
  ].filter((id): id is string => Boolean(id));

  if (legacyShareRead && sharePagePermissionIds.length > 0) {
    for (const roleName of [RoleName.SUPERADMIN, RoleName.ADMIN, RoleName.USER]) {
      const role = await roleRepo.findOne({ where: { name: roleName } });
      if (!role) continue;

      const rolePermissions = await rpRepo.find({ where: { roleId: role.id } });
      const rolePermissionIds = new Set(rolePermissions.map((rp) => rp.permissionId));
      if (!rolePermissionIds.has(legacyShareRead.id)) continue;

      const missingSharePermissions = sharePagePermissionIds
        .filter((permissionId) => !rolePermissionIds.has(permissionId))
        .map((permissionId) => ({
          id: uuidv4(),
          roleId: role.id,
          permissionId,
        }));

      if (missingSharePermissions.length > 0) {
        await rpRepo.save(missingSharePermissions);
      }
    }
  }

  await dataSource.destroy();
  console.log('🎉 Utama matrix seed complete');
}

main().catch((e) => {
  console.error('❌ Utama matrix seed failed:', e);
  process.exit(1);
});
