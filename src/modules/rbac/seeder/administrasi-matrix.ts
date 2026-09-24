
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
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat daftar delegasi',
                  resource: 'delegasi',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Tambah Delegasi',
                  resource: 'delegasi',
                },
                {
                  action: 'update',
                  label: 'Update',
                  description: 'Button Edit Delegasi',
                  resource: 'delegasi',
                },
                {
                  action: 'delete',
                  label: 'Delete',
                  description: 'Button Delete Delegasi',
                  resource: 'delegasi',
                },
                {
                  action: 'export',
                  label: 'Export',
                  description: 'Button Export Delegasi',
                  resource: 'delegasi',
                },
              ],
            },
          ],
        },
      ],
    },
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
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Titelatur',
                  resource: 'titelatur',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Membuat titelatur',
                  resource: 'titelatur',
                },
                {
                  action: 'update',
                  label: 'Update',
                  description: 'Mengubah titelatur',
                  resource: 'titelatur',
                },
                {
                  action: 'delete',
                  label: 'Delete',
                  description: 'Menghapus titelatur',
                  resource: 'titelatur',
                },
              ],
            },
          ],
        },
      ],
    },
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
                {
                  action: 'read-usulan',
                  label: 'Read',
                  description: 'Melihat daftar Usulan',
                  resource: 'penomoran',
                },
                {
                  action: 'create-usulan',
                  label: 'Create',
                  description: 'Button Tambah Usulan',
                  resource: 'penomoran',
                },
                {
                  action: 'export-usulan',
                  label: 'Export',
                  description: 'Button Export Usulan',
                  resource: 'penomoran',
                },
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
                {
                  action: 'read-persetujuan',
                  label: 'Read',
                  description: 'Melihat daftar Persetujuan',
                  resource: 'penomoran',
                },
                {
                  action: 'export-persetujuan',
                  label: 'Export',
                  description: 'Button Export Persetujuan',
                  resource: 'penomoran',
                },
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
                {
                  action: 'read-verifikasi',
                  label: 'Read',
                  description: 'Melihat daftar Verifikasi',
                  resource: 'penomoran',
                },
                {
                  action: 'export-verifikasi',
                  label: 'Export',
                  description: 'Button Export Verifikasi',
                  resource: 'penomoran',
                },
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
                {
                  action: 'read-penomoran',
                  label: 'Read',
                  description: 'Melihat halaman Penomoran',
                  resource: 'penomoran',
                },
                {
                  action: 'create-penomoran',
                  label: 'Create',
                  description: 'Button Tambah Penomoran',
                  resource: 'penomoran',
                },
                {
                  action: 'export-penomoran',
                  label: 'Export',
                  description: 'Button Export Penomoran',
                  resource: 'penomoran',
                },
              ],
            },
          ],
        },
      ],
    },
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
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Tambah Naskah Masuk',
                  resource: 'naskah-masuk',
                },
                {
                  action: 'read-verifikasi',
                  label: 'Read',
                  description: 'Halaman Verifikasi Naskah',
                  resource: 'naskah-masuk',
                },
                {
                  action: 'read-verifikasi-detail',
                  label: 'Read',
                  description: 'Button Show Detail Naskah',
                  resource: 'naskah-masuk',
                },
                {
                  action: 'update-verifikasi',
                  label: 'Update',
                  description: 'Button Action Edit Naskah',
                  resource: 'naskah-masuk',
                },
                {
                  action: 'export',
                  label: 'Export',
                  description: 'Button Export Naskah Masuk',
                  resource: 'naskah-masuk',
                },
              ],
            },
          ],
        },
      ],
    },
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
                {
                  action: 'read-tertuju',
                  label: 'Read',
                  description: 'Halaman Tertuju',
                  resource: 'master-data',
                },
                {
                  action: 'create-tertuju',
                  label: 'Create',
                  description: 'Button Tambah Tertuju',
                  resource: 'master-data',
                },
                {
                  action: 'update-tertuju',
                  label: 'Update',
                  description: 'Button Edit Tertuju',
                  resource: 'master-data',
                },
                {
                  action: 'delete-tertuju',
                  label: 'Delete',
                  description: 'Button Hapus Tertuju',
                  resource: 'master-data',
                },
                {
                  action: 'export-tertuju',
                  label: 'Export',
                  description: 'Button Export Tertuju',
                  resource: 'master-data',
                },
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
                {
                  action: 'read-perusahaan',
                  label: 'Read',
                  description: 'Halaman Perusahaan',
                  resource: 'master-data',
                },
                {
                  action: 'read-perusahaan-area',
                  label: 'Read',
                  description: 'Button Action Area Perusahaan',
                  resource: 'master-data',
                },
                {
                  action: 'create-perusahaan',
                  label: 'Create',
                  description: 'Button Tambah Perusahaan',
                  resource: 'master-data',
                },
                {
                  action: 'update-perusahaan',
                  label: 'Update',
                  description: 'Button Edit Perusahaan',
                  resource: 'master-data',
                },
                {
                  action: 'delete-perusahaan',
                  label: 'Delete',
                  description: 'Button Delete Perusahaan',
                  resource: 'master-data',
                },
                {
                  action: 'export-perusahaan',
                  label: 'Export',
                  description: 'Button Export Perusahaan',
                  resource: 'master-data',
                },
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
                {
                  action: 'read-klasifikasi',
                  label: 'Read',
                  description: 'Halaman Klasifikasi',
                  resource: 'master-data',
                },
                {
                  action: 'create-klasifikasi',
                  label: 'Create',
                  description: 'Button Tambah Klasifikasi',
                  resource: 'master-data',
                },
                {
                  action: 'update-klasifikasi',
                  label: 'Update',
                  description: 'Button Edit Klasifikasi',
                  resource: 'master-data',
                },
                {
                  action: 'delete-klasifikasi',
                  label: 'Delete',
                  description: 'Button Delete Klasifikasi',
                  resource: 'master-data',
                },
                {
                  action: 'export-klasifikasi',
                  label: 'Export',
                  description: 'Button Export Klasifikasi',
                  resource: 'master-data',
                },
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
                {
                  action: 'read-jenis',
                  label: 'Read',
                  description: 'Halaman Jenis',
                  resource: 'master-data',
                },
                {
                  action: 'read-jenis-detail',
                  label: 'Read',
                  description: 'Button Detail Jenis',
                  resource: 'master-data',
                },
                {
                  action: 'create-jenis',
                  label: 'Create',
                  description: 'Button Tambah Jenis',
                  resource: 'master-data',
                },
                {
                  action: 'update-jenis',
                  label: 'Update',
                  description: 'Button Edit Jenis',
                  resource: 'master-data',
                },
                {
                  action: 'delete-jenis',
                  label: 'Delete',
                  description: 'Button Delete Jenis',
                  resource: 'master-data',
                },
                {
                  action: 'export-jenis',
                  label: 'Export',
                  description: 'Button Export Jenis',
                  resource: 'master-data',
                },
              ],
            },
          ],
        },
        {
          key: 'grup-penerima',
          label: 'Grup Penerima',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Grup Penerima',
              permissions: [
                {
                  action: 'read-grup-penerima',
                  label: 'Read',
                  description: 'Halaman Grup Penerima',
                  resource: 'master-data',
                },
                {
                  action: 'create-grup-penerima',
                  label: 'Create',
                  description: 'Button Tambah Grup Penerima',
                  resource: 'master-data',
                },
                {
                  action: 'update-grup-penerima',
                  label: 'Update',
                  description: 'Button Edit Grup Penerima',
                  resource: 'master-data',
                },
                {
                  action: 'delete-grup-penerima',
                  label: 'Delete',
                  description: 'Button Delete Grup Penerima',
                  resource: 'master-data',
                },
                {
                  action: 'read-grup-penerima-detail',
                  label: 'Read',
                  description: 'Button Detail Grup Penerima',
                  resource: 'master-data',
                },
                {
                  action: 'export-grup-penerima',
                  label: 'Export',
                  description: 'Button Export Grup Penerima',
                  resource: 'master-data',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'konfigurasi',
      label: 'Konfigurasi Sistem',
      subMenus: [
        {
          key: 'konfigurasi-digsig',
          label: 'Konfigurasi Digsig',
          fiturs: [
            {
              key: 'read',
              label: 'Read',
              permissions: [
                {
                  action: 'read-digsig',
                  label: 'Read',
                  description: 'Melihat konfigurasi Digsig',
                  resource: 'konfigurasi',
                },
              ],
            },
          ],
        },
        {
          key: 'pengumuman-pemeliharaan',
          label: 'Pengumuman Pemeliharaan',
          fiturs: [
            {
              key: 'read',
              label: 'Read',
              permissions: [
                {
                  action: 'read-pengumuman',
                  label: 'Read',
                  description: 'Melihat pengumuman pemeliharaan',
                  resource: 'konfigurasi',
                },
              ],
            },
          ],
        },
        {
          key: 'tema-beranda',
          label: 'Tema',
          fiturs: [
            {
              key: 'read',
              label: 'Read',
              permissions: [
                {
                  action: 'read-tema',
                  label: 'Read',
                  description: 'Melihat konfigurasi Tema',
                  resource: 'konfigurasi',
                },
              ],
            },
          ],
        },
        {
          key: 'unit-tu',
          label: 'Unit TU',
          fiturs: [
            {
              key: 'read',
              label: 'Read',
              permissions: [
                {
                  action: 'read-unit-tu',
                  label: 'Read',
                  description: 'Melihat konfigurasi Unit TU',
                  resource: 'konfigurasi',
                },
              ],
            },
          ],
        },
        {
          key: 'unit-legal',
          label: 'Unit Legal',
          fiturs: [
            {
              key: 'read',
              label: 'Read',
              permissions: [
                {
                  action: 'read-unit-legal',
                  label: 'Read',
                  description: 'Melihat konfigurasi Unit Legal',
                  resource: 'konfigurasi',
                },
              ],
            },
          ],
        },
        {
          key: 'naskah-lainnya',
          label: 'Naskah Lainnya',
          fiturs: [
            {
              key: 'read',
              label: 'Read',
              permissions: [
                {
                  action: 'read-naskah-lainnya',
                  label: 'Read',
                  description: 'Melihat konfigurasi Naskah Lainnya',
                  resource: 'konfigurasi',
                },
              ],
            },
          ],
        },
        {
          key: 'mesin-pencarian',
          label: 'Mesin Pencarian',
          fiturs: [
            {
              key: 'read',
              label: 'Read',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Menggunakan mesin pencarian',
                  resource: 'smart-search',
                },
              ],
            },
          ],
        },
        {
          key: 'routing-persuratan',
          label: 'Routing Persuratan',
          fiturs: [
            {
              key: 'read',
              label: 'Read',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat konfigurasi routing persuratan',
                  resource: 'correspondence-routing',
                },
                ...[
                  ['create-role', 'Create Role', 'Membuat role routing'],
                  ['update-role', 'Update Role', 'Mengubah role routing'],
                  ['delete-role', 'Delete Role', 'Menghapus role routing'],
                  ['manage-members', 'Manage Members', 'Mengelola anggota routing'],
                  ['create-rule', 'Create Rule', 'Membuat rule routing'],
                  ['activate-rule', 'Activate Rule', 'Mengaktifkan rule routing'],
                  ['update-rule', 'Update Rule', 'Mengubah rule routing'],
                  ['delete-rule', 'Delete Rule', 'Menghapus rule routing'],
                  ['preview', 'Preview', 'Preview routing'],
                  ['read-health', 'Read Health', 'Melihat health routing'],
                ].map(([action, label, description]) => ({
                  action,
                  label,
                  description,
                  resource: 'correspondence-routing',
                })),
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'audit',
      label: 'Audit Trail',
      subMenus: [
        {
          key: 'log-aktivitas',
          label: 'Log Aktivitas',
          fiturs: [
            {
              key: 'read',
              label: 'Read',
              permissions: [
                {
                  action: 'read-log',
                  label: 'Read',
                  description: 'Melihat log aktivitas audit',
                  resource: 'audit',
                },
              ],
            },
          ],
        },
        {
          key: 'anomali-alert',
          label: 'Anomali / Alert',
          fiturs: [
            {
              key: 'read',
              label: 'Read',
              permissions: [
                {
                  action: 'read-anomaly',
                  label: 'Read',
                  description: 'Melihat anomali dan alert audit',
                  resource: 'audit',
                },
              ],
            },
          ],
        },
        {
          key: 'laporan-audit',
          label: 'Laporan Audit',
          fiturs: [
            {
              key: 'report',
              label: 'Laporan',
              permissions: [
                {
                  action: 'read-report',
                  label: 'Read',
                  description: 'Melihat ringkasan dan laporan audit',
                  resource: 'audit',
                },
                {
                  action: 'export',
                  label: 'Export',
                  description: 'Export laporan audit',
                  resource: 'audit',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export interface AdministrasiResourceDef {
  name: string;
  description: string;
  permissions: { action: string; description: string }[];
}

function flattenAdministrasiMatrix(
  halaman: AdministrasiMatrixHalaman,
): AdministrasiResourceDef[] {
  const map = new Map<string, AdministrasiResourceDef>();
  for (const menu of halaman.menus) {
    for (const sub of menu.subMenus) {
      for (const fitur of sub.fiturs) {
        for (const perm of fitur.permissions) {
          if (!map.has(perm.resource)) {
            map.set(perm.resource, {
              name: perm.resource,
              description: perm.resource,
              permissions: [],
            });
          }
          const res = map.get(perm.resource)!;
          if (!res.permissions.some((p) => p.action === perm.action)) {
            res.permissions.push({
              action: perm.action,
              description: perm.description,
            });
          }
        }
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export const administrasiResources =
  flattenAdministrasiMatrix(administrasiMatrix);

export const administrasiSuperAdminPermissions: string[] =
  administrasiResources.flatMap((r) =>
    r.permissions.map((p) => `${r.name}:${p.action}`),
  );
