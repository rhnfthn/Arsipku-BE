// Matrix RBAC untuk Halaman Kelola — Arsip Dinamis Phase 1
// Pemberkasan Arsip Aktif + Persetujuan Pemberkasan

export interface ResourcePermission {
  action: string;
  description: string;
}

export interface ResourceDefinition {
  name: string;
  description: string;
  permissions: ResourcePermission[];
}

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
    name: 'pemeliharaan.retensi',
    description: 'Riwayat & Retensi — melihat berkas yang sudah closed dan masa retensi',
    permissions: [
      { action: 'read', description: 'Melihat riwayat dan status retensi berkas' },
    ],
  },
];

// Semua permission untuk SUPERADMIN
export const kelolaSuperAdminPermissions: string[] = kelolaResources.flatMap((r) =>
  r.permissions.map((p) => `${r.name}.${p.action}`),
);
