/**
 * Permission yang dipakai langsung oleh endpoint lama/baru tetapi tidak
 * seluruhnya direpresentasikan oleh satu menu matrix.
 *
 * Daftar ini sengaja dipakai oleh semua seeder agar database baru dan database
 * existing mendapatkan katalog permission yang sama. Katalog tidak berarti
 * permission otomatis diberikan ke ADMIN/USER; assignment role mengikuti
 * policy role masing-masing.
 */
export interface PermissionCatalogResource {
  name: string;
  description: string;
  permissions: { action: string; description: string }[];
}

export const compatibilityResources: PermissionCatalogResource[] = [
  {
    name: 'master-data',
    description: 'Permission kompatibilitas endpoint master-data',
    permissions: [
      { action: 'create', description: 'Membuat data master' },
      { action: 'read', description: 'Melihat data master' },
      { action: 'update', description: 'Mengubah data master' },
      { action: 'delete', description: 'Menghapus data master' },
    ],
  },
  {
    name: 'konfigurasi',
    description: 'Konfigurasi sistem',
    permissions: [
      { action: 'create', description: 'Membuat konfigurasi' },
      { action: 'delete', description: 'Menghapus konfigurasi' },
    ],
  },
  {
    name: 'sde-masal',
    description: 'SDE Massal',
    permissions: [
      { action: 'create', description: 'Membuat pengajuan SDE Massal' },
      { action: 'update', description: 'Mengubah pengajuan SDE Massal' },
      { action: 'finalize', description: 'Memfinalisasi SDE Massal' },
      { action: 'delete', description: 'Menghapus SDE Massal' },
    ],
  },
  {
    name: 'correspondence-routing',
    description: 'Administrasi routing persuratan',
    permissions: [
      { action: 'read', description: 'Melihat konfigurasi routing' },
      { action: 'create-role', description: 'Membuat role routing' },
      { action: 'update-role', description: 'Mengubah role routing' },
      { action: 'delete-role', description: 'Menghapus role routing' },
      { action: 'manage-members', description: 'Mengelola anggota routing' },
      { action: 'create-rule', description: 'Membuat rule routing' },
      { action: 'activate-rule', description: 'Mengaktifkan rule routing' },
      { action: 'update-rule', description: 'Mengubah rule routing' },
      { action: 'delete-rule', description: 'Menghapus rule routing' },
      { action: 'preview', description: 'Preview routing' },
      { action: 'read-health', description: 'Melihat health routing' },
    ],
  },
  {
    name: 'penomoran',
    description: 'Permission kompatibilitas fitur penomoran',
    permissions: [
      { action: 'report', description: 'Melihat laporan penomoran' },
    ],
  },
  {
    name: 'penyingkat-tautan',
    description: 'Permission kompatibilitas export tautan',
    permissions: [
      { action: 'export', description: 'Export daftar tautan' },
    ],
  },
];
