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
// Definisi 19 resource + permission per resource (URS Poin 12)
// 15 original + 4 baru (master-data, laporan, konfigurasi, delegasi)
// + action arsip-aktif.delete
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
      { action: 'approve', description: 'Menyetujui naskah dinas' },
      { action: 'sign', description: 'Tanda tangan elektronik' },
      { action: 'reject', description: 'Menolak naskah/dokumen' },
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
    name: 'penomoran',
    description: 'Permintaan & verifikasi penomoran naskah dinas',
    permissions: [
      { action: 'read', description: 'Melihat daftar permintaan nomor' },
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
      { action: 'delete', description: 'Menghapus arsip aktif' },
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
    name: 'pedoman',
    description: 'Fitur pedoman (Peraturan/Keputusan Direksi, SOP)',
    permissions: [{ action: 'read', description: 'Melihat pedoman (semua role)' }],
  },
  {
    name: 'faq',
    description: 'FAQ & manajemen FAQ (menggantikan resource helpdesk lama)',
    permissions: [
      { action: 'read', description: 'Melihat FAQ' },
      { action: 'manage', description: 'Mengelola FAQ (PIC)' },
      { action: 'create', description: 'Membuat FAQ' },
      { action: 'update', description: 'Mengedit FAQ' },
      { action: 'delete', description: 'Menghapus FAQ' },
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
  {
    name: 'master-data',
    description: 'Manajemen master data (jenis, klasifikasi, perusahaan, organization, area, person, tertuju eksternal, template, grup penerima)',
    permissions: [
      { action: 'create', description: 'Menciptakan master data' },
      { action: 'read', description: 'Melihat daftar master data' },
      { action: 'update', description: 'Update master data' },
      { action: 'delete', description: 'Hapus master data' },
    ],
  },
  {
    name: 'laporan',
    description: 'Laporan & rekapitulasi naskah dinas',
    permissions: [
      { action: 'read', description: 'Melihat laporan' },
      { action: 'export', description: 'Export laporan (PDF/Excel)' },
    ],
  },
  {
    name: 'konfigurasi',
    description: 'Konfigurasi sistem (announcement banner, digsig config, bsre alert)',
    permissions: [
      { action: 'read', description: 'Melihat konfigurasi' },
      { action: 'update', description: 'Update konfigurasi' },
    ],
  },
  {
    name: 'delegasi',
    description: 'Manajemen delegasi role & switch role / switch company',
    permissions: [
      { action: 'create', description: 'Membuat delegasi / switch role' },
      { action: 'read', description: 'Melihat daftar delegasi' },
      { action: 'update', description: 'Update delegasi' },
      { action: 'delete', description: 'Hapus delegasi' },
    ],
  },
];

// ============================================================
// Assignment permission per role (sesuai matriks §7.2 rbac.md)
// SUPERADMIN: ALL permission (dari definisi resources) — tidak ada bypass guard
// ADMIN: operasional full
// USER: create naskah + view arsip + request penomoran
// ============================================================

const allPermissionNames: string[] = resourcesWithPermissions.flatMap(
  (r) => r.permissions.map((p) => `${r.name}.${p.action}`),
);

const rolePermissionAssignments: Record<string, string[]> = {
  SUPERADMIN: allPermissionNames,
  ADMIN: [
    'naskah-dinas.create',
    'naskah-dinas.read',
    'naskah-dinas.read-detail',
    'naskah-dinas.update',
    'naskah-dinas.approve',
    'naskah-dinas.sign',
    'naskah-dinas.reject',
    'naskah-dinas.send-email',
    'surat-masuk-eksternal.create',
    'surat-masuk-eksternal.read',
    'surat-masuk-eksternal.verify',
    'penomoran.read',
    'penomoran.report',
    'arsip-aktif.create',
    'arsip-aktif.read',
    'arsip-aktif.update',
    'arsip-aktif.delete',
    'tata-naskah-pyb.request',
    'tata-naskah-pyb.read',
    'tata-naskah-pyb.verify',
    'tata-naskah-pyb.approve',
    'user.read',
    'user.assign-role',
    'pedoman.read',
    'faq.read',
    'faq.manage',
    'faq.create',
    'faq.update',
    'faq.delete',
    'dashboard.read',
    'smart-search.search',
    'master-data.create',
    'master-data.read',
    'master-data.update',
    'master-data.delete',
    'laporan.read',
    'laporan.export',
    'konfigurasi.read',
    'konfigurasi.update',
    'delegasi.create',
    'delegasi.read',
    'delegasi.update',
    'delegasi.delete',
  ],
  USER: [
    'naskah-dinas.create',
    'naskah-dinas.read',
    'naskah-dinas.read-detail',
    'penomoran.read',
    'arsip-aktif.read',
    'pedoman.read',
    'faq.read',
    'smart-search.search',
    'dashboard.read',
    // Permission baru (Tahap 1 RBAC hardening) — USER read-only
    'master-data.read',
    'laporan.read',
    'konfigurasi.read',
    'delegasi.read',
  ],
};

const roleDescriptions: Record<RoleName, string> = {
  [RoleName.SUPERADMIN]: 'Akses penuh seluruh aspek sistem + manajemen RBAC',
  [RoleName.ADMIN]: 'Operasional: Admin TU, User Managerial',
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

  // 4. Cleanup legacy resources & permissions yang sudah tidak dipakai
  //    (resource 'helpdesk' & 'sekretaris' sudah diganti/dihapus dari seeder).
  const legacyResourceNames = ['helpdesk', 'sekretaris', 'arsip-inaktif', 'pemusnahan'];
  // Permission lama yang sudah dihapus dari seeder (fitur tidak ada)
  const legacyPermissionNames = [
    'arsip-aktif.borrow',
    'arsip-aktif.return',
    'arsip-aktif.monitor-retensi',
    'naskah-dinas.delete',
    'penomoran.request',
    'penomoran.verify',
  ];
  for (const permName of legacyPermissionNames) {
    const legacyPerm = await permRepo.findOne({ where: { name: permName } });
    if (!legacyPerm) continue;
    await rpRepo.delete({ permissionId: legacyPerm.id });
    await permRepo.delete(legacyPerm.id);
    console.log(`🧹 Legacy permission '${permName}' removed`);
  }
  for (const legacyName of legacyResourceNames) {
    const legacyResource = await resourceRepo.findOne({ where: { name: legacyName } });
    if (!legacyResource) continue;
    // Hapus semua role_permission yang menunjuk ke permission dari resource ini
    const legacyPerms = await permRepo.find({ where: { resourceId: legacyResource.id } });
    for (const lp of legacyPerms) {
      await rpRepo.delete({ permissionId: lp.id });
      await permRepo.delete(lp.id);
    }
    await resourceRepo.delete(legacyResource.id);
    console.log(`🧹 Legacy resource '${legacyName}' + ${legacyPerms.length} permissions removed`);
  }

  await dataSource.destroy();
  console.log('🎉 RBAC seed complete');
}

main().catch((e) => {
  console.error('❌ RBAC seed failed:', e);
  process.exit(1);
});