import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { RoleEntity, RoleName } from '../entities/role.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { RbacUserRoleEntity } from '../entities/rbac-user-role.entity';

// Load .env dari root arsipku-be
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// ============================================================
// Definisi 15 resource + permission per resource (URS Poin 12)
// ============================================================

interface PermDef {
  action: string;
  description: string;
}
interface ResourceDef {
  name: string;
  description: string;
  permissions: PermDef[];
}

const resourcesWithPermissions: ResourceDef[] = [
  {
    name: 'naskah-dinas',
    description: 'Penciptaan & pengelolaan naskah dinas',
    permissions: [
      { action: 'create', description: 'Membuat naskah dinas' },
      { action: 'read', description: 'Melihat daftar naskah dinas' },
      { action: 'read-detail', description: 'Melihat detail naskah dinas' },
      { action: 'update', description: 'Mengupdate draft naskah dinas' },
      { action: 'delete', description: 'Menghapus draft naskah dinas' },
      { action: 'approve', description: 'Menyetujui naskah dinas' },
      { action: 'sign', description: 'Tanda tangan elektronik' },
      { action: 'send-email', description: 'Kirim surat eksternal via email' },
    ],
  },
  {
    name: 'surat-masuk-eksternal',
    description: 'Registrasi & otorisasi surat masuk dari eksternal',
    permissions: [
      { action: 'create', description: 'Registrasi surat masuk eksternal' },
      { action: 'read', description: 'Melihat daftar surat masuk' },
      { action: 'verify', description: 'Verifikasi & disposisi surat masuk' },
    ],
  },
  {
    name: 'surat-keluar-eksternal',
    description: 'Pengiriman surat dinas ke eksternal via email',
    permissions: [
      { action: 'send', description: 'Kirim surat ke email eksternal' },
      { action: 'read', description: 'Melihat status pengiriman' },
    ],
  },
  {
    name: 'penomoran',
    description: 'Permintaan & verifikasi penomoran naskah dinas',
    permissions: [
      { action: 'request', description: 'Mengajukan permintaan nomor' },
      { action: 'read', description: 'Melihat daftar permintaan nomor' },
      { action: 'verify', description: 'Verifikasi permintaan nomor (Admin TU)' },
      { action: 'report', description: 'Melihat laporan rekapitulasi penomoran' },
    ],
  },
  {
    name: 'arsip-aktif',
    description: 'Pengelolaan arsip aktif (peminjaman, retensi)',
    permissions: [
      { action: 'create', description: 'Menciptakan arsip' },
      { action: 'read', description: 'Melihat daftar arsip aktif' },
      { action: 'update', description: 'Update metadata arsip' },
      { action: 'borrow', description: 'Peminjaman arsip' },
      { action: 'return', description: 'Pengembalian arsip' },
      { action: 'monitor-retensi', description: 'Monitoring masa retensi' },
    ],
  },
  {
    name: 'arsip-inaktif',
    description: 'Pengelolaan arsip inaktif',
    permissions: [
      { action: 'read', description: 'Melihat daftar arsip inaktif' },
      { action: 'verify', description: 'Verifikasi arsip dari unit kerja' },
      { action: 'transfer', description: 'Memindahkan status arsip aktif → inaktif' },
      { action: 'borrow', description: 'Peminjaman arsip inaktif' },
    ],
  },
  {
    name: 'pemusnahan',
    description: 'Usulan & persetujuan pemusnahan arsip',
    permissions: [
      { action: 'propose', description: 'Mengajukan usulan pemusnahan' },
      { action: 'read', description: 'Melihat daftar usulan pemusnahan' },
      { action: 'approve', description: 'Menyetujui pemusnahan' },
      { action: 'execute', description: 'Eksekusi pemusnahan' },
    ],
  },
  {
    name: 'tata-naskah-pyb',
    description: 'Pengaturan akses PYB/Direksi Pekerjaan/Ketua Tim',
    permissions: [
      { action: 'request', description: 'Mengajukan akses PYB/Ketua Tim' },
      { action: 'read', description: 'Melihat daftar pengajuan' },
      { action: 'verify', description: 'Verifikasi pengajuan (2 tingkat di bawah Direksi)' },
      { action: 'approve', description: 'Approval final (Sub Unit Document Management)' },
    ],
  },
  {
    name: 'sekretaris',
    description: 'Pengaturan penunjukkan sekretaris',
    permissions: [
      { action: 'assign', description: 'Menunjuk sekretaris' },
      { action: 'read', description: 'Melihat daftar sekretaris' },
    ],
  },
  {
    name: 'pedoman',
    description: 'Fitur pedoman (Peraturan/Keputusan Direksi, SOP)',
    permissions: [{ action: 'read', description: 'Melihat pedoman (semua role)' }],
  },
  {
    name: 'helpdesk',
    description: 'PIC Helpdesk (manajemen tiket)',
    permissions: [
      { action: 'read', description: 'Melihat tiket helpdesk' },
      { action: 'manage', description: 'Mengelola tiket (PIC)' },
      { action: 'create', description: 'Membuat tiket bantuan' },
    ],
  },
  {
    name: 'user',
    description: 'Manajemen user (dari organization_assignment)',
    permissions: [
      { action: 'read', description: 'Melihat daftar user' },
      { action: 'assign-role', description: 'Assign role ke user' },
    ],
  },
  {
    name: 'role',
    description: 'Manajemen role & permission (RBAC admin)',
    permissions: [
      { action: 'read', description: 'Melihat daftar role' },
      { action: 'create', description: 'Membuat role baru' },
      { action: 'update', description: 'Update role' },
      { action: 'delete', description: 'Hapus role' },
      { action: 'assign-permission', description: 'Assign permission ke role' },
    ],
  },
  {
    name: 'smart-search',
    description: 'Fitur pencarian naskah dinas',
    permissions: [{ action: 'search', description: 'Menggunakan fitur smart search' }],
  },
  {
    name: 'dashboard',
    description: 'Dashboard & statistik',
    permissions: [{ action: 'read', description: 'Melihat dashboard & statistik' }],
  },
];

// ============================================================
// Assignment permission per role (sesuai matriks §7.2 rbac.md)
// SUPERADMIN: explicit role.* + user.* (sisanya via bypass)
// ADMIN: operasional full
// USER: create naskah + view arsip + request penomoran + helpdesk create
// ============================================================

const rolePermissionAssignments: Record<string, string[]> = {
  SUPERADMIN: [
    'role.read',
    'role.create',
    'role.update',
    'role.delete',
    'role.assign-permission',
    'user.read',
    'user.assign-role',
  ],
  ADMIN: [
    'naskah-dinas.create',
    'naskah-dinas.read',
    'naskah-dinas.read-detail',
    'naskah-dinas.update',
    'naskah-dinas.delete',
    'surat-masuk-eksternal.create',
    'surat-masuk-eksternal.read',
    'surat-masuk-eksternal.verify',
    'surat-keluar-eksternal.send',
    'surat-keluar-eksternal.read',
    'penomoran.request',
    'penomoran.read',
    'penomoran.verify',
    'penomoran.report',
    'arsip-aktif.create',
    'arsip-aktif.read',
    'arsip-aktif.update',
    'arsip-aktif.borrow',
    'arsip-aktif.return',
    'arsip-aktif.monitor-retensi',
    'arsip-inaktif.read',
    'arsip-inaktif.verify',
    'arsip-inaktif.transfer',
    'arsip-inaktif.borrow',
    'pemusnahan.propose',
    'pemusnahan.read',
    'pemusnahan.approve',
    'pemusnahan.execute',
    'sekretaris.assign',
    'sekretaris.read',
    'tata-naskah-pyb.request',
    'tata-naskah-pyb.read',
    'tata-naskah-pyb.verify',
    'tata-naskah-pyb.approve',
    'helpdesk.read',
    'helpdesk.manage',
    'helpdesk.create',
    'user.read',
    'pedoman.read',
    'dashboard.read',
    'smart-search.search',
  ],
  USER: [
    'naskah-dinas.create',
    'naskah-dinas.read',
    'naskah-dinas.read-detail',
    'penomoran.request',
    'penomoran.read',
    'arsip-aktif.read',
    'pedoman.read',
    'smart-search.search',
    'dashboard.read',
    'helpdesk.create',
  ],
};

const roleDescriptions: Record<RoleName, string> = {
  [RoleName.SUPERADMIN]: 'Akses penuh seluruh aspek sistem + manajemen RBAC',
  [RoleName.ADMIN]: 'Operasional: Admin TU, Sekretaris, User Managerial, PIC Helpdesk',
  [RoleName.USER]: 'User biasa: penciptaan naskah, viewing arsip, pengajuan penomoran',
};

// ============================================================
// DataSource config dari environment
// ============================================================

function buildDataSource(): DataSource {
  const env = process.env;
  return new DataSource({
    type: 'mysql',
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    username: env.DB_USER || 'root',
    password: env.DB_PASS || '',
    database: env.DB_NAME || 'arsipku',
    entities: [RoleEntity, ResourceEntity, PermissionEntity, RolePermissionEntity, RbacUserRoleEntity],
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

  // 1. Upsert 3 role
  const roles: Record<string, RoleEntity> = {};
  for (const name of [RoleName.SUPERADMIN, RoleName.ADMIN, RoleName.USER]) {
    let role = await roleRepo.findOne({ where: { name } });
    if (!role) {
      role = roleRepo.create({
        id: uuidv4(),
        name,
        description: roleDescriptions[name],
      });
    } else {
      role.description = roleDescriptions[name];
    }
    await roleRepo.save(role);
    roles[name] = role;
  }
  console.log('✅ 3 roles upserted');

  // 2. Upsert resources + permissions (idempotent by name)
  const permIdByName = new Map<string, string>();
  for (const rDef of resourcesWithPermissions) {
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
  console.log(`✅ ${resourcesWithPermissions.length} resources + ${permIdByName.size} permissions upserted`);

  // 3. Assign permissions to roles (replace per role)
  for (const [roleName, permNames] of Object.entries(rolePermissionAssignments)) {
    const role = roles[roleName];
    if (!role) continue;
    await rpRepo.delete({ roleId: role.id });
    for (const permName of permNames) {
      const pid = permIdByName.get(permName);
      if (!pid) {
        console.warn(`⚠️  Permission "${permName}" not found (skip)`);
        continue;
      }
      await rpRepo.save({ id: uuidv4(), roleId: role.id, permissionId: pid });
    }
    console.log(`✅ ${permNames.length} permissions assigned to ${roleName}`);
  }

  await dataSource.destroy();
  console.log('🎉 RBAC seed complete');
}

main().catch((e) => {
  console.error('❌ RBAC seed failed:', e);
  process.exit(1);
});