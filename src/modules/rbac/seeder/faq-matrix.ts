// Matrix RBAC untuk Halaman FAQ & Pedoman
// Sesuai README §5.4 — FAQ, Manajemen FAQ (CRUD), Pedoman, Manajemen Pedoman (CRUD).

export interface FaqMatrixPermission {
  action: string;
  label: string;
  description: string;
  resource: string;
}
export interface FaqMatrixFitur {
  key: string;
  label: string;
  permissions: FaqMatrixPermission[];
}
export interface FaqMatrixSubMenu {
  key: string;
  label: string;
  fiturs: FaqMatrixFitur[];
}
export interface FaqMatrixMenu {
  key: string;
  label: string;
  subMenus: FaqMatrixSubMenu[];
}
export interface FaqMatrixHalaman {
  key: string;
  label: string;
  menus: FaqMatrixMenu[];
}

export const faqMatrix: FaqMatrixHalaman = {
  key: 'faq',
  label: 'FAQ & Pedoman',
  menus: [
    // ============================================================
    // 1. FAQ (read-only untuk semua role)
    // ============================================================
    {
      key: 'faq',
      label: 'FAQ',
      subMenus: [
        {
          key: 'faq',
          label: 'FAQ',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman FAQ',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat FAQ',
                  resource: 'faq',
                },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 2. Manajemen FAQ (CRUD — Admin & Super Admin)
    // ============================================================
    {
      key: 'manajemen-faq',
      label: 'Manajemen FAQ',
      subMenus: [
        {
          key: 'manajemen-faq',
          label: 'Manajemen FAQ',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Manajemen FAQ',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Halaman Manajemen FAQ',
                  resource: 'faq',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Tambah FAQ',
                  resource: 'faq',
                },
                {
                  action: 'update',
                  label: 'Update',
                  description: 'Button Edit FAQ',
                  resource: 'faq',
                },
                {
                  action: 'delete',
                  label: 'Delete',
                  description: 'Button Hapus FAQ',
                  resource: 'faq',
                },
                {
                  action: 'export',
                  label: 'Export',
                  description: 'Button Export FAQ',
                  resource: 'faq',
                },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 3. Pedoman (read-only untuk semua role)
    // ============================================================
    {
      key: 'pedoman',
      label: 'Pedoman',
      subMenus: [
        {
          key: 'pedoman',
          label: 'Pedoman',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Pedoman',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat pedoman',
                  resource: 'pedoman',
                },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 4. Manajemen Pedoman (CRUD — Admin & Super Admin)
    // ============================================================
    {
      key: 'manajemen-pedoman',
      label: 'Manajemen Pedoman',
      subMenus: [
        {
          key: 'manajemen-pedoman',
          label: 'Manajemen Pedoman',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Manajemen Pedoman',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Halaman Manajemen Pedoman',
                  resource: 'pedoman',
                },
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Button Tambah Pedoman',
                  resource: 'pedoman',
                },
                {
                  action: 'update',
                  label: 'Update',
                  description: 'Button Edit Pedoman',
                  resource: 'pedoman',
                },
                {
                  action: 'delete',
                  label: 'Delete',
                  description: 'Button Delete Pedoman',
                  resource: 'pedoman',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export interface FaqResourceDef {
  name: string;
  description: string;
  permissions: { action: string; description: string }[];
}

function flattenFaqMatrix(halaman: FaqMatrixHalaman): FaqResourceDef[] {
  const map = new Map<string, FaqResourceDef>();
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

export const faqResources = flattenFaqMatrix(faqMatrix);

export const faqSuperAdminPermissions: string[] = faqResources.flatMap((r) =>
  r.permissions.map((p) => `${r.name}:${p.action}`),
);
