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

/**
 * Fitur Pemeliharaan yang ditambahkan setelah matrix awal Kelola dibuat.
 * Permission di sini mengatur katalog/menu RBAC; validasi aktor tetap
 * dilakukan oleh service masing-masing (Sekretaris, Atasan Managerial, TU,
 * dan EVP ke atas).
 */
// Resource lama dipertahankan di katalog agar permission existing tidak
// hilang saat seeder dijalankan. Matrix baru memakai tiga resource granular
// di bawahnya sehingga checkbox tiap submenu berdiri sendiri.
const legacyPenyusutanResource: ResourceDefinition = {
  name: 'pemeliharaan.penyusutan',
  description: 'Penyusutan arsip (kompatibilitas permission lama)',
  permissions: [
    { action: 'read', description: 'Melihat menu dan daftar penyusutan arsip' },
    { action: 'create', description: 'Membuat pengajuan penyusutan arsip' },
    { action: 'update', description: 'Mengubah data penyusutan arsip' },
    { action: 'approve', description: 'Memverifikasi pengajuan penyusutan arsip' },
    { action: 'reject', description: 'Menolak pengajuan penyusutan arsip' },
    { action: 'complete', description: 'Menyelesaikan penataan atau pemusnahan arsip' },
  ],
};

const pemeliharaanFeatureResources: ResourceDefinition[] = [
  {
    name: 'pemeliharaan.pemindahan',
    description: 'Pemindahan arsip aktif ke inaktif oleh Sekretaris Divisi',
    permissions: [
      { action: 'read', description: 'Melihat workspace pemindahan arsip' },
      { action: 'create', description: 'Membuat usulan pemindahan arsip' },
      { action: 'update', description: 'Mengubah usulan pemindahan arsip' },
      { action: 'delete', description: 'Menghapus usulan pemindahan arsip' },
      { action: 'send', description: 'Mengirim usulan pemindahan arsip' },
      { action: 'generate-bac', description: 'Membuat Berita Acara Pemindahan' },
    ],
  },
  {
    name: 'pemeliharaan.verifikasi-pemindahan',
    description: 'Verifikasi usulan pemindahan arsip oleh Atasan Managerial',
    permissions: [
      { action: 'read', description: 'Melihat usulan pemindahan untuk diverifikasi' },
      { action: 'approve', description: 'Menyetujui usulan pemindahan' },
      { action: 'reject', description: 'Menolak usulan pemindahan' },
      { action: 'forward', description: 'Meneruskan usulan pemindahan' },
    ],
  },
  {
    name: 'pemeliharaan.penandatanganan-bac',
    description: 'Penandatanganan Berita Acara Pemindahan oleh pejabat EVP ke atas',
    permissions: [
      { action: 'read', description: 'Melihat daftar BAC yang perlu ditandatangani' },
      { action: 'sign', description: 'Menandatangani Berita Acara Pemindahan' },
    ],
  },
  {
    name: 'pemeliharaan.tembusan-bac',
    description: 'Tembusan Berita Acara Pemindahan untuk pejabat EVP ke atas',
    permissions: [
      { action: 'read', description: 'Melihat tembusan Berita Acara Pemindahan' },
    ],
  },
  {
    name: 'pemeliharaan.penerimaan-usulan',
    description: 'Penerimaan usulan pemindahan oleh Unit Tata Naskah',
    permissions: [
      { action: 'read', description: 'Melihat daftar penerimaan usulan' },
      { action: 'approve', description: 'Menerima usulan pemindahan' },
      { action: 'reject', description: 'Menolak penerimaan usulan' },
    ],
  },
  {
    name: 'pemeliharaan.penataan-arsip-inaktif',
    description: 'Penataan arsip inaktif oleh Unit Tata Naskah',
    permissions: [
      { action: 'read', description: 'Melihat daftar penataan arsip inaktif' },
      { action: 'update', description: 'Memperbarui penataan arsip inaktif' },
      { action: 'complete', description: 'Menyelesaikan penataan arsip inaktif' },
    ],
  },
  {
    name: 'pemeliharaan.verifikasi-persetujuan-tu',
    description: 'Verifikasi persetujuan pemindahan oleh Atasan Managerial TU',
    permissions: [
      { action: 'read', description: 'Melihat usulan yang menunggu persetujuan TU' },
      { action: 'approve', description: 'Menyetujui persetujuan pemindahan TU' },
      { action: 'reject', description: 'Menolak persetujuan pemindahan TU' },
    ],
  },
  {
    name: 'pemeliharaan.penyusutan.pengajuan',
    description: 'Pengajuan Penyusutan oleh Unit Dokumen dan verifikator terkait',
    permissions: [
      { action: 'read', description: 'Melihat menu dan daftar penyusutan arsip' },
      { action: 'create', description: 'Membuat pengajuan penyusutan arsip' },
      { action: 'update', description: 'Mengubah data penyusutan arsip' },
      { action: 'approve', description: 'Memverifikasi pengajuan penyusutan arsip' },
      { action: 'reject', description: 'Menolak pengajuan penyusutan arsip' },
    ],
  },
  {
    name: 'pemeliharaan.penyusutan.penataan-pemusnahan',
    description: 'Penataan dan Pemusnahan arsip oleh Unit Dokumen',
    permissions: [
      { action: 'read', description: 'Melihat daftar penataan dan pemusnahan arsip' },
      { action: 'update', description: 'Mengubah data penataan dan pemusnahan arsip' },
      { action: 'complete', description: 'Menyelesaikan penataan atau pemusnahan arsip' },
    ],
  },
  {
    name: 'pemeliharaan.penyusutan.verifikasi',
    description: 'Verifikasi Penyusutan oleh Atasan Managerial TU',
    permissions: [
      { action: 'read', description: 'Melihat pengajuan penyusutan untuk diverifikasi' },
      { action: 'approve', description: 'Menyetujui pengajuan penyusutan arsip' },
      { action: 'reject', description: 'Menolak pengajuan penyusutan arsip' },
    ],
  },
];

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
  legacyPenyusutanResource,
  ...pemeliharaanFeatureResources,
];

// Semua permission untuk SUPERADMIN
export const kelolaSuperAdminPermissions: string[] = kelolaResources.flatMap((r) =>
  r.permissions.map((p) => `${r.name}.${p.action}`),
);

/**
 * Baseline role untuk Kelola.
 *
 * Permission ini adalah baseline UI/RBAC, bukan pengganti actor check.
 * Endpoint tetap memvalidasi position_status, organisasi, dan tahapan usulan
 * di service/guard masing-masing.
 */
export const kelolaRolePermissionAssignments: Record<'ADMIN' | 'USER', string[]> = {
  ADMIN: [
    'pemeliharaan.pemberkasan.read',
    'pemeliharaan.verifikasi.read',
    'pemeliharaan.verifikasi.approve',
    'pemeliharaan.verifikasi.reject',
    'usulan-akses-berkas.read',
    'usulan-akses-berkas.read-usulan',
    'usulan-akses-berkas.read-verifikasi',
    'usulan-akses-berkas.verify-pengusul',
    ...pemeliharaanFeatureResources.flatMap((resource) =>
      resource.permissions.map((permission) => `${resource.name}.${permission.action}`),
    ),
  ],
  USER: [
    'pemeliharaan.pemberkasan.create',
    'pemeliharaan.pemberkasan.read',
    'pemeliharaan.pemberkasan.update',
    'pemeliharaan.pemberkasan.delete',
    'pemeliharaan.pemberkasan.add-naskah',
    'pemeliharaan.pemberkasan.ajukan-tutup',
    'usulan-akses-berkas.create',
    'usulan-akses-berkas.read',
    'usulan-akses-berkas.read-usulan',
    'usulan-akses-berkas.read-verifikasi',
    'usulan-akses-berkas.read-pemberian',
    'usulan-akses-berkas.verify-pengusul',
    'usulan-akses-berkas.verify-pemberi',
    'usulan-akses-berkas.select-files',
    'usulan-akses-berkas.approve-pemberi',
    ...pemeliharaanFeatureResources.flatMap((resource) =>
      resource.permissions.map((permission) => `${resource.name}.${permission.action}`),
    ),
  ],
};

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
  send: 'Button Kirim Usulan',
  'generate-bac': 'Button Generate Berita Acara',
  forward: 'Button Pindah Usulan',
  sign: 'Button Tanda Tangan BAC',
  complete: 'Button Selesaikan Penataan',
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
                .map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.verifikasi',
                })),
            },
          ],
        },
        {
          key: 'pemindahan-arsip',
          label: 'Pemindahan Arsip Aktif ke Inaktif',
          fiturs: [
            {
              key: 'permissions',
              label: 'Pemindahan Arsip Aktif ke Inaktif',
              permissions: pemeliharaanFeatureResources
                .find((resource) => resource.name === 'pemeliharaan.pemindahan')!
                .permissions.map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.pemindahan',
                })),
            },
          ],
        },
        {
          key: 'verifikasi-pemindahan',
          label: 'Verifikasi Pemindahan',
          fiturs: [
            {
              key: 'permissions',
              label: 'Verifikasi Pemindahan',
              permissions: pemeliharaanFeatureResources
                .find((resource) => resource.name === 'pemeliharaan.verifikasi-pemindahan')!
                .permissions.map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.verifikasi-pemindahan',
                })),
            },
          ],
        },
        {
          key: 'penandatanganan-bac',
          label: 'Penandatanganan BAC',
          fiturs: [
            {
              key: 'permissions',
              label: 'Penandatanganan BAC',
              permissions: pemeliharaanFeatureResources
                .find((resource) => resource.name === 'pemeliharaan.penandatanganan-bac')!
                .permissions.map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.penandatanganan-bac',
                })),
            },
          ],
        },
        {
          key: 'tembusan-bac',
          label: 'Tembusan BAC',
          fiturs: [
            {
              key: 'permissions',
              label: 'Tembusan BAC',
              permissions: pemeliharaanFeatureResources
                .find((resource) => resource.name === 'pemeliharaan.tembusan-bac')!
                .permissions.map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.tembusan-bac',
                })),
            },
          ],
        },
        {
          key: 'penerimaan-usulan',
          label: 'Penerimaan Usulan',
          fiturs: [
            {
              key: 'permissions',
              label: 'Penerimaan Usulan',
              permissions: pemeliharaanFeatureResources
                .find((resource) => resource.name === 'pemeliharaan.penerimaan-usulan')!
                .permissions.map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.penerimaan-usulan',
                })),
            },
          ],
        },
        {
          key: 'penataan-arsip-inaktif',
          label: 'Penataan Arsip Inaktif',
          fiturs: [
            {
              key: 'permissions',
              label: 'Penataan Arsip Inaktif',
              permissions: pemeliharaanFeatureResources
                .find((resource) => resource.name === 'pemeliharaan.penataan-arsip-inaktif')!
                .permissions.map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.penataan-arsip-inaktif',
                })),
            },
          ],
        },
        {
          key: 'verifikasi-persetujuan-tu',
          label: 'Verifikasi Persetujuan TU',
          fiturs: [
            {
              key: 'permissions',
              label: 'Verifikasi Persetujuan TU',
              permissions: pemeliharaanFeatureResources
                .find((resource) => resource.name === 'pemeliharaan.verifikasi-persetujuan-tu')!
                .permissions.map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.verifikasi-persetujuan-tu',
                })),
            },
          ],
        },
      ],
    },
    {
      // Penyusutan adalah menu Kelola tersendiri untuk Unit Dokumen,
      // sejajar dengan Pemeliharaan dan Penggunaan.
      key: 'penyusutan',
      label: 'Penyusutan',
      subMenus: [
        {
          key: 'pengajuan-penyusutan',
          label: 'Pengajuan Penyusutan',
          fiturs: [
            {
              key: 'pengajuan-penyusutan',
              label: 'Pengajuan Penyusutan',
              permissions: pemeliharaanFeatureResources
                .find((resource) => resource.name === 'pemeliharaan.penyusutan.pengajuan')!
                .permissions.map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.penyusutan.pengajuan',
                })),
            },
          ],
        },
        {
          key: 'penataan-pemusnahan',
          label: 'Penataan dan Pemusnahan',
          fiturs: [
            {
              key: 'penataan-pemusnahan',
              label: 'Penataan dan Pemusnahan',
              permissions: pemeliharaanFeatureResources
                .find(
                  (resource) =>
                    resource.name === 'pemeliharaan.penyusutan.penataan-pemusnahan',
                )!
                .permissions.map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.penyusutan.penataan-pemusnahan',
                })),
            },
          ],
        },
        {
          key: 'verifikasi-penyusutan',
          label: 'Verifikasi Penyusutan',
          fiturs: [
            {
              key: 'verifikasi-penyusutan',
              label: 'Verifikasi Penyusutan',
              permissions: pemeliharaanFeatureResources
                .find((resource) => resource.name === 'pemeliharaan.penyusutan.verifikasi')!
                .permissions.map((permission) => ({
                  action: permission.action,
                  label: kelolaActionLabels[permission.action] ?? permission.action,
                  description: permission.description,
                  resource: 'pemeliharaan.penyusutan.verifikasi',
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
