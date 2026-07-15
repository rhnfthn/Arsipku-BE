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
      { action: 'delete', description: 'Menghapus naskah dinas' },
    ],
  },
  {
    name: 'nota-dinas',
    description: 'Halaman Nota Dinas (Tulis & Kelola)',
    permissions: [
      { action: 'read-page', description: 'Melihat halaman Nota Dinas' },
      { action: 'read-template', description: 'Button Pilih Template' },
      { action: 'read-template-saya', description: 'Button Template Saya' },
      { action: 'create-template', description: 'Simpan Template' },
      { action: 'create-preview', description: 'Button Pratinjau' },
      { action: 'create-upload', description: 'Upload Lampiran' },
      { action: 'create-send', description: 'Button Kirim' },
    ],
  },
  {
    name: 'disposisi',
    description: 'Halaman Disposisi (Tulis & Kelola)',
    permissions: [
      { action: 'read-page', description: 'Melihat halaman Disposisi' },
      { action: 'create-preview', description: 'Button Pratinjau' },
      { action: 'create-send', description: 'Button Kirim' },
    ],
  },
  {
    name: 'surat-dinas-internal',
    description: 'Halaman Surat Dinas Internal (Tulis & Kelola)',
    permissions: [
      { action: 'read-page', description: 'Melihat halaman SDI' },
      { action: 'read-template', description: 'Button Pilih Template' },
      { action: 'read-template-saya', description: 'Button Template Saya' },
      { action: 'create-template', description: 'Simpan Template' },
      { action: 'create-preview', description: 'Button Pratinjau' },
      { action: 'create-upload', description: 'Upload Lampiran' },
      { action: 'create-send', description: 'Button Kirim' },
    ],
  },
  {
    name: 'surat-dinas-eksternal',
    description: 'Halaman Surat Dinas Eksternal (Tulis & Kelola)',
    permissions: [
      { action: 'read-page', description: 'Melihat halaman SDE' },
      { action: 'read-template', description: 'Button Pilih Template' },
      { action: 'read-template-saya', description: 'Button Template Saya' },
      { action: 'create-template', description: 'Simpan Template' },
      { action: 'create-preview', description: 'Button Pratinjau' },
      { action: 'create-upload', description: 'Upload Lampiran' },
      { action: 'create-send', description: 'Button Kirim' },
    ],
  },
  {
    name: 'kajian',
    description: 'Halaman Kajian (Tulis & Kelola)',
    permissions: [
      { action: 'read-page', description: 'Melihat halaman Kajian' },
      { action: 'read-template', description: 'Button Pilih Template Kajian' },
      { action: 'read-template-saya', description: 'Button Template Saya Kajian' },
      { action: 'create-preview', description: 'Button Pratinjau' },
      { action: 'create-draft', description: 'Button Draft' },
      { action: 'create-send', description: 'Button Kirim' },
    ],
  },
  {
    name: 'naskah-lainnya',
    description: 'Halaman Naskah Lainnya / Naskah Umum (Tulis & Kelola)',
    permissions: [
      { action: 'read-page', description: 'Melihat halaman Naskah Lainnya' },
      { action: 'create-preview', description: 'Button Pratinjau' },
      { action: 'create-draft', description: 'Button Simpan Draft' },
      { action: 'create-send', description: 'Button Kirim' },
    ],
  },
  {
    name: 'kotak-masuk',
    description: 'Kotak Masuk — daftar & detail surat masuk',
    permissions: [
      { action: 'read-page', description: 'Melihat daftar Kotak Masuk' },
      { action: 'read-filter', description: 'Pencarian & filter Kotak Masuk' },
      { action: 'read-detail', description: 'Melihat detail Kotak Masuk' },
      { action: 'read-unduh', description: 'Unduh lampiran Kotak Masuk' },
      { action: 'read-lanjut-nd', description: 'Lanjutkan sebagai Nota Dinas' },
      { action: 'read-lanjut-disposisi', description: 'Lanjutkan sebagai Disposisi' },
      { action: 'read-lanjut-sdi', description: 'Lanjutkan sebagai SDI' },
      { action: 'read-lanjut-sde', description: 'Lanjutkan sebagai SDE' },
      { action: 'read-lanjut-kajian', description: 'Lanjutkan sebagai Kajian' },
      { action: 'read-lanjut-nl', description: 'Lanjutkan sebagai Naskah Lainnya' },
      { action: 'create-balas', description: 'Button Balas Surat' },
      { action: 'create-teruskan', description: 'Button Teruskan' },
      { action: 'update-arsip', description: 'Button Arsipkan' },
    ],
  },
  {
    name: 'terkirim',
    description: 'Halaman Surat Terkirim — daftar & detail',
    permissions: [
      { action: 'read-page', description: 'Melihat daftar Surat Terkirim' },
      { action: 'read-filter', description: 'Pencarian & filter Surat Terkirim' },
      { action: 'read-detail', description: 'Melihat detail Surat Terkirim' },
      { action: 'read-unduh', description: 'Unduh lampiran Surat Terkirim' },
      { action: 'create-email', description: 'Kirim ulang via email' },
      { action: 'delete-recall', description: 'Button Tarik Surat (Recall)' },
    ],
  },
  {
    name: 'tertunda',
    description: 'Halaman Surat Tertunda — daftar & detail',
    permissions: [
      { action: 'read-page', description: 'Melihat daftar Surat Tertunda' },
      { action: 'read-detail', description: 'Melihat detail Surat Tertunda' },
      { action: 'update-edit', description: 'Button Edit surat tertunda' },
      { action: 'create-resend', description: 'Kirim ulang surat tertunda' },
      { action: 'delete-batal', description: 'Button Batalkan surat tertunda' },
    ],
  },
  {
    name: 'draft',
    description: 'Halaman Draft — daftar & kelola draft',
    permissions: [
      { action: 'read-page', description: 'Melihat daftar Draft' },
      { action: 'read-filter', description: 'Pencarian & filter Draft' },
      { action: 'read-detail', description: 'Melihat detail Draft' },
      { action: 'update-edit', description: 'Edit draft' },
      { action: 'delete-remove', description: 'Hapus draft' },
      { action: 'create-send', description: 'Button Kirim dari Draft' },
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
    description: 'Permintaan & verifikasi penomoran naskah dinas (Usulan, Persetujuan, Verifikasi, Penomoran)',
    permissions: [
      { action: 'read-usulan', description: 'Melihat daftar Usulan' },
      { action: 'read-persetujuan', description: 'Melihat daftar Persetujuan' },
      { action: 'read-verifikasi', description: 'Melihat daftar Verifikasi' },
      { action: 'read-penomoran', description: 'Melihat daftar Penomoran' },
      { action: 'create-usulan', description: 'Button Tambah Usulan' },
      { action: 'create-penomoran', description: 'Button Tambah Penomoran' },
      { action: 'verify', description: 'Approve/Reject usulan di Verifikasi' },
      { action: 'export-usulan', description: 'Button Export Usulan' },
      { action: 'export-persetujuan', description: 'Button Export Persetujuan' },
      { action: 'export-verifikasi', description: 'Button Export Verifikasi' },
      { action: 'export-penomoran', description: 'Button Export Penomoran' },
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
    permissions: [
      { action: 'read', description: 'Melihat pedoman (semua role)' },
      { action: 'create', description: 'Button Tambah Pedoman' },
      { action: 'update', description: 'Button Edit Pedoman' },
      { action: 'delete', description: 'Button Delete Pedoman' },
    ],
  },
  {
    name: 'faq',
    description: 'FAQ & manajemen FAQ (menggantikan resource helpdesk lama)',
    permissions: [
      { action: 'read', description: 'Melihat FAQ' },
      { action: 'create', description: 'Membuat FAQ' },
      { action: 'update', description: 'Mengedit FAQ' },
      { action: 'delete', description: 'Menghapus FAQ' },
      { action: 'export', description: 'Button Export FAQ' },
      { action: 'manage', description: 'Kelola FAQ (CRUD)' },
    ],
  },
  {
    name: 'user',
    description: 'Manajemen user (dari organization_assignment)',
    permissions: [
      { action: 'read', description: 'Melihat daftar user' },
      { action: 'create', description: 'Button Tambah Role ke User' },
      { action: 'assign-role', description: 'Assign role ke user' },
      { action: 'export', description: 'Button Export User Role' },
      { action: 'read-detail', description: 'Button Detail Role user' },
    ],
  },
  {
    name: 'role',
    description: 'Manajemen role & permission (RBAC admin)',
    permissions: [
      { action: 'read', description: 'Melihat daftar role / permission / resource / user role' },
      { action: 'create', description: 'Membuat role baru / Tambah Role ke User' },
      { action: 'update', description: 'Update role / Edit Role' },
      { action: 'delete', description: 'Hapus role' },
      { action: 'assign-permission', description: 'Assign permission ke role' },
      { action: 'read-permission', description: 'Halaman Permission' },
      { action: 'read-resource', description: 'Halaman Resource' },
      { action: 'read-detail', description: 'Button Detail Role' },
      { action: 'export-permission', description: 'Button Export Permission' },
      { action: 'export-resource', description: 'Button Export Resource' },
      { action: 'export', description: 'Button Export (Role / User Role)' },
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
    permissions: [
      { action: 'read', description: 'Melihat dashboard & statistik' },
      { action: 'export', description: 'Export data dashboard' },
    ],
  },
  {
    name: 'master-data',
    description: 'Manajemen master data (jenis, klasifikasi, perusahaan, organization, area, person, tertuju eksternal, template, grup penerima)',
    permissions: [
      { action: 'read-tertuju', description: 'Halaman Tertuju' },
      { action: 'create-tertuju', description: 'Button Tambah Tertuju Eksternal' },
      { action: 'update-tertuju', description: 'Button Edit Tertuju Eksternal' },
      { action: 'delete-tertuju', description: 'Button Hapus Data Tertuju' },
      { action: 'export-tertuju', description: 'Button Export Tertuju' },
      { action: 'read-perusahaan', description: 'Halaman Perusahaan' },
      { action: 'create-perusahaan', description: 'Button Tambah Perusahaan' },
      { action: 'update-perusahaan', description: 'Button Edit Perusahaan' },
      { action: 'delete-perusahaan', description: 'Button Delete Perusahaan' },
      { action: 'read-perusahaan-area', description: 'Button Action Area Perusahaan' },
      { action: 'read-klasifikasi', description: 'Halaman Klasifikasi' },
      { action: 'create-klasifikasi', description: 'Button Tambah Klasifikasi' },
      { action: 'update-klasifikasi', description: 'Button Edit Klasifikasi' },
      { action: 'delete-klasifikasi', description: 'Button Delete Klasifikasi' },
      { action: 'export-klasifikasi', description: 'Button Export Klasifikasi' },
      { action: 'read-jenis', description: 'Halaman Jenis' },
      { action: 'create-jenis', description: 'Button Tambah Jenis' },
      { action: 'update-jenis', description: 'Button Edit Jenis' },
      { action: 'delete-jenis', description: 'Button Delete Jenis' },
      { action: 'export-jenis', description: 'Button Export Jenis' },
      { action: 'read-jenis-detail', description: 'Button Detail Jenis' },
    ],
  },
  {
    name: 'laporan',
    description: 'Laporan Rekap Naskah, Detail Naskah, Naskah Masuk, Surat, SLA',
    permissions: [
      { action: 'read', description: 'Melihat halaman Laporan' },
      { action: 'export', description: 'Button Cetak/Export Laporan' },
      { action: 'read-rekap-naskah', description: 'Halaman Rekap Naskah' },
      { action: 'export-rekap-naskah', description: 'Button Export Rekap Naskah' },
      { action: 'read-detail-naskah', description: 'Halaman Detail Naskah' },
      { action: 'export-detail-naskah', description: 'Button Export Detail Naskah' },
      { action: 'read-naskah-masuk', description: 'Halaman Naskah Masuk' },
      { action: 'export-naskah-masuk', description: 'Button Export Naskah Masuk' },
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
      { action: 'create', description: 'Button Tambah Delegasi / switch role' },
      { action: 'read', description: 'Melihat daftar delegasi' },
      { action: 'update', description: 'Button Edit Delegasi' },
      { action: 'delete', description: 'Button Delete Delegasi' },
      { action: 'export', description: 'Button Export Delegasi' },
    ],
  },
  {
    name: 'titelatur',
    description: 'Manajemen Titelatur Inggris',
    permissions: [
      { action: 'read', description: 'Melihat halaman Titelatur Inggris' },
    ],
  },
  {
    name: 'naskah-masuk',
    description: 'Naskah Masuk — Verifikasi Naskah',
    permissions: [
      { action: 'create', description: 'Button Tambah Naskah Masuk' },
      { action: 'read-verifikasi', description: 'Halaman Verifikasi Naskah' },
      { action: 'read-verifikasi-detail', description: 'Button Show Detail Naskah' },
      { action: 'update-verifikasi', description: 'Button Action Edit Naskah' },
      { action: 'export', description: 'Button Export Naskah Masuk' },
    ],
  },
  {
    name: 'digsig',
    description: 'TTD Digital — Verifikasi Dokumen, Penandatanganan, Cek Dokumen, Log Disdig',
    permissions: [
      { action: 'read-verifikasi-dokumen', description: 'Halaman Verifikasi Dokumen' },
      { action: 'read-verifikasi-dokumen-detail', description: 'Button Show Detail Dokumen' },
      { action: 'read-verifikasi-dokumen-lihat', description: 'Button Lihat Dokumen (Verifikasi)' },
      { action: 'create-verifikasi-dokumen', description: 'Button Tambah Dokumen' },
      { action: 'update-verifikasi-dokumen', description: 'Button Edit Dokumen' },
      { action: 'read-penandatanganan', description: 'Halaman Penandatanganan' },
      { action: 'read-penandatanganan-lihat', description: 'Button Lihat Dokumen (Penandatanganan)' },
      { action: 'read-penandatanganan-detail', description: 'Button Show Detail Dokumen (Penandatanganan)' },
      { action: 'create-penandatanganan-ttd', description: 'Button TTD' },
      { action: 'create-penandatanganan-tolak', description: 'Button Tolak' },
      { action: 'read-cek-dokumen', description: 'Halaman Cek Dokumen' },
      { action: 'read-log-disdig', description: 'Halaman Log Disdig' },
      { action: 'create-log-disdig-alert', description: 'Button aktifkan alert gangguan' },
    ],
  },
  {
    name: 'penyingkat-tautan',
    description: 'Penyingkatan Tautan (URL Shortener)',
    permissions: [
      { action: 'create', description: 'Button Tambah Tautan' },
      { action: 'read', description: 'Melihat halaman Penyingkatan Tautan' },
      { action: 'update', description: 'Button Action Edit Tautan' },
      { action: 'delete', description: 'Button Action Delete Tautan' },
    ],
  },
  {
    name: 'layanan-email',
    description: 'Layanan Email — Kirim Email & Log Email',
    permissions: [
      { action: 'create', description: 'Kirim Email' },
      { action: 'read', description: 'Melihat halaman Kirim Email' },
      { action: 'read-log', description: 'Melihat halaman Log Email' },
    ],
  },
  {
    name: 'template',
    description: 'Template (manajemen template surat)',
    permissions: [
      { action: 'read', description: 'Melihat halaman Template' },
      { action: 'read-download', description: 'Button Download Template' },
    ],
  },
  {
    name: 'verifikasi-naskah',
    description: 'Verifikasi Naskah — halaman verifikasi & aksi confirm/reject',
    permissions: [
      { action: 'read', description: 'Melihat halaman Verifikasi Naskah' },
      { action: 'read-lihat', description: 'Melihat dokumen file' },
      { action: 'read-detail', description: 'Melihat detail naskah' },
      { action: 'confirm', description: 'Confirm naskah' },
      { action: 'reject', description: 'Menolak naskah' },
    ],
  },
];

// ============================================================
// Assignment permission per role (sesuai matriks §7.2 rbac.md)
// SUPERADMIN: ALL permission (dari definisi resources) — tidak ada bypass guard
// ADMIN: operasional full
// USER: create naskah + view arsip + request penomoran
// ============================================================

// Build permissions from resourcesWithPermissions
const basePermissions = resourcesWithPermissions.flatMap((r) =>
  r.permissions.map((p) => `${r.name}.${p.action}`),
);

// Build utama matrix permissions from utamaResources
const utamaPermissions = utamaResources.flatMap((r) =>
  r.permissions.map((p) => `${r.name}.${p.action}`),
);

// All permissions: base + utama (for all roles)
const allPermissions = [...basePermissions, ...utamaPermissions];

const rolePermissionAssignments: Record<string, string[]> = {
  SUPERADMIN: allPermissions,
  ADMIN: allPermissions,
  USER: allPermissions,
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

  // 2b. Upsert Utama matrix resources (utama.beranda, utama.tulis.nota-dinas, etc.)
  //     These are used by the RBAC matrix editor UI and frontend useFeatureAccess.ts
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
  console.log(`✅ ${utamaResources.length} Utama matrix resources added (total permissions: ${permIdByName.size})`);

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
  const legacyResourceNames = ['helpdesk', 'sekretaris', 'arsip-inaktif', 'pemusnahan', 'surat-keluar-eksternal'];
  // Permission lama yang sudah dihapus dari seeder (fitur tidak ada)
  const legacyPermissionNames = [
    'arsip-aktif.borrow',
    'arsip-aktif.return',
    'arsip-aktif.monitor-retensi',
    'penomoran.request',
    'penomoran.read',
    'penomoran.create',
    'penomoran.export',
    'naskah-masuk.read',
    'naskah-masuk.update',
    'master-data.read',
    'master-data.create',
    'master-data.update',
    'master-data.delete',
    'master-data.export',
    'digsig.read',
    'digsig.create',
    'digsig.update',
    'surat-keluar-eksternal.send',
    'surat-keluar-eksternal.read',
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