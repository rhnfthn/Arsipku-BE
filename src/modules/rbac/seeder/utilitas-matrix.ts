// Matrix RBAC untuk Halaman Utilitas — Super Admin
// Sesuai spesifikasi user.

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
                { action: 'read', label: 'Read', description: 'Melihat halaman Verifikasi Dokumen', resource: 'utilitas.ttd-digital.verifikasi-dokumen' },
                { action: 'create', label: 'Create', description: 'Button Tambah Dokumen', resource: 'utilitas.ttd-digital.verifikasi-dokumen' },
                { action: 'read-lihat', label: 'Read', description: 'Button Lihat File Dokumen', resource: 'utilitas.ttd-digital.verifikasi-dokumen' },
                { action: 'read-detail', label: 'Read', description: 'Button Show Detail Dokumen', resource: 'utilitas.ttd-digital.verifikasi-dokumen' },
                { action: 'update', label: 'Update', description: 'Button Edit Dokumen', resource: 'utilitas.ttd-digital.verifikasi-dokumen' },
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
                { action: 'read', label: 'Read', description: 'Melihat halaman Penandatanganan', resource: 'utilitas.ttd-digital.penandatanganan' },
                { action: 'read-lihat', label: 'Read', description: 'Button Lihat File Dokumen', resource: 'utilitas.ttd-digital.penandatanganan' },
                { action: 'read-detail', label: 'Read', description: 'Button Show Detail Dokumen', resource: 'utilitas.ttd-digital.penandatanganan' },
                { action: 'create-ttd', label: 'Create', description: 'Button Tanda Tangan', resource: 'utilitas.ttd-digital.penandatanganan' },
                { action: 'create-tolak', label: 'Create', description: 'Button Tolak', resource: 'utilitas.ttd-digital.penandatanganan' },
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
                { action: 'read', label: 'Read', description: 'Melihat halaman Cek Dokumen', resource: 'utilitas.ttd-digital.cek-dokumen' },
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
                { action: 'read', label: 'Read', description: 'Melihat halaman Log Disdig', resource: 'utilitas.ttd-digital.log-disdig' },
                { action: 'create', label: 'Create', description: 'Button Aktifkan Alert Gangguan', resource: 'utilitas.ttd-digital.log-disdig' },
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
                { action: 'read', label: 'Read', description: 'Melihat halaman Penyingkatan Tautan', resource: 'utilitas.penyingkatan-tautan' },
                { action: 'create', label: 'Create', description: 'Button Tambah Tautan', resource: 'utilitas.penyingkatan-tautan' },
                { action: 'update', label: 'Update', description: 'Button Edit Tautan', resource: 'utilitas.penyingkatan-tautan' },
                { action: 'delete', label: 'Delete', description: 'Button Delete Tautan', resource: 'utilitas.penyingkatan-tautan' },
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
                { action: 'read', label: 'Read', description: 'Melihat halaman Kirim Email', resource: 'utilitas.layanan-email' },
                { action: 'create', label: 'Create', description: 'Button Kirim Email', resource: 'utilitas.layanan-email' },
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
                { action: 'read', label: 'Read', description: 'Melihat halaman Log Email', resource: 'utilitas.layanan-email.log' },
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
                { action: 'read', label: 'Read', description: 'Melihat halaman Template', resource: 'utilitas.template' },
                { action: 'create', label: 'Create', description: 'Button Tambah Template', resource: 'utilitas.template' },
                { action: 'read-download', label: 'Read', description: 'Button Download Template', resource: 'utilitas.template' },
                { action: 'update', label: 'Update', description: 'Button Edit Template', resource: 'utilitas.template' },
                { action: 'delete', label: 'Delete', description: 'Button Delete Template', resource: 'utilitas.template' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// Flatten ke daftar resource + permission untuk seeder
export interface UtilitasResourceDef {
  name: string;
  description: string;
  permissions: { action: string; description: string }[];
}

function flattenUtilitasMatrix(halaman: UtilitasMatrixHalaman): UtilitasResourceDef[] {
  const map = new Map<string, UtilitasResourceDef>();
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

export const utilitasResources = flattenUtilitasMatrix(utilitasMatrix);

export const utilitasSuperAdminPermissions: string[] = utilitasResources.flatMap((r) =>
  r.permissions.map((p) => `${r.name}:${p.action}`),
);