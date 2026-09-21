
export interface UtilitasMatrixPermission {
  action: string;
  label: string;
  description: string;
  resource: string;
}
export interface UtilitasMatrixFitur {
  key: string;
  label: string;
  permissions: UtilitasMatrixPermission[];
}
export interface UtilitasMatrixSubMenu {
  key: string;
  label: string;
  fiturs: UtilitasMatrixFitur[];
}
export interface UtilitasMatrixMenu {
  key: string;
  label: string;
  subMenus: UtilitasMatrixSubMenu[];
}
export interface UtilitasMatrixHalaman {
  key: string;
  label: string;
  menus: UtilitasMatrixMenu[];
}

export const utilitasMatrix: UtilitasMatrixHalaman = {
  key: 'utilitas',
  label: 'Utilitas',
  menus: [
    {
      key: 'ttd-digital',
      label: 'TTD Digital',
      subMenus: [
        {
          key: 'verifikasi-dokumen',
          label: 'Verifikasi Dokumen',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Verifikasi Dokumen',
              permissions: [
                {
                  action: 'read-verifikasi-dokumen',
                  label: 'Read',
                  description: 'Melihat halaman Verifikasi Dokumen',
                  resource: 'digsig',
                },
                {
                  action: 'create-verifikasi-dokumen',
                  label: 'Create',
                  description: 'Button Tambah Dokumen',
                  resource: 'digsig',
                },
                {
                  action: 'read-verifikasi-dokumen-lihat',
                  label: 'Read',
                  description: 'Button Lihat Dokumen (Verifikasi)',
                  resource: 'digsig',
                },
                {
                  action: 'read-verifikasi-dokumen-detail',
                  label: 'Read',
                  description: 'Button Show Detail Dokumen',
                  resource: 'digsig',
                },
                {
                  action: 'update-verifikasi-dokumen',
                  label: 'Update',
                  description: 'Button Edit Dokumen',
                  resource: 'digsig',
                },
              ],
            },
          ],
        },
        {
          key: 'penandatanganan',
          label: 'Penandatanganan',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Penandatanganan',
              permissions: [
                {
                  action: 'read-penandatanganan',
                  label: 'Read',
                  description: 'Melihat halaman Penandatanganan',
                  resource: 'digsig',
                },
                {
                  action: 'read-penandatanganan-detail',
                  label: 'Read',
                  description: 'Button Show Detail Dokumen',
                  resource: 'digsig',
                },
                {
                  action: 'read-penandatanganan-lihat',
                  label: 'Read',
                  description: 'Button Lihat Dokumen (Penandatanganan)',
                  resource: 'digsig',
                },
                {
                  action: 'create-penandatanganan-ttd',
                  label: 'Create',
                  description: 'Button Tanda Tangan',
                  resource: 'digsig',
                },
                {
                  action: 'create-penandatanganan-tolak',
                  label: 'Create',
                  description: 'Button Tolak',
                  resource: 'digsig',
                },
              ],
            },
          ],
        },
        {
          key: 'cek-dokumen',
          label: 'Cek Dokumen',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Cek Dokumen',
              permissions: [
                {
                  action: 'read-cek-dokumen',
                  label: 'Read',
                  description: 'Melihat halaman Cek Dokumen',
                  resource: 'digsig',
                },
              ],
            },
          ],
        },
        {
          key: 'log-disdig',
          label: 'Log Disdig',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Log Disdig',
              permissions: [
                {
                  action: 'read-log-disdig',
                  label: 'Read',
                  description: 'Melihat halaman Log Disdig',
                  resource: 'digsig',
                },
                {
                  action: 'create-log-disdig-alert',
                  label: 'Create',
                  description: 'Button Aktifkan Alert Gangguan',
                  resource: 'digsig',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'penyingkatan-tautan',
      label: 'Penyingkatan Tautan',
      subMenus: [
        {
          key: 'penyingkatan-tautan',
          label: 'Penyingkatan Tautan',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Penyingkatan Tautan',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Penyingkatan Tautan',
                  resource: 'penyingkat-tautan',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Tambah Tautan',
                  resource: 'penyingkat-tautan',
                },
                {
                  action: 'update',
                  label: 'Update',
                  description: 'Button Edit Tautan',
                  resource: 'penyingkat-tautan',
                },
                {
                  action: 'delete',
                  label: 'Delete',
                  description: 'Button Delete Tautan',
                  resource: 'penyingkat-tautan',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'layanan-email',
      label: 'Layanan Email',
      subMenus: [
        {
          key: 'kirim-email',
          label: 'Kirim Email',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Kirim Email',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Kirim Email',
                  resource: 'layanan-email',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Kirim Email',
                  resource: 'layanan-email',
                },
              ],
            },
          ],
        },
        {
          key: 'log-email',
          label: 'Log Email',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Log Email',
              permissions: [
                {
                  action: 'read-log',
                  label: 'Read',
                  description: 'Melihat halaman Log Email',
                  resource: 'layanan-email',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'template',
      label: 'Template',
      subMenus: [
        {
          key: 'template',
          label: 'Template',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Template',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Template',
                  resource: 'template',
                },
                {
                  action: 'read-download',
                  label: 'Read',
                  description: 'Button Download Template',
                  resource: 'template',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Tambah Template',
                  resource: 'template',
                },
                {
                  action: 'update',
                  label: 'Update',
                  description: 'Button Edit Template',
                  resource: 'template',
                },
                {
                  action: 'delete',
                  label: 'Delete',
                  description: 'Button Delete Template',
                  resource: 'template',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'verifikasi-naskah',
      label: 'Verifikasi Naskah',
      subMenus: [
        {
          key: 'verifikasi-naskah',
          label: 'Verifikasi Naskah',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Verifikasi Naskah',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Verifikasi Naskah',
                  resource: 'verifikasi-naskah',
                },
                {
                  action: 'read-lihat',
                  label: 'Read',
                  description: 'Melihat dokumen file',
                  resource: 'verifikasi-naskah',
                },
                {
                  action: 'read-detail',
                  label: 'Read',
                  description: 'Melihat detail naskah',
                  resource: 'verifikasi-naskah',
                },
                {
                  action: 'confirm',
                  label: 'Confirm',
                  description: 'Confirm naskah',
                  resource: 'verifikasi-naskah',
                },
                {
                  action: 'reject',
                  label: 'Reject',
                  description: 'Menolak naskah',
                  resource: 'verifikasi-naskah',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export interface UtilitasResourceDef {
  name: string;
  description: string;
  permissions: { action: string; description: string }[];
}

function flattenUtilitasMatrix(
  halaman: UtilitasMatrixHalaman,
): UtilitasResourceDef[] {
  const map = new Map<string, UtilitasResourceDef>();
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

export const utilitasResources = flattenUtilitasMatrix(utilitasMatrix);

export const utilitasSuperAdminPermissions: string[] =
  utilitasResources.flatMap((r) =>
    r.permissions.map((p) => `${r.name}:${p.action}`),
  );
