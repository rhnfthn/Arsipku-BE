// Matrix RBAC untuk Halaman Berbagi (Share Naskah)
// Semua role (USER, ADMIN, SUPERADMIN) dapat mengakses fitur ini

import { MatrixHalaman, flattenMatrix } from './utama-matrix';

export const shareMatrix: MatrixHalaman = {
  key: 'berbagi',
  label: 'Berbagi',
  menus: [
    {
      key: 'berbagi',
      label: 'Berbagi',
      subMenus: [
        {
          key: 'berbagi',
          label: 'Berbagi',
          fiturs: [
            {
              key: 'halaman',
              label: 'Halaman Berbagi',
              permissions: [
                {
                  action: 'read',
                  label: 'Read',
                  description: 'Melihat halaman Berbagi',
                  resource: 'naskah-share',
                },
              ],
            },
            {
              key: 'bagikan',
              label: 'Bagikan Naskah',
              permissions: [
                {
                  action: 'create',
                  label: 'Create',
                  description: 'Membagikan naskah ke user lain',
                  resource: 'naskah-share',
                },
              ],
            },
            {
              key: 'buka-naskah',
              label: 'Buka Naskah',
              permissions: [
                {
                  action: 'open',
                  label: 'Open',
                  description: 'Membuka naskah yang dibagikan',
                  resource: 'naskah-share',
                },
              ],
            },
            {
              key: 'cabut-akses',
              label: 'Cabut Akses',
              permissions: [
                {
                  action: 'delete',
                  label: 'Delete',
                  description: 'Mencabut akses share',
                  resource: 'naskah-share',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export const shareResources = flattenMatrix(shareMatrix);
