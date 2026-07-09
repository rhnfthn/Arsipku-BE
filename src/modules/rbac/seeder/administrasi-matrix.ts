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
        {
          key: 'verifikasi',
          label: 'Verifikasi',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Verifikasi',
              permissions: [
                { action: 'read-verifikasi', label: 'Read', description: 'Melihat daftar Verifikasi', resource: 'penomoran' },
                { action: 'export-verifikasi', label: 'Export', description: 'Button Export Verifikasi', resource: 'penomoran' },
              ],
            },
          ],
        },
        {
          key: 'penomoran-daftar',
          label: 'Penomoran',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Penomoran',
              permissions: [
                { action: 'read-penomoran', label: 'Read', description: 'Melihat halaman Penomoran', resource: 'penomoran' },
                { action: 'create-penomoran', label: 'Create', description: 'Button Tambah Penomoran', resource: 'penomoran' },
                { action: 'export-penomoran', label: 'Export', description: 'Button Export Penomoran', resource: 'penomoran' },
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
    // 6. Role (RBAC Management — Super Admin only)
    // ============================================================
    {
      key: 'role',
      label: 'Manajemen Role',
      subMenus: [
        {
          key: 'role',
          label: 'Manajemen Role',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Role',
              permissions: [
                { action: 'read', label: 'Read', description: 'Melihat daftar role', resource: 'role' },
                { action: 'create', label: 'Create', description: 'Button Buat Role', resource: 'role' },
                { action: 'update', label: 'Update', description: 'Button Edit Role', resource: 'role' },
                { action: 'delete', label: 'Delete', description: 'Button Hapus Role', resource: 'role' },
                { action: 'assign-permission', label: 'Assign', description: 'Assign Permission ke Role', resource: 'role' },
                { action: 'read-permission', label: 'Read', description: 'Halaman Permission', resource: 'role' },
                { action: 'read-resource', label: 'Read', description: 'Halaman Resource', resource: 'role' },
                { action: 'read-detail', label: 'Read', description: 'Button Detail Role', resource: 'role' },
                { action: 'export', label: 'Export', description: 'Button Export Role', resource: 'role' },
                { action: 'export-permission', label: 'Export', description: 'Button Export Permission', resource: 'role' },
                { action: 'export-resource', label: 'Export', description: 'Button Export Resource', resource: 'role' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 7. User Role (User-Role Management)
    // ============================================================
    {
      key: 'user',
      label: 'Manajemen User Role',
      subMenus: [
        {
          key: 'user',
          label: 'Manajemen User Role',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman User Role',
              permissions: [
                { action: 'read', label: 'Read', description: 'Melihat daftar user role', resource: 'user' },
                { action: 'create', label: 'Create', description: 'Button Tambah Role ke User', resource: 'user' },
                { action: 'assign-role', label: 'Assign', description: 'Assign role ke user', resource: 'user' },
                { action: 'export', label: 'Export', description: 'Button Export User Role', resource: 'user' },
                { action: 'read-detail', label: 'Read', description: 'Button Detail Role user', resource: 'user' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 8. Dashboard
    // ============================================================
    {
      key: 'dashboard',
      label: 'Dashboard',
      subMenus: [
        {
          key: 'dashboard',
          label: 'Dashboard',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Dashboard',
              permissions: [
                { action: 'read', label: 'Read', description: 'Melihat dashboard & statistik', resource: 'dashboard' },
                { action: 'export', label: 'Export', description: 'Export data dashboard', resource: 'dashboard' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 9. Naskah Dinas
    // ============================================================
    {
      key: 'naskah-dinas',
      label: 'Naskah Dinas',
      subMenus: [
        {
          key: 'naskah-dinas',
          label: 'Naskah Dinas',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Naskah Dinas',
              permissions: [
                { action: 'create', label: 'Create', description: 'Membuat naskah dinas', resource: 'naskah-dinas' },
                { action: 'read', label: 'Read', description: 'Melihat daftar naskah dinas', resource: 'naskah-dinas' },
                { action: 'read-detail', label: 'Read', description: 'Melihat detail naskah dinas', resource: 'naskah-dinas' },
                { action: 'update', label: 'Update', description: 'Mengupdate draft naskah dinas', resource: 'naskah-dinas' },
                { action: 'approve', label: 'Approve', description: 'Menyetujui naskah dinas', resource: 'naskah-dinas' },
                { action: 'sign', label: 'Sign', description: 'Tanda tangan elektronik', resource: 'naskah-dinas' },
                { action: 'reject', label: 'Reject', description: 'Menolak naskah/dokumen', resource: 'naskah-dinas' },
                { action: 'send-email', label: 'Send Email', description: 'Kirim surat eksternal via email', resource: 'naskah-dinas' },
                { action: 'delete', label: 'Delete', description: 'Menghapus naskah dinas', resource: 'naskah-dinas' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 10. Arsip Aktif
    // ============================================================
    {
      key: 'arsip-aktif',
      label: 'Arsip Aktif',
      subMenus: [
        {
          key: 'arsip-aktif',
          label: 'Arsip Aktif',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Arsip Aktif',
              permissions: [
                { action: 'create', label: 'Create', description: 'Menciptakan arsip', resource: 'arsip-aktif' },
                { action: 'read', label: 'Read', description: 'Melihat daftar arsip aktif', resource: 'arsip-aktif' },
                { action: 'update', label: 'Update', description: 'Update metadata arsip', resource: 'arsip-aktif' },
                { action: 'delete', label: 'Delete', description: 'Menghapus arsip aktif', resource: 'arsip-aktif' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 11. Smart Search
    // ============================================================
    {
      key: 'smart-search',
      label: 'Smart Search',
      subMenus: [
        {
          key: 'smart-search',
          label: 'Smart Search',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Smart Search',
              permissions: [
                { action: 'search', label: 'Search', description: 'Menggunakan fitur smart search', resource: 'smart-search' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 12. Surat Masuk Eksternal
    // ============================================================
    {
      key: 'surat-masuk-eksternal',
      label: 'Surat Masuk Eksternal',
      subMenus: [
        {
          key: 'surat-masuk-eksternal',
          label: 'Surat Masuk Eksternal',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Surat Masuk Eksternal',
              permissions: [
                { action: 'create', label: 'Create', description: 'Registrasi surat masuk eksternal', resource: 'surat-masuk-eksternal' },
                { action: 'read', label: 'Read', description: 'Melihat daftar surat masuk', resource: 'surat-masuk-eksternal' },
                { action: 'verify', label: 'Verify', description: 'Verifikasi & disposisi surat masuk', resource: 'surat-masuk-eksternal' },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 13. Konfigurasi Sistem (Super Admin only)
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