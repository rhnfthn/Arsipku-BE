import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { RoleEntity, RoleName } from '../entities/role.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { RbacUserRoleEntity } from '../entities/rbac-user-role.entity';
import { utamaResources } from './utama-matrix';
import { utilitasResources } from './utilitas-matrix';
import { shareResources } from './share-matrix';
import { kelolaResources } from './kelola-matrix';
import { administrasiResources } from './administrasi-matrix';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// RBAC management resources (role, user-role, resource, permission, system-config)
const rbacManagementResources: {
  name: string;
  description: string;
  permissions: { action: string; description: string }[];
}[] = [
  {
    name: 'role',
    description: 'Manajemen role & permission (RBAC admin)',
    permissions: [
      {
        action: 'read',
        description: 'Melihat daftar role / permission / resource / user role',
      },
      { action: 'create', description: 'Membuat role baru' },
      { action: 'update', description: 'Update role' },
      { action: 'delete', description: 'Hapus role' },
      { action: 'assign-permission', description: 'Assign permission ke role' },
    ],
  },
  {
    name: 'user-role',
    description: 'Manajemen user role assignment',
    permissions: [
      { action: 'read', description: 'Melihat daftar user role' },
      { action: 'create', description: 'Assign role ke user' },
      { action: 'assign-role', description: 'Assign role ke user' },
      { action: 'delete', description: 'Hapus role dari user' },
    ],
  },
  {
    name: 'system-config',
    description: 'Konfigurasi sistem',
    permissions: [
      { action: 'read', description: 'Melihat konfigurasi sistem' },
      { action: 'update', description: 'Update konfigurasi sistem' },
    ],
  },
  // Legacy resources yang masih dipakai endpoint lama
  {
    name: 'delegasi',
    description: 'Manajemen delegasi role & switch role',
    permissions: [
      { action: 'create', description: 'Button Tambah Delegasi' },
      { action: 'read', description: 'Melihat daftar delegasi' },
      { action: 'update', description: 'Button Edit Delegasi' },
      { action: 'delete', description: 'Button Delete Delegasi' },
      { action: 'export', description: 'Button Export Delegasi' },
    ],
  },
  {
    name: 'dashboard',
    description: 'Dashboard & statistik (legacy)',
    permissions: [
      { action: 'read', description: 'Melihat dashboard' },
      { action: 'export', description: 'Export data dashboard' },
    ],
  },
  {
    name: 'titelatur',
    description: 'Manajemen Titelatur Inggris',
    permissions: [
      { action: 'create', description: 'Button Tambah Titelatur' },
      { action: 'read', description: 'Melihat halaman Titelatur' },
      { action: 'update', description: 'Button Edit Titelatur' },
      { action: 'delete', description: 'Button Delete Titelatur' },
    ],
  },
  {
    name: 'penomoran',
    description: 'Penomoran (legacy)',
    permissions: [
      { action: 'read-usulan', description: 'Melihat Usulan' },
      { action: 'read-persetujuan', description: 'Melihat Persetujuan' },
      { action: 'read-verifikasi', description: 'Melihat Verifikasi' },
      { action: 'read-penomoran', description: 'Melihat Penomoran' },
      { action: 'create-usulan', description: 'Button Tambah Usulan' },
      { action: 'create-penomoran', description: 'Button Tambah Penomoran' },
      { action: 'export-usulan', description: 'Export Usulan' },
      { action: 'export-persetujuan', description: 'Export Persetujuan' },
      { action: 'export-verifikasi', description: 'Export Verifikasi' },
      { action: 'export-penomoran', description: 'Export Penomoran' },
    ],
  },
  {
    name: 'naskah-masuk',
    description: 'Naskah Masuk (legacy)',
    permissions: [
      { action: 'create', description: 'Button Tambah Naskah Masuk' },
      { action: 'read-verifikasi', description: 'Halaman Verifikasi Naskah' },
      {
        action: 'read-verifikasi-detail',
        description: 'Button Show Detail Naskah',
      },
      { action: 'update-verifikasi', description: 'Button Edit Naskah' },
      { action: 'export', description: 'Export Naskah Masuk' },
    ],
  },
  {
    name: 'master-data',
    description: 'Data Master (legacy)',
    permissions: [
      { action: 'read-tertuju', description: 'Halaman Tertuju' },
      { action: 'create-tertuju', description: 'Button Tambah Tertuju' },
      { action: 'update-tertuju', description: 'Button Edit Tertuju' },
      { action: 'delete-tertuju', description: 'Button Hapus Tertuju' },
      { action: 'export-tertuju', description: 'Button Export Tertuju' },
      { action: 'read-perusahaan', description: 'Halaman Perusahaan' },
      { action: 'create-perusahaan', description: 'Button Tambah Perusahaan' },
      { action: 'update-perusahaan', description: 'Button Edit Perusahaan' },
      { action: 'delete-perusahaan', description: 'Button Delete Perusahaan' },
      { action: 'read-perusahaan-area', description: 'Button Action Area' },
      { action: 'read-klasifikasi', description: 'Halaman Klasifikasi' },
      {
        action: 'create-klasifikasi',
        description: 'Button Tambah Klasifikasi',
      },
      { action: 'update-klasifikasi', description: 'Button Edit Klasifikasi' },
      {
        action: 'delete-klasifikasi',
        description: 'Button Delete Klasifikasi',
      },
      {
        action: 'export-klasifikasi',
        description: 'Button Export Klasifikasi',
      },
      { action: 'read-jenis', description: 'Halaman Jenis' },
      { action: 'create-jenis', description: 'Button Tambah Jenis' },
      { action: 'update-jenis', description: 'Button Edit Jenis' },
      { action: 'delete-jenis', description: 'Button Delete Jenis' },
      { action: 'export-jenis', description: 'Button Export Jenis' },
      { action: 'read-jenis-detail', description: 'Button Detail Jenis' },
      { action: 'read-grup-penerima', description: 'Halaman Grup Penerima' },
      {
        action: 'create-grup-penerima',
        description: 'Button Tambah Grup Penerima',
      },
      {
        action: 'update-grup-penerima',
        description: 'Button Edit Grup Penerima',
      },
      {
        action: 'delete-grup-penerima',
        description: 'Button Delete Grup Penerima',
      },
      {
        action: 'read-grup-penerima-detail',
        description: 'Button Detail Grup Penerima',
      },
    ],
  },
  {
    name: 'laporan',
    description: 'Laporan (legacy)',
    permissions: [
      { action: 'read', description: 'Melihat halaman Laporan' },
      { action: 'export', description: 'Button Cetak/Export Laporan' },
    ],
  },
  {
    name: 'naskah-dinas',
    description: 'Naskah Dinas (legacy)',
    permissions: [
      { action: 'create', description: 'Membuat naskah dinas' },
      { action: 'read', description: 'Melihat daftar naskah dinas' },
      { action: 'read-detail', description: 'Melihat detail naskah dinas' },
      { action: 'update', description: 'Mengupdate naskah dinas' },
      { action: 'approve', description: 'Menyetujui naskah' },
      { action: 'sign', description: 'Tanda tangan elektronik' },
      { action: 'reject', description: 'Menolak naskah' },
      { action: 'send-email', description: 'Kirim via email' },
      { action: 'delete', description: 'Menghapus naskah' },
    ],
  },
  {
    name: 'faq',
    description: 'FAQ & manajemen FAQ',
    permissions: [
      { action: 'read', description: 'Melihat FAQ' },
      { action: 'create', description: 'Membuat FAQ' },
      { action: 'update', description: 'Mengedit FAQ' },
      { action: 'delete', description: 'Menghapus FAQ' },
      { action: 'export', description: 'Export FAQ' },
    ],
  },
  {
    name: 'pedoman',
    description: 'Pedoman',
    permissions: [
      { action: 'read', description: 'Melihat pedoman' },
      { action: 'create', description: 'Button Tambah Pedoman' },
      { action: 'update', description: 'Button Edit Pedoman' },
      { action: 'delete', description: 'Button Delete Pedoman' },
    ],
  },
  {
    name: 'digsig',
    description: 'TTD Digital (legacy resource)',
    permissions: [
      {
        action: 'read-verifikasi-dokumen',
        description: 'Halaman Verifikasi Dokumen',
      },
      {
        action: 'read-verifikasi-dokumen-detail',
        description: 'Button Show Detail',
      },
      {
        action: 'read-verifikasi-dokumen-lihat',
        description: 'Button Lihat Dokumen',
      },
      {
        action: 'create-verifikasi-dokumen',
        description: 'Button Tambah Dokumen',
      },
      {
        action: 'update-verifikasi-dokumen',
        description: 'Button Edit Dokumen',
      },
      {
        action: 'read-penandatanganan',
        description: 'Halaman Penandatanganan',
      },
      {
        action: 'read-penandatanganan-lihat',
        description: 'Button Lihat Dokumen',
      },
      {
        action: 'read-penandatanganan-detail',
        description: 'Button Show Detail',
      },
      { action: 'create-penandatanganan-ttd', description: 'Button TTD' },
      { action: 'create-penandatanganan-tolak', description: 'Button Tolak' },
      { action: 'read-cek-dokumen', description: 'Halaman Cek Dokumen' },
      { action: 'read-log-disdig', description: 'Halaman Log Disdig' },
      { action: 'create-log-disdig-alert', description: 'Button Alert' },
    ],
  },
  {
    name: 'layanan-email',
    description: 'Layanan Email (legacy resource — kept for compatibility)',
    permissions: [
      { action: 'create', description: 'Kirim Email' },
      { action: 'read', description: 'Melihat halaman Kirim Email' },
      { action: 'read-log', description: 'Melihat halaman Log Email' },
    ],
  },
  {
    name: 'template',
    description: 'Template (legacy resource)',
    permissions: [
      { action: 'read', description: 'Melihat Template' },
      { action: 'read-download', description: 'Button Download Template' },
    ],
  },
  {
    name: 'penyingkat-tautan',
    description: 'Penyingkatan Tautan (legacy resource)',
    permissions: [
      { action: 'create', description: 'Button Tambah Tautan' },
      { action: 'read', description: 'Melihat Penyingkatan Tautan' },
      { action: 'update', description: 'Button Edit Tautan' },
      { action: 'delete', description: 'Button Delete Tautan' },
    ],
  },
  {
    name: 'user',
    description: 'Manajemen user (legacy)',
    permissions: [
      { action: 'read', description: 'Melihat daftar user' },
      { action: 'create', description: 'Button Tambah Role' },
      { action: 'assign-role', description: 'Assign role ke user' },
      { action: 'export', description: 'Export user role' },
      { action: 'read-detail', description: 'Button Detail Role user' },
    ],
  },
  {
    name: 'surat-masuk-eksternal',
    description: 'Surat masuk eksternal (legacy)',
    permissions: [
      { action: 'create', description: 'Registrasi surat masuk' },
      { action: 'read', description: 'Melihat surat masuk' },
      { action: 'verify', description: 'Verifikasi surat masuk' },
    ],
  },
  {
    name: 'arsip-aktif',
    description: 'Arsip aktif (legacy)',
    permissions: [
      { action: 'create', description: 'Menciptakan arsip' },
      { action: 'read', description: 'Melihat arsip aktif' },
      { action: 'update', description: 'Update arsip' },
      { action: 'delete', description: 'Hapus arsip' },
    ],
  },
  {
    name: 'smart-search',
    description: 'Smart search (legacy)',
    permissions: [
      { action: 'search', description: 'Menggunakan smart search' },
    ],
  },
  {
    name: 'tata-naskah-pyb',
    description: 'Tata naskah PYB (legacy)',
    permissions: [
      { action: 'request', description: 'Mengajukan akses PYB' },
      { action: 'read', description: 'Melihat pengajuan' },
      { action: 'verify', description: 'Verifikasi pengajuan' },
      { action: 'approve', description: 'Approval final' },
    ],
  },
];

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
  const urRepo = dataSource.getRepository(RbacUserRoleEntity);

  // 1. Upsert 3 roles
  const roleDescs: Record<string, string> = {
    SUPERADMIN: 'Akses penuh seluruh sistem + manajemen RBAC',
    ADMIN: 'Operasional: Admin TU, User Managerial',
    USER: 'User biasa: penciptaan naskah, viewing arsip',
  };
  const roles: Record<string, RoleEntity> = {};
  for (const name of [RoleName.SUPERADMIN, RoleName.ADMIN, RoleName.USER]) {
    let role = await roleRepo.findOne({ where: { name } });
    if (!role) {
      role = roleRepo.create({
        id: uuidv4(),
        name,
        description: roleDescs[name],
      });
    } else {
      role.description = roleDescs[name];
    }
    await roleRepo.save(role);
    roles[name] = role;
  }
  console.log('✅ 3 roles upserted');

  // 2. Gather all resources (Utama + Utilitas + RBAC management)
  const allResources = [
    ...utamaResources,
    ...utilitasResources,
    ...shareResources,
    ...kelolaResources,
    ...administrasiResources.filter(
      (resource) => resource.name === 'correspondence-routing',
    ),
    ...rbacManagementResources,
  ];

  // 3. Upsert resources + permissions
  const permIdByName = new Map<string, string>();
  for (const rDef of allResources) {
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
    `✅ ${allResources.length} resources + ${permIdByName.size} permissions upserted`,
  );

  // 4. Assign ALL permissions (Utama + Utilitas + RBAC management) to SUPERADMIN (replace)
  const allPermIds = Array.from(permIdByName.values());
  await rpRepo.delete({ roleId: roles[RoleName.SUPERADMIN].id });
  const superadminRows = allPermIds.map((pid) => ({
    id: uuidv4(),
    roleId: roles[RoleName.SUPERADMIN].id,
    permissionId: pid,
  }));
  await rpRepo.save(superadminRows);
  console.log(
    `✅ ${allPermIds.length} permissions assigned to SUPERADMIN (full replace)`,
  );

  // 4b. Also add ALL other permissions in DB (from seed-rbac.ts: administrasi, laporan, faq, etc.)
  const allDbPerms = await permRepo.find({ select: ['id'] });
  const correspondenceRoutingPermissionIds = new Set(
    Array.from(permIdByName.entries())
      .filter(([name]) => name.startsWith('correspondence-routing.'))
      .map(([, id]) => id),
  );
  const allDbPermIds = allDbPerms.map((p) => p.id);

  // Append missing permissions to SUPERADMIN
  const superadminExisting = await rpRepo.find({
    where: { roleId: roles[RoleName.SUPERADMIN].id },
    select: ['permissionId'],
  });
  const superadminExistingIds = new Set(
    superadminExisting.map((rp) => rp.permissionId),
  );
  const superadminExtra = allDbPermIds
    .filter((pid) => !superadminExistingIds.has(pid))
    .map((pid) => ({
      id: uuidv4(),
      roleId: roles[RoleName.SUPERADMIN].id,
      permissionId: pid,
    }));
  if (superadminExtra.length > 0) {
    await rpRepo.save(superadminExtra);
    console.log(
      `✅ ${superadminExtra.length} extra permissions appended to SUPERADMIN (from seed-rbac.ts)`,
    );
  }

  // 4c. Assign ALL permissions (Utama + Utilitas + flat) to ADMIN and USER too (default: everything enabled)
  for (const roleName of [RoleName.ADMIN, RoleName.USER] as const) {
    const roleExisting = await rpRepo.find({
      where: { roleId: roles[roleName].id },
      select: ['permissionId'],
    });
    const roleExistingIds = new Set(roleExisting.map((rp) => rp.permissionId));
    // Routing configuration is a security-sensitive v1 feature. Generic seed
    // keeps it SUPERADMIN-only; any broader grant must be explicit in RBAC UI.
    const roleExtra = allDbPermIds
      .filter((pid) => !correspondenceRoutingPermissionIds.has(pid))
      .filter((pid) => !roleExistingIds.has(pid))
      .map((pid) => ({
        id: uuidv4(),
        roleId: roles[roleName].id,
        permissionId: pid,
      }));
    if (roleExtra.length > 0) {
      await rpRepo.save(roleExtra);
      console.log(
        `✅ ${roleExtra.length} extra permissions appended to ${roleName} (Utama+Utilitas matrix)`,
      );
    }
  }

  // 5. Assign user persnum ke SUPERADMIN (jika belum)
  const superadminPersnum = Number(process.env.SUPERADMIN_PERSNUM || 10083493);
  const existingUR = await urRepo.findOne({
    where: {
      persnum: superadminPersnum,
      roleId: roles[RoleName.SUPERADMIN].id,
    },
  });
  if (!existingUR) {
    // Deactivate existing active roles for this user first
    await urRepo.delete({ persnum: superadminPersnum, active: true });
    await urRepo.save({
      id: uuidv4(),
      persnum: superadminPersnum,
      roleId: roles[RoleName.SUPERADMIN].id,
      active: true,
    });
    console.log(`✅ User persnum ${superadminPersnum} assigned to SUPERADMIN`);
  } else if (!existingUR.active) {
    existingUR.active = true;
    await urRepo.save(existingUR);
    console.log(`✅ User persnum ${superadminPersnum} SUPERADMIN re-activated`);
  } else {
    console.log(`✅ User persnum ${superadminPersnum} already SUPERADMIN`);
  }

  await dataSource.destroy();
  console.log('🎉 Seed ALL complete — SUPERADMIN has all permissions');
}

main().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
