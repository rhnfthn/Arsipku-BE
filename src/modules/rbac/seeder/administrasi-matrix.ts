// Matrix RBAC untuk Halaman Administrasi
// Sesuai README §5.2 — Delegasi, Titelatur, Penomoran, Naskah Masuk, Data Master, Surat Masuk Eksternal, Arsip Aktif, Tata Naskah PYB.

export interface AdministrasiMatrixPermission {
  action: string;
  label: string;
  description: string;
  resource: string;
}
export interface AdministrasiMatrixFitur {
  key: string;
  label: string;
  permissions: AdministrasiMatrixPermission[];
}
export interface AdministrasiMatrixSubMenu {
  key: string;
  label: string;
  fiturs: AdministrasiMatrixFitur[];
}
export interface AdministrasiMatrixMenu {
  key: string;
  label: string;
  subMenus: AdministrasiMatrixSubMenu[];
}
export interface AdministrasiMatrixHalaman {
  key: string;
  label: string;
  menus: AdministrasiMatrixMenu[];
}

export const administrasiMatrix: AdministrasiMatrixHalaman = {
  key: 'administrasi',
  label: 'Administrasi',
  menus: [
    // ============================================================
    // 1. Delegasi
    // ============================================================
    {
      key: 'delegasi',
      label: 'Delegasi',
      subMenus: [
        {
          key: 'delegasi',
          label: 'Delegasi',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Delegasi',
              permissions: [
                { action: 'read', label: 'Read', description: 'Melihat daftar delegasi', resource: 'delegasi' },
                { action: 'create', label: 'Create', description: 'Button Tambah Delegasi', resource: 'delegasi' },
                { action: 'update', label: 'Update', description: 'Button Edit Delegasi', resource: 'delegasi' },
                { action: 'delete', label: 'Delete', description: 'Button Delete Delegasi', resource: 'delegasi' },
                { action: 'export', label: 'Export', description: 'Button Export Delegasi', resource: 'delegasi' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 2. Titelatur Inggris
    // ============================================================
    {
      key: 'titelatur',
      label: 'Titelatur Inggris',
      subMenus: [
        {
          key: 'titelatur',
          label: 'Titelatur Inggris',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Titelatur Inggris',
              permissions: [
                { action: 'read', label: 'Read', description: 'Melihat halaman Titelatur', resource: 'titelatur' },
                { action: 'create', label: 'Create', description: 'Button Tambah Titelatur', resource: 'titelatur' },
                { action: 'update', label: 'Update', description: 'Button Edit Titelatur', resource: 'titelatur' },
                { action: 'delete', label: 'Delete', description: 'Button Delete Titelatur', resource: 'titelatur' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 3. Penomoran (Usulan, Persetujuan, Verifikasi, Penomoran)
    // ============================================================
    {
      key: 'penomoran',
      label: 'Penomoran',
      subMenus: [
        {
          key: 'usulan',
          label: 'Usulan',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Usulan',
              permissions: [
                { action: 'read-usulan', label: 'Read', description: 'Melihat daftar Usulan', resource: 'penomoran' },
                { action: 'create-usulan', label: 'Create', description: 'Button Tambah Usulan', resource: 'penomoran' },
                { action: 'export-usulan', label: 'Export', description: 'Button Export Usulan', resource: 'penomoran' },
              ],
            },
          ],
        },
        {
          key: 'persetujuan',
          label: 'Persetujuan',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Persetujuan',
              permissions: [
                { action: 'read-persetujuan', label: 'Read', description: 'Melihat daftar Persetujuan', resource: 'penomoran' },
                { action: 'export-persetujuan', label: 'Export', description: 'Button Export Persetujuan', resource: 'penomoran' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 4. Naskah Masuk
    // ============================================================
    {
      key: 'naskah-masuk',
      label: 'Naskah Masuk',
      subMenus: [
        {
          key: 'naskah-masuk',
          label: 'Naskah Masuk',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Naskah Masuk',
              permissions: [
                { action: 'create', label: 'Create', description: 'Button Tambah Naskah Masuk', resource: 'naskah-masuk' },
                { action: 'read-verifikasi', label: 'Read', description: 'Halaman Verifikasi Naskah', resource: 'naskah-masuk' },
                { action: 'read-verifikasi-detail', label: 'Read', description: 'Button Show Detail Naskah', resource: 'naskah-masuk' },
                { action: 'update-verifikasi', label: 'Update', description: 'Button Action Edit Naskah', resource: 'naskah-masuk' },
                { action: 'export', label: 'Export', description: 'Button Export Naskah Masuk', resource: 'naskah-masuk' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 5. Data Master (Tertuju, Perusahaan, Klasifikasi, Jenis)
    // ============================================================
    {
      key: 'data-master',
      label: 'Data Master',
      subMenus: [
        {
          key: 'tertuju',
          label: 'Tertuju Eksternal',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Tertuju',
              permissions: [
                { action: 'read-tertuju', label: 'Read', description: 'Halaman Tertuju', resource: 'master-data' },
                { action: 'create-tertuju', label: 'Create', description: 'Button Tambah Tertuju', resource: 'master-data' },
                { action: 'update-tertuju', label: 'Update', description: 'Button Edit Tertuju', resource: 'master-data' },
                { action: 'delete-tertuju', label: 'Delete', description: 'Button Hapus Tertuju', resource: 'master-data' },
                { action: 'export-tertuju', label: 'Export', description: 'Button Export Tertuju', resource: 'master-data' },
              ],
            },
          ],
        },
        {
          key: 'perusahaan',
          label: 'Perusahaan',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Perusahaan',
              permissions: [
                { action: 'read-perusahaan', label: 'Read', description: 'Halaman Perusahaan', resource: 'master-data' },
                { action: 'read-perusahaan-area', label: 'Read', description: 'Button Action Area Perusahaan', resource: 'master-data' },
                { action: 'create-perusahaan', label: 'Create', description: 'Button Tambah Perusahaan', resource: 'master-data' },
                { action: 'update-perusahaan', label: 'Update', description: 'Button Edit Perusahaan', resource: 'master-data' },
                { action: 'delete-perusahaan', label: 'Delete', description: 'Button Delete Perusahaan', resource: 'master-data' },
              ],
            },
          ],
        },
        {
          key: 'klasifikasi',
          label: 'Klasifikasi',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Klasifikasi',
              permissions: [
                { action: 'read-klasifikasi', label: 'Read', description: 'Halaman Klasifikasi', resource: 'master-data' },
                { action: 'create-klasifikasi', label: 'Create', description: 'Button Tambah Klasifikasi', resource: 'master-data' },
                { action: 'update-klasifikasi', label: 'Update', description: 'Button Edit Klasifikasi', resource: 'master-data' },
                { action: 'delete-klasifikasi', label: 'Delete', description: 'Button Delete Klasifikasi', resource: 'master-data' },
                { action: 'export-klasifikasi', label: 'Export', description: 'Button Export Klasifikasi', resource: 'master-data' },
              ],
            },
          ],
        },
        {
          key: 'jenis',
          label: 'Jenis',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Jenis',
              permissions: [
                { action: 'read-jenis', label: 'Read', description: 'Halaman Jenis', resource: 'master-data' },
                { action: 'read-jenis-detail', label: 'Read', description: 'Button Detail Jenis', resource: 'master-data' },
                { action: 'create-jenis', label: 'Create', description: 'Button Tambah Jenis', resource: 'master-data' },
                { action: 'update-jenis', label: 'Update', description: 'Button Edit Jenis', resource: 'master-data' },
                { action: 'delete-jenis', label: 'Delete', description: 'Button Delete Jenis', resource: 'master-data' },
                { action: 'export-jenis', label: 'Export', description: 'Button Export Jenis', resource: 'master-data' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 6. Konfigurasi Sistem
    // ============================================================
    {
      key: 'konfigurasi',
      label: 'Konfigurasi Sistem',
      subMenus: [
        {
          key: 'konfigurasi',
          label: 'Konfigurasi Sistem',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Konfigurasi',
              permissions: [
                { action: 'read', label: 'Read', description: 'Melihat konfigurasi sistem', resource: 'konfigurasi' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// Flatten ke daftar resource + permission untuk seeder (jika diperlukan)
export interface AdministrasiResourceDef {
  name: string;
  description: string;
  permissions: { action: string; description: string }[];
}

function flattenAdministrasiMatrix(halaman: AdministrasiMatrixHalaman): AdministrasiResourceDef[] {
  const map = new Map<string, AdministrasiResourceDef>();
  for (const menu of halaman.menus) {
    for (const sub of menu.subMenus) {
      for (const fitur of sub.fiturs) {
        for (const perm of fitur.permissions) {
          if (!map.has(perm.resource)) {
            map.set(perm.resource, { name: perm.resource, description: perm.resource, permissions: [] });
          }
          const res = map.get(perm.resource)!;
          if (!res.permissions.some((p) => p.action === perm.action)) {
            res.permissions.push({ action: perm.action, description: perm.description });
          }
        }
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export const administrasiResources = flattenAdministrasiMatrix(administrasiMatrix);

export const administrasiSuperAdminPermissions: string[] = administrasiResources.flatMap((r) =>
  r.permissions.map((p) => `${r.name}:${p.action}`),
);