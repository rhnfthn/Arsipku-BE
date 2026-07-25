// Matrix RBAC untuk Halaman Utama — Super Admin
// Sesuai spesifikasi user: per menu/fitur dengan checkbox per action.

export interface MatrixPermission {
  action: string;
  label: string;
  description: string;
  resource: string;
}

export interface MatrixFitur {
  key: string;
  label: string;
  permissions: MatrixPermission[];
}

export interface MatrixSubMenu {
  key: string;
  label: string;
  fiturs: MatrixFitur[];
}

export interface MatrixMenu {
  key: string;
  label: string;
  subMenus: MatrixSubMenu[];
}

export interface MatrixHalaman {
  key: string;
  label: string;
  menus: MatrixMenu[];
}

// ============================================================
// UTAMA matrix definition
// ============================================================

export const utamaMatrix: MatrixHalaman = {
  key: 'utama',
  label: 'Utama',
  menus: [
    {
      key: 'beranda',
      label: 'Beranda',
      subMenus: [
        {
          key: 'beranda',
          label: 'Beranda',
          fiturs: [
            {
              key: 'dashboard',
              label: 'Dashboard',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman dashboard',
                  resource: 'utama.beranda',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'tulis',
      label: 'Tulis',
      subMenus: [
        {
          key: 'nota-dinas',
          label: 'Nota Dinas',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Nota Dinas',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Nota Dinas',
                  resource: 'utama.tulis.nota-dinas',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Pratinjau',
                  resource: 'utama.tulis.nota-dinas',
                },
              ],
            },
            {
              key: 'button-generate-ai',
              label: 'Button Generate AI',
              permissions: [
                {
                  action: 'generate-ai',
                  label: 'Create',
                  description: 'Button Generate AI Draft',
                  resource: 'utama.tulis.nota-dinas',
                },
              ],
            },
          ],
        },
        {
          key: 'disposisi',
          label: 'Disposisi',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Disposisi',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Disposisi',
                  resource: 'utama.tulis.disposisi',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Pratinjau',
                  resource: 'utama.tulis.disposisi',
                },
              ],
            },
          ],
        },
        {
          key: 'surat-dinas-internal',
          label: 'Surat Dinas Internal',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Surat Dinas Internal',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Surat Dinas Internal',
                  resource: 'utama.tulis.surat-dinas-internal',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Pratinjau',
                  resource: 'utama.tulis.surat-dinas-internal',
                },
              ],
            },
            {
              key: 'button-generate-ai',
              label: 'Button Generate AI',
              permissions: [
                {
                  action: 'generate-ai',
                  label: 'Create',
                  description: 'Button Generate AI Draft',
                  resource: 'utama.tulis.surat-dinas-internal',
                },
              ],
            },
          ],
        },
        {
          key: 'surat-dinas-eksternal',
          label: 'Surat Dinas Eksternal',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Surat Dinas Eksternal',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Surat Dinas Eksternal',
                  resource: 'utama.tulis.surat-dinas-eksternal',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Pratinjau',
                  resource: 'utama.tulis.surat-dinas-eksternal',
                },
              ],
            },
            {
              key: 'button-generate-ai',
              label: 'Button Generate AI',
              permissions: [
                {
                  action: 'generate-ai',
                  label: 'Create',
                  description: 'Button Generate AI Draft',
                  resource: 'utama.tulis.surat-dinas-eksternal',
                },
              ],
            },
          ],
        },
        {
          key: 'kajian',
          label: 'Kajian',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Kajian',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Kajian',
                  resource: 'utama.tulis.kajian',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Pratinjau',
                  resource: 'utama.tulis.kajian',
                },
              ],
            },
            {
              key: 'button-generate-ai',
              label: 'Button Generate AI',
              permissions: [
                {
                  action: 'generate-ai',
                  label: 'Create',
                  description: 'Button Generate AI Draft',
                  resource: 'utama.tulis.kajian',
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
              key: 'halaman',
              label: 'Halaman Naskah Lainnya',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Naskah Lainnya',
                  resource: 'utama.tulis.naskah-lainnya',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Pratinjau',
                  resource: 'utama.tulis.naskah-lainnya',
                },
                {
                  action: 'create-draft',
                  label: 'Create',
                  description: 'Button Simpan Draft',
                  resource: 'utama.tulis.naskah-lainnya',
                },
                {
                  action: 'create-send',
                  label: 'Create',
                  description: 'Button Kirim',
                  resource: 'utama.tulis.naskah-lainnya',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'kotak-masuk',
      label: 'Kotak Masuk',
      subMenus: [
        {
          key: 'kotak-masuk',
          label: 'Kotak Masuk',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Kotak Masuk',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Kotak Masuk',
                  resource: 'utama.kotak-masuk',
                },
                {
                  action: 'read-detail',
                  label: 'Read',
                  description: 'Melihat halaman detail surat',
                  resource: 'utama.kotak-masuk',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'terkirim',
      label: 'Terkirim',
      subMenus: [
        {
          key: 'terkirim',
          label: 'Terkirim',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Terkirim',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Terkirim',
                  resource: 'utama.terkirim',
                },
                {
                  action: 'read-detail',
                  label: 'Read',
                  description: 'Melihat halaman detail terkirim',
                  resource: 'utama.terkirim',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'tertunda',
      label: 'Tertunda',
      subMenus: [
        {
          key: 'tertunda',
          label: 'Tertunda',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Tertunda',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Tertunda',
                  resource: 'utama.tertunda',
                },
                {
                  action: 'read-detail',
                  label: 'Read',
                  description: 'Melihat halaman detail tertunda',
                  resource: 'utama.tertunda',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'draft',
      label: 'Draft',
      subMenus: [
        {
          key: 'draft',
          label: 'Draft',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Draft',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Draft',
                  resource: 'utama.draft',
                },
                {
                  action: 'read-detail',
                  label: 'Read',
                  description: 'Melihat halaman detail surat',
                  resource: 'utama.draft',
                },
                {
                  action: 'update',
                  label: 'Update',
                  description: 'Mengedit surat',
                  resource: 'utama.draft',
                },
                {
                  action: 'delete',
                  label: 'Delete',
                  description: 'Menghapus draft',
                  resource: 'utama.draft',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// ============================================================
// Flatten ke daftar resource + permission untuk seeder
// ============================================================

export interface ResourceDef {
  name: string;
  description: string;
  permissions: { action: string; description: string }[];
}

function flattenMatrix(halaman: MatrixHalaman): ResourceDef[] {
  const map = new Map<string, ResourceDef>();
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

export const utamaResources = flattenMatrix(utamaMatrix);

// Super Admin default assignments: semua permission Utama aktif
export const utamaSuperAdminPermissions: string[] = utamaResources.flatMap(
  (r) => r.permissions.map((p) => `${r.name}:${p.action}`),
);
