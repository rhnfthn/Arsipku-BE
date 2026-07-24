// Matrix RBAC untuk Halaman Laporan
// Sesuai README §5.3 — Rekap Naskah, Detail Naskah, Naskah Masuk, Surat, SLA.

export interface LaporanMatrixPermission {
  action: string;
  label: string;
  description: string;
  resource: string;
}
export interface LaporanMatrixFitur {
  key: string;
  label: string;
  permissions: LaporanMatrixPermission[];
}
export interface LaporanMatrixSubMenu {
  key: string;
  label: string;
  fiturs: LaporanMatrixFitur[];
}
export interface LaporanMatrixMenu {
  key: string;
  label: string;
  subMenus: LaporanMatrixSubMenu[];
}
export interface LaporanMatrixHalaman {
  key: string;
  label: string;
  menus: LaporanMatrixMenu[];
}

export const laporanMatrix: LaporanMatrixHalaman = {
  key: 'laporan',
  label: 'Laporan',
  menus: [
    // ============================================================
    // 1. Rekap Naskah
    // ============================================================
    {
      key: 'rekap-naskah',
      label: 'Rekap Naskah',
      subMenus: [
        {
          key: 'rekap-naskah',
          label: 'Rekap Naskah',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Rekap Naskah',
              permissions: [
                {
                  action: 'read-rekap-naskah',
                  label: 'Read',
                  description: 'Melihat laporan rekap naskah',
                  resource: 'laporan',
                },
                {
                  action: 'export-rekap-naskah',
                  label: 'Export',
                  description: 'Button Export Rekap Naskah',
                  resource: 'laporan',
                },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 2. Detail Naskah
    // ============================================================
    {
      key: 'detail-naskah',
      label: 'Detail Naskah',
      subMenus: [
        {
          key: 'detail-naskah',
          label: 'Detail Naskah',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Detail Naskah',
              permissions: [
                {
                  action: 'read-detail-naskah',
                  label: 'Read',
                  description: 'Melihat laporan detail naskah',
                  resource: 'laporan',
                },
                {
                  action: 'export-detail-naskah',
                  label: 'Export',
                  description: 'Button Export Detail Naskah',
                  resource: 'laporan',
                },
              ],
            },
          ],
        },
      ],
    },
    // ============================================================
    // 3. Naskah Masuk
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
                {
                  action: 'read-naskah-masuk',
                  label: 'Read',
                  description: 'Melihat laporan naskah masuk',
                  resource: 'laporan',
                },
                {
                  action: 'export-naskah-masuk',
                  label: 'Export',
                  description: 'Button Export Naskah Masuk',
                  resource: 'laporan',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export interface LaporanResourceDef {
  name: string;
  description: string;
  permissions: { action: string; description: string }[];
}

function flattenLaporanMatrix(
  halaman: LaporanMatrixHalaman,
): LaporanResourceDef[] {
  const map = new Map<string, LaporanResourceDef>();
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

export const laporanResources = flattenLaporanMatrix(laporanMatrix);

export const laporanSuperAdminPermissions: string[] = laporanResources.flatMap(
  (r) => r.permissions.map((p) => `${r.name}:${p.action}`),
);
