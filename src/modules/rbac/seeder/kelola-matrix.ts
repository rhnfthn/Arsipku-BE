// Matrix RBAC untuk Halaman Kelola — Arsip Dinamis Phase 1
// Pemberkasan Arsip Aktif + Persetujuan Pemberkasan

import type { MatrixHalaman } from './utama-matrix';

export interface ResourcePermission {
  action: string;
  description: string;
}

export interface ResourceDefinition {
  name: string;
  description: string;
  permissions: ResourcePermission[];
}

export const kelolaResources: ResourceDefinition[] = [
  {
    name: 'pemeliharaan.pemberkasan',
    description: 'Pemberkasan Arsip Aktif — membuat, mengelola, dan mengajukan penutupan berkas',
    permissions: [
      { action: 'create', description: 'Membuat berkas baru' },
      { action: 'read', description: 'Melihat daftar dan detail berkas' },
      { action: 'update', description: 'Mengubah data berkas' },
      { action: 'delete', description: 'Menghapus berkas (draft only)' },
      { action: 'add-naskah', description: 'Menambah/menghapus naskah dari berkas' },
      { action: 'ajukan-tutup', description: 'Mengajukan penutupan berkas' },
    ],
  },
  {
    name: 'pemeliharaan.verifikasi',
    description: 'Persetujuan Pemberkasan — review dan approve/reject penutupan berkas',
    permissions: [
      { action: 'read', description: 'Melihat daftar pengajuan penutupan' },
      { action: 'approve', description: 'Menyetujui penutupan berkas' },
      { action: 'reject', description: 'Menolak penutupan berkas' },
    ],
  },
  {
    name: 'usulan-akses-berkas',
    description: 'Penggunaan arsip — pengajuan dan verifikasi akses berkas',
    permissions: [
      { action: 'create', description: 'Membuat usulan akses berkas' },
      { action: 'read', description: 'Melihat daftar usulan akses berkas' },
      { action: 'read-usulan', description: 'Melihat daftar usulan akses berkas' },
      { action: 'read-verifikasi', description: 'Melihat daftar verifikasi usulan akses berkas' },
      { action: 'read-pemberian', description: 'Melihat daftar pemberian akses berkas' },
      { action: 'verify-pengusul', description: 'Verifikasi pengusul oleh atasan managerial' },
      { action: 'verify-pemberi', description: 'Verifikasi pemberi oleh sekretaris' },
      { action: 'select-files', description: 'Memilih berkas untuk usulan akses' },
      { action: 'approve-pemberi', description: 'Menyetujui pemberian akses berkas' },
    ],
  },
];

// Semua permission untuk SUPERADMIN
export const kelolaSuperAdminPermissions: string[] = kelolaResources.flatMap((r) =>
  r.permissions.map((p) => `${r.name}.${p.action}`),
);

const kelolaActionLabels: Record<string, string> = {
  create: 'Create',
  read: 'Read',
  'read-usulan': 'Read',
  'read-verifikasi': 'Read',
  'read-pemberian': 'Read',
  update: 'Update',
  delete: 'Delete',
  'add-naskah': 'Add Naskah',
  'ajukan-tutup': 'Button Ajukan Tutup',
  approve: 'Button Setujui',
  reject: 'Button Tolak',
  'verify-pengusul': 'Button Verifikasi Pengusul',
  'verify-pemberi': 'Button Verifikasi Pemberi',
  'select-files': 'Button Pilih Berkas',
  'approve-pemberi': 'Button Setujui Pemberian',
};

// Tree matrix untuk editor permission RBAC.
// Resource/action tetap memakai definisi kelolaResources di atas agar endpoint
// Kelola yang sudah berjalan tidak berubah.
export const kelolaMatrix: MatrixHalaman = {
  key: 'kelola',
  label: 'Kelola',
  menus: [
    {
      key: 'pemeliharaan',
      label: 'Pemeliharaan',
      subMenus: [
        {
          key: 'pemberkasan',
          label: 'Pemberkasan',
          fiturs: [
            {
              key: 'permissions',
              label: 'Pemberkasan',
              permissions: kelolaResources[0].permissions
                .filter((permission) => permission.action === 'read')
                .map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.pemberkasan',
                })),
            },
          ],
        },
        {
          key: 'persetujuan-pemberkasan',
          label: 'Persetujuan Pemberkasan',
          fiturs: [
            {
              key: 'permissions',
              label: 'Persetujuan Pemberkasan',
              permissions: kelolaResources[1].permissions
                .filter((permission) => permission.action === 'read')
                .map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.verifikasi',
                })),
            },
          ],
        },
      ],
    },
    {
      key: 'penggunaan',
      label: 'Penggunaan',
      subMenus: [
        {
          key: 'usulan-akses',
          label: 'Usulan Akses',
          fiturs: [
            {
              key: 'permissions',
              label: 'Usulan Akses',
              permissions: kelolaResources[2].permissions
                .filter((permission) => permission.action === 'read-usulan')
                .map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'usulan-akses-berkas',
                })),
            },
          ],
        },
        {
          key: 'verifikasi-usulan',
          label: 'Verifikasi Usulan',
          fiturs: [
            {
              key: 'permissions',
              label: 'Verifikasi Usulan',
              permissions: kelolaResources[2].permissions
                .filter((permission) => permission.action === 'read-verifikasi')
                .map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'usulan-akses-berkas',
                })),
            },
          ],
        },
        {
          key: 'pemberian',
          label: 'Pemberian',
          fiturs: [
            {
              key: 'permissions',
              label: 'Pemberian',
              permissions: kelolaResources[2].permissions
                .filter((permission) => permission.action === 'read-pemberian')
                .map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'usulan-akses-berkas',
                })),
            },
          ],
        },
      ],
    },
  ],
};
