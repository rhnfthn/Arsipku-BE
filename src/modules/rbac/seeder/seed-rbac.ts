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
      { action: 'export-usulan', description: 'Button Export Usulan' },
      { action: 'export-persetujuan', description: 'Button Export Persetujuan' },
      { action: 'export-verifikasi', description: 'Button Export Verifikasi' },
      { action: 'export-penomoran', description: 'Button Export Penomoran' },
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
      { action: 'manage', description: 'Mengelola FAQ (PIC)' },
      { action: 'create', description: 'Membuat FAQ' },
      { action: 'update', description: 'Mengedit FAQ' },
      { action: 'delete', description: 'Menghapus FAQ' },
      { action: 'export', description: 'Button Export FAQ' },
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
    description: 'Laporan Surat & Laporan SLA',
    permissions: [
      { action: 'read', description: 'Melihat halaman Laporan (Surat / SLA)' },
      { action: 'export', description: 'Button Cetak Laporan (PDF) / Export Excel' },
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
      { action: 'create', description: 'Button Tambah Titelatur Inggris' },
      { action: 'read', description: 'Melihat halaman Titelatur Inggris' },
      { action: 'update', description: 'Button Edit Titelatur Inggris' },
      { action: 'delete', description: 'Button Delete Titelatur Inggris' },
    ],
  },
  {
    name: 'naskah-masuk',
    description: 'Naskah Masuk — Verifikasi Naskah & Verifikator',
    permissions: [
      { action: 'create', description: 'Button Tambah Naskah Masuk' },
      { action: 'read-verifikasi', description: 'Halaman Verifikasi Naskah' },
      { action: 'read-verifikasi-detail', description: 'Button Show Detail Naskah' },
      { action: 'read-verifikator', description: 'Halaman Verifikator' },
      { action: 'read-verifikator-lihat', description: 'Button Lihat Dokumen' },
      { action: 'read-verifikator-detail', description: 'Button Show Detail Dokumen' },
      { action: 'update-verifikasi', description: 'Button Action Edit Naskah' },
      { action: 'update-verifikator', description: 'Button Action Confirm' },
      { action: 'update-verifikator-reject', description: 'Button Action Reject' },
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
      { action: 'read', description: 'Melihat halaman Layanan Email / Log Email' },
    ],
  },
  {
    name: 'template',
    description: 'Template (manajemen template surat)',
    permissions: [
      { action: 'create', description: 'Button Tambah Template' },
      { action: 'read', description: 'Melihat halaman Template / Download Template' },
      { action: 'read-download', description: 'Button Action Download Template' },
      { action: 'update', description: 'Button Action Edit Template' },
      { action: 'delete', description: 'Button Action Delete Template' },
    ],
  },
];

// ============================================================
// Assignment permission per role (sesuai matriks §7.2 rbac.md)
// SUPERADMIN: ALL permission (dari definisi resources) — tidak ada bypass guard
// ADMIN: operasional full
// USER: create naskah + view arsip + request penomoran
// ============================================================

const rolePermissionAssignments: Record<string, string[]> = {
  SUPERADMIN: resourcesWithPermissions.flatMap((r) =>
    r.permissions.map((p) => `${r.name}.${p.action}`),
  ),
  ADMIN: [
    'naskah-dinas.create',
    'naskah-dinas.read',
    'naskah-dinas.read-detail',
    'naskah-dinas.update',
    'naskah-dinas.approve',
    'naskah-dinas.sign',
    'naskah-dinas.reject',
    'naskah-dinas.send-email',
    'nota-dinas.read-page',
    'nota-dinas.read-template',
    'nota-dinas.read-template-saya',
    'nota-dinas.create-template',
    'nota-dinas.create-preview',
    'nota-dinas.create-upload',
    'nota-dinas.create-send',
    'disposisi.read-page',
    'disposisi.create-preview',
    'disposisi.create-send',
    'surat-dinas-internal.read-page',
    'surat-dinas-internal.read-template',
    'surat-dinas-internal.read-template-saya',
    'surat-dinas-internal.create-template',
    'surat-dinas-internal.create-preview',
    'surat-dinas-internal.create-upload',
    'surat-dinas-internal.create-send',
    'surat-dinas-eksternal.read-page',
    'surat-dinas-eksternal.read-template',
    'surat-dinas-eksternal.read-template-saya',
    'surat-dinas-eksternal.create-template',
    'surat-dinas-eksternal.create-preview',
    'surat-dinas-eksternal.create-upload',
    'surat-dinas-eksternal.create-send',
    'kajian.read-page',
    'kajian.read-template',
    'kajian.read-template-saya',
    'kajian.create-preview',
    'kajian.create-draft',
    'kajian.create-send',
    'naskah-lainnya.read-page',
    'naskah-lainnya.create-preview',
    'naskah-lainnya.create-draft',
    'naskah-lainnya.create-send',
    'kotak-masuk.read-page',
    'kotak-masuk.read-detail',
    'kotak-masuk.read-lanjut-nd',
    'kotak-masuk.read-lanjut-disposisi',
    'kotak-masuk.read-lanjut-sdi',
    'kotak-masuk.read-lanjut-sde',
    'kotak-masuk.read-lanjut-kajian',
    'kotak-masuk.read-lanjut-nl',
    'terkirim.read-page',
    'terkirim.read-detail',
    'terkirim.create-email',
    'tertunda.read-page',
    'tertunda.read-detail',
    'tertunda.create-resend',
    'draft.read-page',
    'draft.read-detail',
    'draft.update-edit',
    'draft.delete-remove',
    'surat-masuk-eksternal.create',
    'surat-masuk-eksternal.read',
    'surat-masuk-eksternal.verify',
    'penomoran.read-usulan',
    'penomoran.read-persetujuan',
    'penomoran.read-verifikasi',
    'penomoran.read-penomoran',
    'penomoran.create-usulan',
    'penomoran.create-penomoran',
    'penomoran.export-usulan',
    'penomoran.export-persetujuan',
    'penomoran.export-verifikasi',
    'penomoran.export-penomoran',
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
    'user.create',
    'user.assign-role',
    'user.export',
    'user.read-detail',
    'role.read',
    'role.create',
    'role.update',
    'role.delete',
    'role.assign-permission',
    'role.read-permission',
    'role.read-resource',
    'role.export-permission',
    'role.export-resource',
    'role.export',
    'pedoman.read',
    'pedoman.create',
    'pedoman.update',
    'pedoman.delete',
    'faq.read',
    'faq.manage',
    'faq.create',
    'faq.update',
    'faq.delete',
    'faq.export',
    'dashboard.read',
    'smart-search.search',
    'master-data.read-tertuju',
    'master-data.create-tertuju',
    'master-data.update-tertuju',
    'master-data.delete-tertuju',
    'master-data.export-tertuju',
    'master-data.read-perusahaan',
    'master-data.create-perusahaan',
    'master-data.update-perusahaan',
    'master-data.delete-perusahaan',
    'master-data.read-perusahaan-area',
    'master-data.read-klasifikasi',
    'master-data.create-klasifikasi',
    'master-data.update-klasifikasi',
    'master-data.delete-klasifikasi',
    'master-data.export-klasifikasi',
    'master-data.read-jenis',
    'master-data.create-jenis',
    'master-data.update-jenis',
    'master-data.delete-jenis',
    'master-data.export-jenis',
    'master-data.read-jenis-detail',
    'laporan.read',
    'laporan.export',
    'konfigurasi.read',
    'konfigurasi.update',
    'delegasi.create',
    'delegasi.read',
    'delegasi.update',
    'delegasi.delete',
    'delegasi.export',
    'titelatur.create',
    'titelatur.read',
    'titelatur.update',
    'titelatur.delete',
    'naskah-masuk.create',
    'naskah-masuk.read-verifikasi',
    'naskah-masuk.read-verifikasi-detail',
    'naskah-masuk.read-verifikator',
    'naskah-masuk.read-verifikator-lihat',
    'naskah-masuk.read-verifikator-detail',
    'naskah-masuk.update-verifikasi',
    'naskah-masuk.update-verifikator',
    'naskah-masuk.update-verifikator-reject',
    'naskah-masuk.export',
    'digsig.read-verifikasi-dokumen',
    'digsig.read-verifikasi-dokumen-detail',
    'digsig.read-verifikasi-dokumen-lihat',
    'digsig.create-verifikasi-dokumen',
    'digsig.update-verifikasi-dokumen',
    'digsig.read-penandatanganan',
    'digsig.read-penandatanganan-lihat',
    'digsig.read-penandatanganan-detail',
    'digsig.create-penandatanganan-ttd',
    'digsig.create-penandatanganan-tolak',
    'digsig.read-cek-dokumen',
    'digsig.read-log-disdig',
    'digsig.create-log-disdig-alert',
    'penyingkat-tautan.create',
    'penyingkat-tautan.read',
    'penyingkat-tautan.update',
    'penyingkat-tautan.delete',
    'layanan-email.create',
    'layanan-email.read',
    'template.create',
    'template.read',
    'template.read-download',
    'template.update',
    'template.delete',
  ],
  USER: [
    'naskah-dinas.create',
    'naskah-dinas.read',
    'naskah-dinas.read-detail',
    // Tulis (sesuai RBAC_User_Utama.xlsx)
    'nota-dinas.read-page',
    'nota-dinas.read-template',
    'nota-dinas.read-template-saya',
    'nota-dinas.create-template',
    'nota-dinas.create-preview',
    'disposisi.read-page',
    'disposisi.create-preview',
    'surat-dinas-internal.read-page',
    'surat-dinas-internal.read-template',
    'surat-dinas-internal.read-template-saya',
    'surat-dinas-internal.create-template',
    'surat-dinas-internal.create-preview',
    'surat-dinas-eksternal.read-page',
    'surat-dinas-eksternal.read-template',
    'surat-dinas-eksternal.read-template-saya',
    'surat-dinas-eksternal.create-template',
    'surat-dinas-eksternal.create-preview',
    'kajian.read-page',
    'kajian.read-template',
    'kajian.read-template-saya',
    'kajian.create-preview',
    'naskah-lainnya.read-page',
    'naskah-lainnya.create-preview',
    'naskah-lainnya.create-draft',
    'naskah-lainnya.create-send',
    // Kotak Masuk / Terkirim / Tertunda / Draft (USER read-only detail)
    'kotak-masuk.read-page',
    'kotak-masuk.read-detail',
    'terkirim.read-page',
    'terkirim.read-detail',
    'tertunda.read-page',
    'tertunda.read-detail',
    'draft.read-page',
    'draft.read-detail',
    'draft.update-edit',
    'draft.delete-remove',
    // Utilitas (RBAC_User_Utilitas.xlsx)
    'digsig.read-verifikasi-dokumen',
    'digsig.read-verifikasi-dokumen-detail',
    'digsig.read-verifikasi-dokumen-lihat',
    'digsig.create-verifikasi-dokumen',
    'digsig.update-verifikasi-dokumen',
    'penyingkat-tautan.create',
    'penyingkat-tautan.read',
    'penyingkat-tautan.update',
    'penyingkat-tautan.delete',
    'layanan-email.create',
    'layanan-email.read',
    'template.create',
    'template.read',
    'template.read-download',
    'template.update',
    'template.delete',
    'titelatur.create',
    'titelatur.read',
    'titelatur.update',
    'titelatur.delete',
    'penomoran.read-usulan',
    'penomoran.create-usulan',
    'penomoran.export-usulan',
    'penomoran.read-persetujuan',
    'penomoran.export-persetujuan',
    // Penomoran & arsip (dari origin/main)
    'penomoran.read',
    'surat-masuk-eksternal.read',
    // FAQ + Pedoman (read-only)
    'faq.read',
    'pedoman.read',
    // Lain-lain
    'smart-search.search',
    'dashboard.read',
    'naskah-masuk.read-verifikasi',
    // Permission tambahan (Tahap 1 RBAC hardening) — USER read-only
    'master-data.read-tertuju',
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
  const legacyResourceNames = ['helpdesk', 'sekretaris', 'arsip-inaktif', 'pemusnahan', 'surat-keluar-eksternal'];
  // Permission lama yang sudah dihapus dari seeder (fitur tidak ada)
  const legacyPermissionNames = [
    'arsip-aktif.borrow',
    'arsip-aktif.return',
    'arsip-aktif.monitor-retensi',
    'penomoran.request',
    'penomoran.verify',
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