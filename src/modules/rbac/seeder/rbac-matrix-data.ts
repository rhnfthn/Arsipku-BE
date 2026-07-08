// AUTO-GENERATED from doc/rbac Excel files — do not edit manually
export interface MatrixPermission { action: string; label: string; resource: string }
export interface MatrixFitur { key: string; label: string; permissions: MatrixPermission[] }
export interface MatrixSubMenu { key: string; label: string; fiturs: MatrixFitur[] }
export interface MatrixMenu { key: string; label: string; subMenus: MatrixSubMenu[] }
export interface MatrixHalaman { key: string; label: string; menus: MatrixMenu[] }

export const rbacResourcesWithPermissions = [
  {
    "name": "administrasi.data-master.jenis.button-delete-jenis",
    "description": "administrasi.data-master.jenis.button-delete-jenis",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Delete Jenis - Delete"
      }
    ]
  },
  {
    "name": "administrasi.data-master.jenis.button-detail-jenis",
    "description": "administrasi.data-master.jenis.button-detail-jenis",
    "permissions": [
      {
        "action": "read",
        "description": "Button Detail Jenis - Read"
      }
    ]
  },
  {
    "name": "administrasi.data-master.jenis.button-edit-jenis",
    "description": "administrasi.data-master.jenis.button-edit-jenis",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Jenis - Update"
      }
    ]
  },
  {
    "name": "administrasi.data-master.jenis.button-export",
    "description": "administrasi.data-master.jenis.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.data-master.jenis.button-tambah-jenis",
    "description": "administrasi.data-master.jenis.button-tambah-jenis",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Jenis - Create"
      }
    ]
  },
  {
    "name": "administrasi.data-master.jenis.halaman-jenis",
    "description": "administrasi.data-master.jenis.halaman-jenis",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Jenis - Read"
      }
    ]
  },
  {
    "name": "administrasi.data-master.klasifikasi.button-action-delete",
    "description": "administrasi.data-master.klasifikasi.button-action-delete",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Action Delete - Delete"
      }
    ]
  },
  {
    "name": "administrasi.data-master.klasifikasi.button-action-edit",
    "description": "administrasi.data-master.klasifikasi.button-action-edit",
    "permissions": [
      {
        "action": "update",
        "description": "Button Action Edit - Update"
      }
    ]
  },
  {
    "name": "administrasi.data-master.klasifikasi.button-export",
    "description": "administrasi.data-master.klasifikasi.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.data-master.klasifikasi.button-tambah",
    "description": "administrasi.data-master.klasifikasi.button-tambah",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah - Create"
      }
    ]
  },
  {
    "name": "administrasi.data-master.klasifikasi.button-tambah-klasifikasi",
    "description": "administrasi.data-master.klasifikasi.button-tambah-klasifikasi",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Klasifikasi - Create"
      }
    ]
  },
  {
    "name": "administrasi.data-master.klasifikasi.halaman-klasifikasi",
    "description": "administrasi.data-master.klasifikasi.halaman-klasifikasi",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Klasifikasi - Read"
      }
    ]
  },
  {
    "name": "administrasi.data-master.perusahaan.button-action-area",
    "description": "administrasi.data-master.perusahaan.button-action-area",
    "permissions": [
      {
        "action": "read",
        "description": "Button Action Area - Read"
      }
    ]
  },
  {
    "name": "administrasi.data-master.perusahaan.button-action-delete-perusahaan",
    "description": "administrasi.data-master.perusahaan.button-action-delete-perusahaan",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Action Delete Perusahaan - Delete"
      }
    ]
  },
  {
    "name": "administrasi.data-master.perusahaan.button-action-edit-perusahaan",
    "description": "administrasi.data-master.perusahaan.button-action-edit-perusahaan",
    "permissions": [
      {
        "action": "update",
        "description": "Button Action Edit Perusahaan - Update"
      }
    ]
  },
  {
    "name": "administrasi.data-master.perusahaan.button-tambah-perusahaan",
    "description": "administrasi.data-master.perusahaan.button-tambah-perusahaan",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Perusahaan - Create"
      }
    ]
  },
  {
    "name": "administrasi.data-master.perusahaan.halaman-perusahaan",
    "description": "administrasi.data-master.perusahaan.halaman-perusahaan",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Perusahaan - Read"
      }
    ]
  },
  {
    "name": "administrasi.data-master.tertuju.button-edit-tertuju-eksternal",
    "description": "administrasi.data-master.tertuju.button-edit-tertuju-eksternal",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Tertuju Eksternal - Update"
      }
    ]
  },
  {
    "name": "administrasi.data-master.tertuju.button-export",
    "description": "administrasi.data-master.tertuju.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.data-master.tertuju.button-hapus-data",
    "description": "administrasi.data-master.tertuju.button-hapus-data",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Hapus Data - Delete"
      }
    ]
  },
  {
    "name": "administrasi.data-master.tertuju.button-tambah-tertuju-eksternal",
    "description": "administrasi.data-master.tertuju.button-tambah-tertuju-eksternal",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Tertuju Eksternal - Create"
      }
    ]
  },
  {
    "name": "administrasi.data-master.tertuju.halaman-tertuju",
    "description": "administrasi.data-master.tertuju.halaman-tertuju",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Tertuju - Read"
      }
    ]
  },
  {
    "name": "administrasi.delegasi.button-delete-delegasi",
    "description": "administrasi.delegasi.button-delete-delegasi",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Delete Delegasi - Delete"
      }
    ]
  },
  {
    "name": "administrasi.delegasi.button-edit-delegasi",
    "description": "administrasi.delegasi.button-edit-delegasi",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Delegasi - Update"
      }
    ]
  },
  {
    "name": "administrasi.delegasi.button-export",
    "description": "administrasi.delegasi.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.delegasi.button-tambah-delegasi",
    "description": "administrasi.delegasi.button-tambah-delegasi",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Delegasi - Create"
      }
    ]
  },
  {
    "name": "administrasi.delegasi.halaman-delegasi",
    "description": "administrasi.delegasi.halaman-delegasi",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Delegasi - Read"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.konfigurasi-sistem",
    "description": "administrasi.manajemen-rbac.konfigurasi-sistem",
    "permissions": [
      {
        "action": "read",
        "description": "Konfigurasi Sistem - Read"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.permission.button-export",
    "description": "administrasi.manajemen-rbac.permission.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.permission.halaman-permission",
    "description": "administrasi.manajemen-rbac.permission.halaman-permission",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Permission - Read"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.resource.button-export",
    "description": "administrasi.manajemen-rbac.resource.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.resource.halaman-resource",
    "description": "administrasi.manajemen-rbac.resource.halaman-resource",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Resource - Read"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.role.button-detail-role",
    "description": "administrasi.manajemen-rbac.role.button-detail-role",
    "permissions": [
      {
        "action": "read",
        "description": "Button Detail Role - Read"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.role.button-edit-role",
    "description": "administrasi.manajemen-rbac.role.button-edit-role",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Role - Update"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.role.halaman-role",
    "description": "administrasi.manajemen-rbac.role.halaman-role",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Role - Read"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.user-role.button-detail-role",
    "description": "administrasi.manajemen-rbac.user-role.button-detail-role",
    "permissions": [
      {
        "action": "read",
        "description": "Button Detail Role - Read"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.user-role.button-export",
    "description": "administrasi.manajemen-rbac.user-role.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.user-role.button-tambah-role",
    "description": "administrasi.manajemen-rbac.user-role.button-tambah-role",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Role - Create"
      }
    ]
  },
  {
    "name": "administrasi.manajemen-rbac.user-role.halaman-user-role",
    "description": "administrasi.manajemen-rbac.user-role.halaman-user-role",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman User Role - Read"
      }
    ]
  },
  {
    "name": "administrasi.naskah-masuk.button-action-edit-naskah",
    "description": "administrasi.naskah-masuk.button-action-edit-naskah",
    "permissions": [
      {
        "action": "update",
        "description": "Button Action Edit Naskah - Update"
      }
    ]
  },
  {
    "name": "administrasi.naskah-masuk.button-action-show-detail-naskah",
    "description": "administrasi.naskah-masuk.button-action-show-detail-naskah",
    "permissions": [
      {
        "action": "read",
        "description": "Button Action Show Detail Naskah - Read"
      }
    ]
  },
  {
    "name": "administrasi.naskah-masuk.button-export",
    "description": "administrasi.naskah-masuk.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.naskah-masuk.button-tambah-naskah-masuk",
    "description": "administrasi.naskah-masuk.button-tambah-naskah-masuk",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Naskah Masuk - Create"
      }
    ]
  },
  {
    "name": "administrasi.naskah-masuk.halaman-verifikasi-naskah",
    "description": "administrasi.naskah-masuk.halaman-verifikasi-naskah",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Naskah Masuk - Read"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.penomoran.button-export",
    "description": "administrasi.penomoran.penomoran.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.penomoran.button-tambah-penomoran",
    "description": "administrasi.penomoran.penomoran.button-tambah-penomoran",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Penomoran - Create"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.penomoran.halaman-penomoran",
    "description": "administrasi.penomoran.penomoran.halaman-penomoran",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Penomoran - Read"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.persetujuan.button-export",
    "description": "administrasi.penomoran.persetujuan.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.persetujuan.halaman-persetujuan",
    "description": "administrasi.penomoran.persetujuan.halaman-persetujuan",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Persetujuan - Read"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.usulan.button-export",
    "description": "administrasi.penomoran.usulan.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.usulan.button-export-usulan",
    "description": "administrasi.penomoran.usulan.button-export-usulan",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export Usulan - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.usulan.button-tambah-usulan",
    "description": "administrasi.penomoran.usulan.button-tambah-usulan",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Usulan - Create"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.usulan.halaman-usulan",
    "description": "administrasi.penomoran.usulan.halaman-usulan",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Usulan - Read"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.verifikasi.button-export",
    "description": "administrasi.penomoran.verifikasi.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "administrasi.penomoran.verifikasi.halaman-verifikasi",
    "description": "administrasi.penomoran.verifikasi.halaman-verifikasi",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Verifikasi - Read"
      }
    ]
  },
  {
    "name": "administrasi.titelatur-inggris.button-delete-titelatur",
    "description": "administrasi.titelatur-inggris.button-delete-titelatur",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Delete Titelatur - Delete"
      }
    ]
  },
  {
    "name": "administrasi.titelatur-inggris.button-delete-titelatur-inggris",
    "description": "administrasi.titelatur-inggris.button-delete-titelatur-inggris",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Delete Titelatur Inggris - Delete"
      }
    ]
  },
  {
    "name": "administrasi.titelatur-inggris.button-edit-titelatur",
    "description": "administrasi.titelatur-inggris.button-edit-titelatur",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Titelatur - Update"
      }
    ]
  },
  {
    "name": "administrasi.titelatur-inggris.button-edit-titelatur-inggris",
    "description": "administrasi.titelatur-inggris.button-edit-titelatur-inggris",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Titelatur Inggris - Update"
      }
    ]
  },
  {
    "name": "administrasi.titelatur-inggris.button-tambah-titelatur",
    "description": "administrasi.titelatur-inggris.button-tambah-titelatur",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Titelatur - Create"
      }
    ]
  },
  {
    "name": "administrasi.titelatur-inggris.button-tambah-titelatur-inggris",
    "description": "administrasi.titelatur-inggris.button-tambah-titelatur-inggris",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Titelatur Inggris - Create"
      }
    ]
  },
  {
    "name": "administrasi.titelatur-inggris.halaman-titelatur-inggris",
    "description": "administrasi.titelatur-inggris.halaman-titelatur-inggris",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Titelatur Inggris - Read"
      }
    ]
  },
  {
    "name": "faq.faq.halaman-faq",
    "description": "faq.faq.halaman-faq",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman FAQ - Read"
      }
    ]
  },
  {
    "name": "faq.manajemen-faq.button-delete-faq",
    "description": "faq.manajemen-faq.button-delete-faq",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Delete FAQ - Delete"
      }
    ]
  },
  {
    "name": "faq.manajemen-faq.button-edit-faq",
    "description": "faq.manajemen-faq.button-edit-faq",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit FAQ - Update"
      }
    ]
  },
  {
    "name": "faq.manajemen-faq.button-export",
    "description": "faq.manajemen-faq.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "faq.manajemen-faq.button-tambah-faq",
    "description": "faq.manajemen-faq.button-tambah-faq",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah FAQ - Create"
      }
    ]
  },
  {
    "name": "faq.manajemen-faq.halaman-manajemen-faq",
    "description": "faq.manajemen-faq.halaman-manajemen-faq",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Manajemen FAQ - Read"
      }
    ]
  },
  {
    "name": "faq.manajemen-pedoman.button-delete-pedoman",
    "description": "faq.manajemen-pedoman.button-delete-pedoman",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Delete Pedoman - Delete"
      }
    ]
  },
  {
    "name": "faq.manajemen-pedoman.button-edit-pedoman",
    "description": "faq.manajemen-pedoman.button-edit-pedoman",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Pedoman - Update"
      }
    ]
  },
  {
    "name": "faq.manajemen-pedoman.button-tambah-pedoman",
    "description": "faq.manajemen-pedoman.button-tambah-pedoman",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Pedoman - Create"
      }
    ]
  },
  {
    "name": "faq.manajemen-pedoman.halaman-manajemen-pedoman",
    "description": "faq.manajemen-pedoman.halaman-manajemen-pedoman",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Manajemen Pedoman - Read"
      }
    ]
  },
  {
    "name": "faq.pedoman.halaman-pedoman",
    "description": "faq.pedoman.halaman-pedoman",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Pedoman - Read"
      }
    ]
  },
  {
    "name": "laporan.detail-naskah.button-export",
    "description": "laporan.detail-naskah.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "laporan.detail-naskah.halaman-detail-naskah",
    "description": "laporan.detail-naskah.halaman-detail-naskah",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Detail Naskah - Read"
      }
    ]
  },
  {
    "name": "laporan.laporan-sla.button-cetak-laporan-pdf",
    "description": "laporan.laporan-sla.button-cetak-laporan-pdf",
    "permissions": [
      {
        "action": "export",
        "description": "Button Cetak Laporan (PDF) - Read (Export)"
      }
    ]
  },
  {
    "name": "laporan.laporan-sla.button-export-excel",
    "description": "laporan.laporan-sla.button-export-excel",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export Excel - Read (Export)"
      }
    ]
  },
  {
    "name": "laporan.laporan-sla.halaman-laporan-sla",
    "description": "laporan.laporan-sla.halaman-laporan-sla",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Laporan SLA - Read"
      }
    ]
  },
  {
    "name": "laporan.laporan-surat.button-cetak-laporan-pdf",
    "description": "laporan.laporan-surat.button-cetak-laporan-pdf",
    "permissions": [
      {
        "action": "export",
        "description": "Button Cetak Laporan (PDF) - Read (Export)"
      }
    ]
  },
  {
    "name": "laporan.laporan-surat.button-export-excel",
    "description": "laporan.laporan-surat.button-export-excel",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export Excel - Read (Export)"
      }
    ]
  },
  {
    "name": "laporan.laporan-surat.halaman-laporan-surat",
    "description": "laporan.laporan-surat.halaman-laporan-surat",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Laporan Surat - Read"
      }
    ]
  },
  {
    "name": "laporan.naskah-masuk.button-export",
    "description": "laporan.naskah-masuk.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "laporan.naskah-masuk.halaman-naskah-masuk",
    "description": "laporan.naskah-masuk.halaman-naskah-masuk",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Naskah Masuk - Read"
      }
    ]
  },
  {
    "name": "laporan.rekap-naskah.button-export",
    "description": "laporan.rekap-naskah.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "laporan.rekap-naskah.halaman-rekap-masuk",
    "description": "laporan.rekap-naskah.halaman-rekap-masuk",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Rekap Masuk - Read"
      }
    ]
  },
  {
    "name": "permission",
    "description": "permission",
    "permissions": [
      {
        "action": "read",
        "description": "permission read"
      },
      {
        "action": "create",
        "description": "permission create"
      },
      {
        "action": "update",
        "description": "permission update"
      },
      {
        "action": "delete",
        "description": "permission delete"
      },
      {
        "action": "export",
        "description": "permission export"
      }
    ]
  },
  {
    "name": "resource",
    "description": "resource",
    "permissions": [
      {
        "action": "read",
        "description": "resource read"
      },
      {
        "action": "create",
        "description": "resource create"
      },
      {
        "action": "update",
        "description": "resource update"
      },
      {
        "action": "delete",
        "description": "resource delete"
      },
      {
        "action": "export",
        "description": "resource export"
      }
    ]
  },
  {
    "name": "role",
    "description": "role",
    "permissions": [
      {
        "action": "read",
        "description": "role read"
      },
      {
        "action": "create",
        "description": "role create"
      },
      {
        "action": "update",
        "description": "role update"
      },
      {
        "action": "delete",
        "description": "role delete"
      },
      {
        "action": "export",
        "description": "role export"
      },
      {
        "action": "assign-permission",
        "description": "role assign-permission"
      }
    ]
  },
  {
    "name": "system-config",
    "description": "system-config",
    "permissions": [
      {
        "action": "read",
        "description": "system-config read"
      },
      {
        "action": "update",
        "description": "system-config update"
      }
    ]
  },
  {
    "name": "user-role",
    "description": "user-role",
    "permissions": [
      {
        "action": "read",
        "description": "user-role read"
      },
      {
        "action": "create",
        "description": "user-role create"
      },
      {
        "action": "update",
        "description": "user-role update"
      },
      {
        "action": "delete",
        "description": "user-role delete"
      },
      {
        "action": "export",
        "description": "user-role export"
      },
      {
        "action": "assign-role",
        "description": "user-role assign-role"
      }
    ]
  },
  {
    "name": "utama.beranda.dashboard.dashboard",
    "description": "utama.beranda.dashboard.dashboard",
    "permissions": [
      {
        "action": "read",
        "description": "Dashboard - Read"
      }
    ]
  },
  {
    "name": "utama.beranda.dashboard.export-data-dashboard",
    "description": "utama.beranda.dashboard.export-data-dashboard",
    "permissions": [
      {
        "action": "read",
        "description": "Export Data Dashboard - Read"
      }
    ]
  },
  {
    "name": "utama.beranda.dashboard.filter-dashboard",
    "description": "utama.beranda.dashboard.filter-dashboard",
    "permissions": [
      {
        "action": "read",
        "description": "Filter Dashboard - Read"
      }
    ]
  },
  {
    "name": "utama.beranda.dashboard.halaman-dashboard",
    "description": "utama.beranda.dashboard.halaman-dashboard",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Dashboard - Read"
      }
    ]
  },
  {
    "name": "utama.draft.detail-halaman-draft",
    "description": "utama.draft.detail-halaman-draft",
    "permissions": [
      {
        "action": "read",
        "description": "Detail Halaman Draft - Read"
      }
    ]
  },
  {
    "name": "utama.draft.detail-surat.button-edit",
    "description": "utama.draft.detail-surat.button-edit",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit - Update"
      }
    ]
  },
  {
    "name": "utama.draft.detail-surat.button-hapus",
    "description": "utama.draft.detail-surat.button-hapus",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Hapus - Delete"
      }
    ]
  },
  {
    "name": "utama.draft.detail-surat.button-kirim",
    "description": "utama.draft.detail-surat.button-kirim",
    "permissions": [
      {
        "action": "create",
        "description": "Button Kirim - Create"
      }
    ]
  },
  {
    "name": "utama.draft.detail-surat.halaman-detail-surat",
    "description": "utama.draft.detail-surat.halaman-detail-surat",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Detail Surat - Read"
      }
    ]
  },
  {
    "name": "utama.draft.halaman-draft",
    "description": "utama.draft.halaman-draft",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Draft - Read"
      }
    ]
  },
  {
    "name": "utama.draft.pencarian-filter",
    "description": "utama.draft.pencarian-filter",
    "permissions": [
      {
        "action": "read",
        "description": "Pencarian & Filter - Read"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.detail-surat-masuk",
    "description": "utama.kotak-masuk.detail-surat-masuk",
    "permissions": [
      {
        "action": "read",
        "description": "Detail Surat Masuk - Read"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.detail-surat.button-arsipkan",
    "description": "utama.kotak-masuk.detail-surat.button-arsipkan",
    "permissions": [
      {
        "action": "update",
        "description": "Button Arsipkan - Update"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.detail-surat.button-balas-surat",
    "description": "utama.kotak-masuk.detail-surat.button-balas-surat",
    "permissions": [
      {
        "action": "create",
        "description": "Button Balas Surat - Create"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.detail-surat.button-lanjut-disposisi",
    "description": "utama.kotak-masuk.detail-surat.button-lanjut-disposisi",
    "permissions": [
      {
        "action": "read",
        "description": "Button Lanjut Disposisi - Read"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.detail-surat.button-lanjut-nota-dinas",
    "description": "utama.kotak-masuk.detail-surat.button-lanjut-nota-dinas",
    "permissions": [
      {
        "action": "read",
        "description": "Button Lanjut Nota Dinas - Read"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.detail-surat.button-lanjut-surat-eksternal",
    "description": "utama.kotak-masuk.detail-surat.button-lanjut-surat-eksternal",
    "permissions": [
      {
        "action": "read",
        "description": "Button Lanjut Surat Eksternal - Read"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.detail-surat.button-lanjut-surat-internal",
    "description": "utama.kotak-masuk.detail-surat.button-lanjut-surat-internal",
    "permissions": [
      {
        "action": "read",
        "description": "Button Lanjut Surat Internal - Read"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.detail-surat.button-teruskan",
    "description": "utama.kotak-masuk.detail-surat.button-teruskan",
    "permissions": [
      {
        "action": "create",
        "description": "Button Teruskan - Create"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.detail-surat.halaman-detail-surat",
    "description": "utama.kotak-masuk.detail-surat.halaman-detail-surat",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Detail Surat - Read"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.detail-surat.unduh-lampiran",
    "description": "utama.kotak-masuk.detail-surat.unduh-lampiran",
    "permissions": [
      {
        "action": "read",
        "description": "Unduh Lampiran - Read"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.halaman-detail-surat-masuk",
    "description": "utama.kotak-masuk.halaman-detail-surat-masuk",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Detail Surat Masuk - Read"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.halaman-kotak-masuk",
    "description": "utama.kotak-masuk.halaman-kotak-masuk",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Kotak Masuk - Read"
      }
    ]
  },
  {
    "name": "utama.kotak-masuk.pencarian-filter",
    "description": "utama.kotak-masuk.pencarian-filter",
    "permissions": [
      {
        "action": "read",
        "description": "Pencarian & Filter - Read"
      }
    ]
  },
  {
    "name": "utama.terkirim.detail-surat-terkirim",
    "description": "utama.terkirim.detail-surat-terkirim",
    "permissions": [
      {
        "action": "read",
        "description": "Detail Surat Terkirim - Read"
      }
    ]
  },
  {
    "name": "utama.terkirim.detail-surat.button-kirim-email",
    "description": "utama.terkirim.detail-surat.button-kirim-email",
    "permissions": [
      {
        "action": "create",
        "description": "Button Kirim Email - Create"
      }
    ]
  },
  {
    "name": "utama.terkirim.detail-surat.button-tarik-surat-recall",
    "description": "utama.terkirim.detail-surat.button-tarik-surat-recall",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Tarik Surat (Recall) - Delete"
      }
    ]
  },
  {
    "name": "utama.terkirim.detail-surat.halaman-detail-surat",
    "description": "utama.terkirim.detail-surat.halaman-detail-surat",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Detail Surat - Read"
      }
    ]
  },
  {
    "name": "utama.terkirim.detail-surat.unduh-lampiran",
    "description": "utama.terkirim.detail-surat.unduh-lampiran",
    "permissions": [
      {
        "action": "read",
        "description": "Unduh Lampiran - Read"
      }
    ]
  },
  {
    "name": "utama.terkirim.halaman-detail-terkirim",
    "description": "utama.terkirim.halaman-detail-terkirim",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Detail Terkirim - Read"
      }
    ]
  },
  {
    "name": "utama.terkirim.halaman-terkirim",
    "description": "utama.terkirim.halaman-terkirim",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Terkirim - Read"
      }
    ]
  },
  {
    "name": "utama.terkirim.pencarian-filter",
    "description": "utama.terkirim.pencarian-filter",
    "permissions": [
      {
        "action": "read",
        "description": "Pencarian & Filter - Read"
      }
    ]
  },
  {
    "name": "utama.tertunda.detail-halaman-tertunda",
    "description": "utama.tertunda.detail-halaman-tertunda",
    "permissions": [
      {
        "action": "read",
        "description": "Detail Halaman Tertunda - Read"
      }
    ]
  },
  {
    "name": "utama.tertunda.detail-surat.button-batalkan",
    "description": "utama.tertunda.detail-surat.button-batalkan",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Batalkan - Delete"
      }
    ]
  },
  {
    "name": "utama.tertunda.detail-surat.button-edit",
    "description": "utama.tertunda.detail-surat.button-edit",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit - Update"
      }
    ]
  },
  {
    "name": "utama.tertunda.detail-surat.button-kirim-ulang",
    "description": "utama.tertunda.detail-surat.button-kirim-ulang",
    "permissions": [
      {
        "action": "create",
        "description": "Button Kirim Ulang - Create"
      }
    ]
  },
  {
    "name": "utama.tertunda.detail-surat.halaman-detail-surat",
    "description": "utama.tertunda.detail-surat.halaman-detail-surat",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Detail Surat - Read"
      }
    ]
  },
  {
    "name": "utama.tertunda.halaman-detail-tertunda",
    "description": "utama.tertunda.halaman-detail-tertunda",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Detail Tertunda - Read"
      }
    ]
  },
  {
    "name": "utama.tertunda.halaman-tertunda",
    "description": "utama.tertunda.halaman-tertunda",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Tertunda - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.disposisi.button-kirim",
    "description": "utama.tulis.disposisi.button-kirim",
    "permissions": [
      {
        "action": "create",
        "description": "Button Kirim - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.disposisi.button-pratinjau",
    "description": "utama.tulis.disposisi.button-pratinjau",
    "permissions": [
      {
        "action": "create",
        "description": "Button Pratinjau - Create"
      },
      {
        "action": "read",
        "description": "Button Pratinjau - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.disposisi.halaman-disposisi",
    "description": "utama.tulis.disposisi.halaman-disposisi",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Disposisi - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.kajian.button-kirim",
    "description": "utama.tulis.kajian.button-kirim",
    "permissions": [
      {
        "action": "create",
        "description": "Button Kirim - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.kajian.button-pilih-template",
    "description": "utama.tulis.kajian.button-pilih-template",
    "permissions": [
      {
        "action": "read",
        "description": "Button Pilih Template - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.kajian.button-pratinjau",
    "description": "utama.tulis.kajian.button-pratinjau",
    "permissions": [
      {
        "action": "read",
        "description": "Button Pratinjau - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.kajian.button-simpan-template-saya",
    "description": "utama.tulis.kajian.button-simpan-template-saya",
    "permissions": [
      {
        "action": "create",
        "description": "Button Simpan Template Saya - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.kajian.button-template-saya",
    "description": "utama.tulis.kajian.button-template-saya",
    "permissions": [
      {
        "action": "read",
        "description": "Button Template Saya - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.kajian.halaman-kajian",
    "description": "utama.tulis.kajian.halaman-kajian",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Kajian - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.naskah-lainnya.button-kirim",
    "description": "utama.tulis.naskah-lainnya.button-kirim",
    "permissions": [
      {
        "action": "create",
        "description": "Button Kirim - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.naskah-lainnya.button-pratinjau",
    "description": "utama.tulis.naskah-lainnya.button-pratinjau",
    "permissions": [
      {
        "action": "read",
        "description": "Button Pratinjau - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.naskah-lainnya.button-simpan-draft",
    "description": "utama.tulis.naskah-lainnya.button-simpan-draft",
    "permissions": [
      {
        "action": "create",
        "description": "Button Simpan Draft - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.naskah-lainnya.halaman-naskah-lainnya",
    "description": "utama.tulis.naskah-lainnya.halaman-naskah-lainnya",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Naskah Lainnya - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.nota-dinas.button-kirim",
    "description": "utama.tulis.nota-dinas.button-kirim",
    "permissions": [
      {
        "action": "create",
        "description": "Button Kirim - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.nota-dinas.button-pilih-template",
    "description": "utama.tulis.nota-dinas.button-pilih-template",
    "permissions": [
      {
        "action": "read",
        "description": "Button Pilih Template - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.nota-dinas.button-pratinjau",
    "description": "utama.tulis.nota-dinas.button-pratinjau",
    "permissions": [
      {
        "action": "create",
        "description": "Button Pratinjau - Create"
      },
      {
        "action": "read",
        "description": "Button Pratinjau - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.nota-dinas.button-simpan-template-saya",
    "description": "utama.tulis.nota-dinas.button-simpan-template-saya",
    "permissions": [
      {
        "action": "create",
        "description": "Button Simpan Template Saya - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.nota-dinas.button-template-saya",
    "description": "utama.tulis.nota-dinas.button-template-saya",
    "permissions": [
      {
        "action": "read",
        "description": "Button Template Saya - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.nota-dinas.halaman-nota-dinas",
    "description": "utama.tulis.nota-dinas.halaman-nota-dinas",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Nota Dinas - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.nota-dinas.upload-lampiran",
    "description": "utama.tulis.nota-dinas.upload-lampiran",
    "permissions": [
      {
        "action": "create",
        "description": "Upload Lampiran - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-eksternal.button-pilih-template",
    "description": "utama.tulis.surat-dinas-eksternal.button-pilih-template",
    "permissions": [
      {
        "action": "read",
        "description": "Button Pilih Template - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-eksternal.button-pratinjau",
    "description": "utama.tulis.surat-dinas-eksternal.button-pratinjau",
    "permissions": [
      {
        "action": "read",
        "description": "Button Pratinjau - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-eksternal.button-simpan-template-saya",
    "description": "utama.tulis.surat-dinas-eksternal.button-simpan-template-saya",
    "permissions": [
      {
        "action": "create",
        "description": "Button Simpan Template Saya - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-eksternal.button-template-saya",
    "description": "utama.tulis.surat-dinas-eksternal.button-template-saya",
    "permissions": [
      {
        "action": "read",
        "description": "Button Template Saya - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-eksternal.halaman-surat-dinas-eksternal",
    "description": "utama.tulis.surat-dinas-eksternal.halaman-surat-dinas-eksternal",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Surat Dinas Eksternal - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-internal.button-kirim",
    "description": "utama.tulis.surat-dinas-internal.button-kirim",
    "permissions": [
      {
        "action": "create",
        "description": "Button Kirim - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-internal.button-pilih-template",
    "description": "utama.tulis.surat-dinas-internal.button-pilih-template",
    "permissions": [
      {
        "action": "read",
        "description": "Button Pilih Template - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-internal.button-pratinjau",
    "description": "utama.tulis.surat-dinas-internal.button-pratinjau",
    "permissions": [
      {
        "action": "read",
        "description": "Button Pratinjau - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-internal.button-simpan-template-saya",
    "description": "utama.tulis.surat-dinas-internal.button-simpan-template-saya",
    "permissions": [
      {
        "action": "create",
        "description": "Button Simpan Template Saya - Create"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-internal.button-template-saya",
    "description": "utama.tulis.surat-dinas-internal.button-template-saya",
    "permissions": [
      {
        "action": "read",
        "description": "Button Template Saya - Read"
      }
    ]
  },
  {
    "name": "utama.tulis.surat-dinas-internal.halaman-surat-dinas-internal",
    "description": "utama.tulis.surat-dinas-internal.halaman-surat-dinas-internal",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Surat Dinas Internal - Read"
      }
    ]
  },
  {
    "name": "utilitas.layanan-email.halaman-layanan-email",
    "description": "utilitas.layanan-email.halaman-layanan-email",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Layanan Email - Read"
      }
    ]
  },
  {
    "name": "utilitas.layanan-email.kirim-email",
    "description": "utilitas.layanan-email.kirim-email",
    "permissions": [
      {
        "action": "create",
        "description": "Kirim Email - Create"
      }
    ]
  },
  {
    "name": "utilitas.layanan-email.kirim-email.halaman-kirim-email",
    "description": "utilitas.layanan-email.kirim-email.halaman-kirim-email",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Kirim Email - Read"
      }
    ]
  },
  {
    "name": "utilitas.layanan-email.log-email",
    "description": "utilitas.layanan-email.log-email",
    "permissions": [
      {
        "action": "read",
        "description": "Log Email - Read"
      }
    ]
  },
  {
    "name": "utilitas.layanan-email.log-email.halaman-log-email",
    "description": "utilitas.layanan-email.log-email.halaman-log-email",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Log Email - Read"
      }
    ]
  },
  {
    "name": "utilitas.penomoran.persetujuan.button-export",
    "description": "utilitas.penomoran.persetujuan.button-export",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export - Read (Export)"
      }
    ]
  },
  {
    "name": "utilitas.penomoran.persetujuan.halaman-persetujuan",
    "description": "utilitas.penomoran.persetujuan.halaman-persetujuan",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Persetujuan - Read"
      }
    ]
  },
  {
    "name": "utilitas.penomoran.usulan.button-export-usulan",
    "description": "utilitas.penomoran.usulan.button-export-usulan",
    "permissions": [
      {
        "action": "export",
        "description": "Button Export Usulan - Read (Export)"
      }
    ]
  },
  {
    "name": "utilitas.penomoran.usulan.button-tambah-usulan",
    "description": "utilitas.penomoran.usulan.button-tambah-usulan",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Usulan - Create"
      }
    ]
  },
  {
    "name": "utilitas.penomoran.usulan.halaman-usulan",
    "description": "utilitas.penomoran.usulan.halaman-usulan",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Usulan - Read"
      }
    ]
  },
  {
    "name": "utilitas.penyingkatan-tautan.button-action-delete",
    "description": "utilitas.penyingkatan-tautan.button-action-delete",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Action Delete - Delete"
      }
    ]
  },
  {
    "name": "utilitas.penyingkatan-tautan.button-action-edit",
    "description": "utilitas.penyingkatan-tautan.button-action-edit",
    "permissions": [
      {
        "action": "update",
        "description": "Button Action Edit - Update"
      }
    ]
  },
  {
    "name": "utilitas.penyingkatan-tautan.button-delete-tautan",
    "description": "utilitas.penyingkatan-tautan.button-delete-tautan",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Delete Tautan - Delete"
      }
    ]
  },
  {
    "name": "utilitas.penyingkatan-tautan.button-edit-tautan",
    "description": "utilitas.penyingkatan-tautan.button-edit-tautan",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Tautan - Update"
      }
    ]
  },
  {
    "name": "utilitas.penyingkatan-tautan.button-tambah-tautan",
    "description": "utilitas.penyingkatan-tautan.button-tambah-tautan",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Tautan - Create"
      }
    ]
  },
  {
    "name": "utilitas.penyingkatan-tautan.halaman-penyingkatan-tautan",
    "description": "utilitas.penyingkatan-tautan.halaman-penyingkatan-tautan",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Penyingkatan Tautan - Read"
      }
    ]
  },
  {
    "name": "utilitas.template.button-action-delete",
    "description": "utilitas.template.button-action-delete",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Action Delete - Delete"
      }
    ]
  },
  {
    "name": "utilitas.template.button-action-download",
    "description": "utilitas.template.button-action-download",
    "permissions": [
      {
        "action": "read",
        "description": "Button Action Download - Read"
      },
      {
        "action": "download",
        "description": "Button Action Download - Read (Download)"
      }
    ]
  },
  {
    "name": "utilitas.template.button-action-edit",
    "description": "utilitas.template.button-action-edit",
    "permissions": [
      {
        "action": "update",
        "description": "Button Action Edit - Update"
      }
    ]
  },
  {
    "name": "utilitas.template.button-delete-template",
    "description": "utilitas.template.button-delete-template",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Delete Template - Delete"
      }
    ]
  },
  {
    "name": "utilitas.template.button-download-template",
    "description": "utilitas.template.button-download-template",
    "permissions": [
      {
        "action": "download",
        "description": "Button Download Template - Read (Download)"
      }
    ]
  },
  {
    "name": "utilitas.template.button-edit-template",
    "description": "utilitas.template.button-edit-template",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Template - Update"
      }
    ]
  },
  {
    "name": "utilitas.template.button-tambah-template",
    "description": "utilitas.template.button-tambah-template",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Template - Create"
      }
    ]
  },
  {
    "name": "utilitas.template.halaman-template",
    "description": "utilitas.template.halaman-template",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Template - Read"
      }
    ]
  },
  {
    "name": "utilitas.titelatur-inggris.button-delete-titelatur-inggris",
    "description": "utilitas.titelatur-inggris.button-delete-titelatur-inggris",
    "permissions": [
      {
        "action": "delete",
        "description": "Button Delete Titelatur Inggris - Delete"
      }
    ]
  },
  {
    "name": "utilitas.titelatur-inggris.button-edit-titelatur-inggris",
    "description": "utilitas.titelatur-inggris.button-edit-titelatur-inggris",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Titelatur Inggris - Update"
      }
    ]
  },
  {
    "name": "utilitas.titelatur-inggris.button-tambah-titelatur-inggris",
    "description": "utilitas.titelatur-inggris.button-tambah-titelatur-inggris",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Titelatur Inggris - Create"
      }
    ]
  },
  {
    "name": "utilitas.titelatur-inggris.halaman-titelatur-inggris",
    "description": "utilitas.titelatur-inggris.halaman-titelatur-inggris",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Titelatur Inggris - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.cek-dokumen.halaman-cek-dokumen",
    "description": "utilitas.ttd-digital.cek-dokumen.halaman-cek-dokumen",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Cek Dokumen - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.log-disdig.button-aktifkan-alert-gangguan",
    "description": "utilitas.ttd-digital.log-disdig.button-aktifkan-alert-gangguan",
    "permissions": [
      {
        "action": "create",
        "description": "Button aktifkan alert gangguan - Create"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.log-disdig.button-allert",
    "description": "utilitas.ttd-digital.log-disdig.button-allert",
    "permissions": [
      {
        "action": "create",
        "description": "Button Allert - Create"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.log-disdig.halaman-log-disdig",
    "description": "utilitas.ttd-digital.log-disdig.halaman-log-disdig",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Log Disdig - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.penandatanganan.button-lihat-detail-dokumen",
    "description": "utilitas.ttd-digital.penandatanganan.button-lihat-detail-dokumen",
    "permissions": [
      {
        "action": "read",
        "description": "Button Lihat Detail Dokumen - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.penandatanganan.button-lihat-dokumen",
    "description": "utilitas.ttd-digital.penandatanganan.button-lihat-dokumen",
    "permissions": [
      {
        "action": "read",
        "description": "Button Lihat Dokumen - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.penandatanganan.button-lihat-file-dokumen",
    "description": "utilitas.ttd-digital.penandatanganan.button-lihat-file-dokumen",
    "permissions": [
      {
        "action": "read",
        "description": "Button Lihat File Dokumen - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.penandatanganan.button-show-detail-dokumen",
    "description": "utilitas.ttd-digital.penandatanganan.button-show-detail-dokumen",
    "permissions": [
      {
        "action": "read",
        "description": "Button Show Detail Dokumen - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.penandatanganan.button-tolak",
    "description": "utilitas.ttd-digital.penandatanganan.button-tolak",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tolak - Create"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.penandatanganan.button-ttd",
    "description": "utilitas.ttd-digital.penandatanganan.button-ttd",
    "permissions": [
      {
        "action": "create",
        "description": "Button TTD - Create"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.penandatanganan.button-ttd-digital",
    "description": "utilitas.ttd-digital.penandatanganan.button-ttd-digital",
    "permissions": [
      {
        "action": "create",
        "description": "Button TTD Digital - Create"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.penandatanganan.halaman-penandatanganan",
    "description": "utilitas.ttd-digital.penandatanganan.halaman-penandatanganan",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Penandatanganan - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.verifikasi-dokumen.button-edit-dokumen",
    "description": "utilitas.ttd-digital.verifikasi-dokumen.button-edit-dokumen",
    "permissions": [
      {
        "action": "update",
        "description": "Button Edit Dokumen - Update"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-detail-dokumen",
    "description": "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-detail-dokumen",
    "permissions": [
      {
        "action": "read",
        "description": "Button Lihat Detail Dokumen - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-dokumen",
    "description": "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-dokumen",
    "permissions": [
      {
        "action": "read",
        "description": "Button Lihat Dokumen - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-file-dokumen",
    "description": "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-file-dokumen",
    "permissions": [
      {
        "action": "read",
        "description": "Button Lihat File Dokumen - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.verifikasi-dokumen.button-show-detail-dokumen",
    "description": "utilitas.ttd-digital.verifikasi-dokumen.button-show-detail-dokumen",
    "permissions": [
      {
        "action": "read",
        "description": "Button Show Detail Dokumen - Read"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.verifikasi-dokumen.button-tambah-dokumen",
    "description": "utilitas.ttd-digital.verifikasi-dokumen.button-tambah-dokumen",
    "permissions": [
      {
        "action": "create",
        "description": "Button Tambah Dokumen - Create"
      }
    ]
  },
  {
    "name": "utilitas.ttd-digital.verifikasi-dokumen.halaman-verifikasi-dokumen",
    "description": "utilitas.ttd-digital.verifikasi-dokumen.halaman-verifikasi-dokumen",
    "permissions": [
      {
        "action": "read",
        "description": "Halaman Verifikasi Dokumen - Read"
      }
    ]
  }
] as const;

export const rbacMatrixTree: MatrixHalaman[] = [
  {
    "key": "administrasi",
    "label": "Administrasi",
    "menus": [
      {
        "key": "data-master",
        "label": "Data Master",
        "subMenus": [
          {
            "key": "jenis",
            "label": "Jenis",
            "fiturs": [
              {
                "key": "button-delete-jenis",
                "label": "Button Delete Jenis",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "administrasi.data-master.jenis.button-delete-jenis"
                  }
                ]
              },
              {
                "key": "button-detail-jenis",
                "label": "Button Detail Jenis",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.data-master.jenis.button-detail-jenis"
                  }
                ]
              },
              {
                "key": "button-edit-jenis",
                "label": "Button Edit Jenis",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "administrasi.data-master.jenis.button-edit-jenis"
                  }
                ]
              },
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.data-master.jenis.button-export"
                  }
                ]
              },
              {
                "key": "button-tambah-jenis",
                "label": "Button Tambah Jenis",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.data-master.jenis.button-tambah-jenis"
                  }
                ]
              },
              {
                "key": "halaman-jenis",
                "label": "Halaman Jenis",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.data-master.jenis.halaman-jenis"
                  }
                ]
              }
            ]
          },
          {
            "key": "klasifikasi",
            "label": "Klasifikasi",
            "fiturs": [
              {
                "key": "button-action-delete",
                "label": "Button Action Delete",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "administrasi.data-master.klasifikasi.button-action-delete"
                  }
                ]
              },
              {
                "key": "button-action-edit",
                "label": "Button Action Edit",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "administrasi.data-master.klasifikasi.button-action-edit"
                  }
                ]
              },
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.data-master.klasifikasi.button-export"
                  }
                ]
              },
              {
                "key": "button-tambah",
                "label": "Button Tambah",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.data-master.klasifikasi.button-tambah"
                  }
                ]
              },
              {
                "key": "button-tambah-klasifikasi",
                "label": "Button Tambah Klasifikasi",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.data-master.klasifikasi.button-tambah-klasifikasi"
                  }
                ]
              },
              {
                "key": "halaman-klasifikasi",
                "label": "Halaman Klasifikasi",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.data-master.klasifikasi.halaman-klasifikasi"
                  }
                ]
              }
            ]
          },
          {
            "key": "perusahaan",
            "label": "Perusahaan",
            "fiturs": [
              {
                "key": "button-action-area",
                "label": "Button Action Area",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.data-master.perusahaan.button-action-area"
                  }
                ]
              },
              {
                "key": "button-action-delete-perusahaan",
                "label": "Button Action Delete Perusahaan",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "administrasi.data-master.perusahaan.button-action-delete-perusahaan"
                  }
                ]
              },
              {
                "key": "button-action-edit-perusahaan",
                "label": "Button Action Edit Perusahaan",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "administrasi.data-master.perusahaan.button-action-edit-perusahaan"
                  }
                ]
              },
              {
                "key": "button-tambah-perusahaan",
                "label": "Button Tambah Perusahaan",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.data-master.perusahaan.button-tambah-perusahaan"
                  }
                ]
              },
              {
                "key": "halaman-perusahaan",
                "label": "Halaman Perusahaan",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.data-master.perusahaan.halaman-perusahaan"
                  }
                ]
              }
            ]
          },
          {
            "key": "tertuju",
            "label": "Tertuju",
            "fiturs": [
              {
                "key": "button-edit-tertuju-eksternal",
                "label": "Button Edit Tertuju Eksternal",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "administrasi.data-master.tertuju.button-edit-tertuju-eksternal"
                  }
                ]
              },
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.data-master.tertuju.button-export"
                  }
                ]
              },
              {
                "key": "button-hapus-data",
                "label": "Button Hapus Data",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "administrasi.data-master.tertuju.button-hapus-data"
                  }
                ]
              },
              {
                "key": "button-tambah-tertuju-eksternal",
                "label": "Button Tambah Tertuju Eksternal",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.data-master.tertuju.button-tambah-tertuju-eksternal"
                  }
                ]
              },
              {
                "key": "halaman-tertuju",
                "label": "Halaman Tertuju",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.data-master.tertuju.halaman-tertuju"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "delegasi",
        "label": "Delegasi",
        "subMenus": [
          {
            "key": "",
            "label": "Delegasi",
            "fiturs": [
              {
                "key": "button-delete-delegasi",
                "label": "Button Delete Delegasi",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "administrasi.delegasi.button-delete-delegasi"
                  }
                ]
              },
              {
                "key": "button-edit-delegasi",
                "label": "Button Edit Delegasi",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "administrasi.delegasi.button-edit-delegasi"
                  }
                ]
              },
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.delegasi.button-export"
                  }
                ]
              },
              {
                "key": "button-tambah-delegasi",
                "label": "Button Tambah Delegasi",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.delegasi.button-tambah-delegasi"
                  }
                ]
              },
              {
                "key": "halaman-delegasi",
                "label": "Halaman Delegasi",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.delegasi.halaman-delegasi"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "manajemen-rbac",
        "label": "Manajemen RBAC",
        "subMenus": [
          {
            "key": "",
            "label": "Manajemen RBAC",
            "fiturs": [
              {
                "key": "konfigurasi-sistem",
                "label": "Konfigurasi Sistem",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.manajemen-rbac.konfigurasi-sistem"
                  }
                ]
              }
            ]
          },
          {
            "key": "permission",
            "label": "Permission",
            "fiturs": [
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.manajemen-rbac.permission.button-export"
                  }
                ]
              },
              {
                "key": "halaman-permission",
                "label": "Halaman Permission",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.manajemen-rbac.permission.halaman-permission"
                  }
                ]
              }
            ]
          },
          {
            "key": "resource",
            "label": "Resource",
            "fiturs": [
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.manajemen-rbac.resource.button-export"
                  }
                ]
              },
              {
                "key": "halaman-resource",
                "label": "Halaman Resource",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.manajemen-rbac.resource.halaman-resource"
                  }
                ]
              }
            ]
          },
          {
            "key": "role",
            "label": "Role",
            "fiturs": [
              {
                "key": "button-detail-role",
                "label": "Button Detail Role",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.manajemen-rbac.role.button-detail-role"
                  }
                ]
              },
              {
                "key": "button-edit-role",
                "label": "Button Edit Role",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "administrasi.manajemen-rbac.role.button-edit-role"
                  }
                ]
              },
              {
                "key": "halaman-role",
                "label": "Halaman Role",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.manajemen-rbac.role.halaman-role"
                  }
                ]
              }
            ]
          },
          {
            "key": "user-role",
            "label": "User Role",
            "fiturs": [
              {
                "key": "button-detail-role",
                "label": "Button Detail Role",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.manajemen-rbac.user-role.button-detail-role"
                  }
                ]
              },
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.manajemen-rbac.user-role.button-export"
                  }
                ]
              },
              {
                "key": "button-tambah-role",
                "label": "Button Tambah Role",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.manajemen-rbac.user-role.button-tambah-role"
                  }
                ]
              },
              {
                "key": "halaman-user-role",
                "label": "Halaman User Role",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.manajemen-rbac.user-role.halaman-user-role"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "naskah-masuk",
        "label": "Naskah Masuk",
        "subMenus": [
          {
            "key": "naskah-masuk",
            "label": "Naskah Masuk",
            "fiturs": [
              {
                "key": "button-action-edit-naskah",
                "label": "Button Action Edit Naskah",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "administrasi.naskah-masuk.button-action-edit-naskah"
                  }
                ]
              },
              {
                "key": "button-action-show-detail-naskah",
                "label": "Button Action Show Detail Naskah",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.naskah-masuk.button-action-show-detail-naskah"
                  }
                ]
              },
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.naskah-masuk.button-export"
                  }
                ]
              },
              {
                "key": "button-tambah-naskah-masuk",
                "label": "Button Tambah Naskah Masuk",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.naskah-masuk.button-tambah-naskah-masuk"
                  }
                ]
              },
              {
                "key": "halaman-verifikasi-naskah",
                "label": "Halaman Naskah Masuk",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.naskah-masuk.halaman-verifikasi-naskah"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "penomoran",
        "label": "Penomoran",
        "subMenus": [
          {
            "key": "penomoran",
            "label": "Penomoran",
            "fiturs": [
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.penomoran.penomoran.button-export"
                  }
                ]
              },
              {
                "key": "button-tambah-penomoran",
                "label": "Button Tambah Penomoran",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.penomoran.penomoran.button-tambah-penomoran"
                  }
                ]
              },
              {
                "key": "halaman-penomoran",
                "label": "Halaman Penomoran",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.penomoran.penomoran.halaman-penomoran"
                  }
                ]
              }
            ]
          },
          {
            "key": "persetujuan",
            "label": "Persetujuan",
            "fiturs": [
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.penomoran.persetujuan.button-export"
                  }
                ]
              },
              {
                "key": "halaman-persetujuan",
                "label": "Halaman Persetujuan",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.penomoran.persetujuan.halaman-persetujuan"
                  }
                ]
              }
            ]
          },
          {
            "key": "usulan",
            "label": "Usulan",
            "fiturs": [
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.penomoran.usulan.button-export"
                  }
                ]
              },
              {
                "key": "button-export-usulan",
                "label": "Button Export Usulan",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.penomoran.usulan.button-export-usulan"
                  }
                ]
              },
              {
                "key": "button-tambah-usulan",
                "label": "Button Tambah Usulan",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.penomoran.usulan.button-tambah-usulan"
                  }
                ]
              },
              {
                "key": "halaman-usulan",
                "label": "Halaman Usulan",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.penomoran.usulan.halaman-usulan"
                  }
                ]
              }
            ]
          },
          {
            "key": "verifikasi",
            "label": "Verifikasi",
            "fiturs": [
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "administrasi.penomoran.verifikasi.button-export"
                  }
                ]
              },
              {
                "key": "halaman-verifikasi",
                "label": "Halaman Verifikasi",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.penomoran.verifikasi.halaman-verifikasi"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "titelatur-inggris",
        "label": "Titelatur Inggris",
        "subMenus": [
          {
            "key": "",
            "label": "Titelatur Inggris",
            "fiturs": [
              {
                "key": "button-delete-titelatur",
                "label": "Button Delete Titelatur",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "administrasi.titelatur-inggris.button-delete-titelatur"
                  }
                ]
              },
              {
                "key": "button-delete-titelatur-inggris",
                "label": "Button Delete Titelatur Inggris",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "administrasi.titelatur-inggris.button-delete-titelatur-inggris"
                  }
                ]
              },
              {
                "key": "button-edit-titelatur",
                "label": "Button Edit Titelatur",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "administrasi.titelatur-inggris.button-edit-titelatur"
                  }
                ]
              },
              {
                "key": "button-edit-titelatur-inggris",
                "label": "Button Edit Titelatur Inggris",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "administrasi.titelatur-inggris.button-edit-titelatur-inggris"
                  }
                ]
              },
              {
                "key": "button-tambah-titelatur",
                "label": "Button Tambah Titelatur",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.titelatur-inggris.button-tambah-titelatur"
                  }
                ]
              },
              {
                "key": "button-tambah-titelatur-inggris",
                "label": "Button Tambah Titelatur Inggris",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "administrasi.titelatur-inggris.button-tambah-titelatur-inggris"
                  }
                ]
              },
              {
                "key": "halaman-titelatur-inggris",
                "label": "Halaman Titelatur Inggris",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "administrasi.titelatur-inggris.halaman-titelatur-inggris"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "key": "faq",
    "label": "FAQ",
    "menus": [
      {
        "key": "faq",
        "label": "FAQ",
        "subMenus": [
          {
            "key": "",
            "label": "FAQ",
            "fiturs": [
              {
                "key": "halaman-faq",
                "label": "Halaman FAQ",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "faq.faq.halaman-faq"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "manajemen-faq",
        "label": "Manajemen FAQ",
        "subMenus": [
          {
            "key": "",
            "label": "Manajemen FAQ",
            "fiturs": [
              {
                "key": "button-delete-faq",
                "label": "Button Delete FAQ",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "faq.manajemen-faq.button-delete-faq"
                  }
                ]
              },
              {
                "key": "button-edit-faq",
                "label": "Button Edit FAQ",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "faq.manajemen-faq.button-edit-faq"
                  }
                ]
              },
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "faq.manajemen-faq.button-export"
                  }
                ]
              },
              {
                "key": "button-tambah-faq",
                "label": "Button Tambah FAQ",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "faq.manajemen-faq.button-tambah-faq"
                  }
                ]
              },
              {
                "key": "halaman-manajemen-faq",
                "label": "Halaman Manajemen FAQ",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "faq.manajemen-faq.halaman-manajemen-faq"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "manajemen-pedoman",
        "label": "Manajemen Pedoman",
        "subMenus": [
          {
            "key": "",
            "label": "Manajemen Pedoman",
            "fiturs": [
              {
                "key": "button-delete-pedoman",
                "label": "Button Delete Pedoman",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "faq.manajemen-pedoman.button-delete-pedoman"
                  }
                ]
              },
              {
                "key": "button-edit-pedoman",
                "label": "Button Edit Pedoman",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "faq.manajemen-pedoman.button-edit-pedoman"
                  }
                ]
              },
              {
                "key": "button-tambah-pedoman",
                "label": "Button Tambah Pedoman",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "faq.manajemen-pedoman.button-tambah-pedoman"
                  }
                ]
              },
              {
                "key": "halaman-manajemen-pedoman",
                "label": "Halaman Manajemen Pedoman",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "faq.manajemen-pedoman.halaman-manajemen-pedoman"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "pedoman",
        "label": "Pedoman",
        "subMenus": [
          {
            "key": "",
            "label": "Pedoman",
            "fiturs": [
              {
                "key": "halaman-pedoman",
                "label": "Halaman Pedoman",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "faq.pedoman.halaman-pedoman"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "key": "laporan",
    "label": "Laporan",
    "menus": [
      {
        "key": "detail-naskah",
        "label": "Detail Naskah",
        "subMenus": [
          {
            "key": "",
            "label": "Detail Naskah",
            "fiturs": [
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "laporan.detail-naskah.button-export"
                  }
                ]
              },
              {
                "key": "halaman-detail-naskah",
                "label": "Halaman Detail Naskah",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "laporan.detail-naskah.halaman-detail-naskah"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "laporan-sla",
        "label": "Laporan SLA",
        "subMenus": [
          {
            "key": "",
            "label": "Laporan SLA",
            "fiturs": [
              {
                "key": "button-cetak-laporan-pdf",
                "label": "Button Cetak Laporan (PDF)",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "laporan.laporan-sla.button-cetak-laporan-pdf"
                  }
                ]
              },
              {
                "key": "button-export-excel",
                "label": "Button Export Excel",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "laporan.laporan-sla.button-export-excel"
                  }
                ]
              },
              {
                "key": "halaman-laporan-sla",
                "label": "Halaman Laporan SLA",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "laporan.laporan-sla.halaman-laporan-sla"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "laporan-surat",
        "label": "Laporan Surat",
        "subMenus": [
          {
            "key": "",
            "label": "Laporan Surat",
            "fiturs": [
              {
                "key": "button-cetak-laporan-pdf",
                "label": "Button Cetak Laporan (PDF)",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "laporan.laporan-surat.button-cetak-laporan-pdf"
                  }
                ]
              },
              {
                "key": "button-export-excel",
                "label": "Button Export Excel",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "laporan.laporan-surat.button-export-excel"
                  }
                ]
              },
              {
                "key": "halaman-laporan-surat",
                "label": "Halaman Laporan Surat",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "laporan.laporan-surat.halaman-laporan-surat"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "naskah-masuk",
        "label": "Naskah Masuk",
        "subMenus": [
          {
            "key": "",
            "label": "Naskah Masuk",
            "fiturs": [
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "laporan.naskah-masuk.button-export"
                  }
                ]
              },
              {
                "key": "halaman-naskah-masuk",
                "label": "Halaman Naskah Masuk",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "laporan.naskah-masuk.halaman-naskah-masuk"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "rekap-naskah",
        "label": "Rekap Naskah",
        "subMenus": [
          {
            "key": "",
            "label": "Rekap Naskah",
            "fiturs": [
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "laporan.rekap-naskah.button-export"
                  }
                ]
              },
              {
                "key": "halaman-rekap-masuk",
                "label": "Halaman Rekap Masuk",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "laporan.rekap-naskah.halaman-rekap-masuk"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "key": "utama",
    "label": "Utama",
    "menus": [
      {
        "key": "beranda",
        "label": "Beranda",
        "subMenus": [
          {
            "key": "dashboard",
            "label": "Dashboard",
            "fiturs": [
              {
                "key": "dashboard",
                "label": "Dashboard",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.beranda.dashboard.dashboard"
                  }
                ]
              },
              {
                "key": "export-data-dashboard",
                "label": "Export Data Dashboard",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.beranda.dashboard.export-data-dashboard"
                  }
                ]
              },
              {
                "key": "filter-dashboard",
                "label": "Filter Dashboard",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.beranda.dashboard.filter-dashboard"
                  }
                ]
              },
              {
                "key": "halaman-dashboard",
                "label": "Halaman Dashboard",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.beranda.dashboard.halaman-dashboard"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "draft",
        "label": "Draft",
        "subMenus": [
          {
            "key": "detail-surat",
            "label": "Detail Surat",
            "fiturs": [
              {
                "key": "button-edit",
                "label": "Button Edit",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "utama.draft.detail-surat.button-edit"
                  }
                ]
              },
              {
                "key": "button-hapus",
                "label": "Button Hapus",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "utama.draft.detail-surat.button-hapus"
                  }
                ]
              },
              {
                "key": "button-kirim",
                "label": "Button Kirim",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.draft.detail-surat.button-kirim"
                  }
                ]
              },
              {
                "key": "halaman-detail-surat",
                "label": "Halaman Detail Surat",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.draft.detail-surat.halaman-detail-surat"
                  }
                ]
              }
            ]
          },
          {
            "key": "",
            "label": "Draft",
            "fiturs": [
              {
                "key": "detail-halaman-draft",
                "label": "Detail Halaman Draft",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.draft.detail-halaman-draft"
                  }
                ]
              },
              {
                "key": "halaman-draft",
                "label": "Halaman Draft",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.draft.halaman-draft"
                  }
                ]
              },
              {
                "key": "pencarian-filter",
                "label": "Pencarian & Filter",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.draft.pencarian-filter"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "kotak-masuk",
        "label": "Kotak Masuk",
        "subMenus": [
          {
            "key": "detail-surat",
            "label": "Detail Surat",
            "fiturs": [
              {
                "key": "button-arsipkan",
                "label": "Button Arsipkan",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "utama.kotak-masuk.detail-surat.button-arsipkan"
                  }
                ]
              },
              {
                "key": "button-balas-surat",
                "label": "Button Balas Surat",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.kotak-masuk.detail-surat.button-balas-surat"
                  }
                ]
              },
              {
                "key": "button-lanjut-disposisi",
                "label": "Button Lanjut Disposisi",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.kotak-masuk.detail-surat.button-lanjut-disposisi"
                  }
                ]
              },
              {
                "key": "button-lanjut-nota-dinas",
                "label": "Button Lanjut Nota Dinas",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.kotak-masuk.detail-surat.button-lanjut-nota-dinas"
                  }
                ]
              },
              {
                "key": "button-lanjut-surat-eksternal",
                "label": "Button Lanjut Surat Eksternal",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.kotak-masuk.detail-surat.button-lanjut-surat-eksternal"
                  }
                ]
              },
              {
                "key": "button-lanjut-surat-internal",
                "label": "Button Lanjut Surat Internal",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.kotak-masuk.detail-surat.button-lanjut-surat-internal"
                  }
                ]
              },
              {
                "key": "button-teruskan",
                "label": "Button Teruskan",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.kotak-masuk.detail-surat.button-teruskan"
                  }
                ]
              },
              {
                "key": "halaman-detail-surat",
                "label": "Halaman Detail Surat",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.kotak-masuk.detail-surat.halaman-detail-surat"
                  }
                ]
              },
              {
                "key": "unduh-lampiran",
                "label": "Unduh Lampiran",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.kotak-masuk.detail-surat.unduh-lampiran"
                  }
                ]
              }
            ]
          },
          {
            "key": "",
            "label": "Kotak Masuk",
            "fiturs": [
              {
                "key": "detail-surat-masuk",
                "label": "Detail Surat Masuk",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.kotak-masuk.detail-surat-masuk"
                  }
                ]
              },
              {
                "key": "halaman-detail-surat-masuk",
                "label": "Halaman Detail Surat Masuk",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.kotak-masuk.halaman-detail-surat-masuk"
                  }
                ]
              },
              {
                "key": "halaman-kotak-masuk",
                "label": "Halaman Kotak Masuk",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.kotak-masuk.halaman-kotak-masuk"
                  }
                ]
              },
              {
                "key": "pencarian-filter",
                "label": "Pencarian & Filter",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.kotak-masuk.pencarian-filter"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "terkirim",
        "label": "Terkirim",
        "subMenus": [
          {
            "key": "detail-surat",
            "label": "Detail Surat",
            "fiturs": [
              {
                "key": "button-kirim-email",
                "label": "Button Kirim Email",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.terkirim.detail-surat.button-kirim-email"
                  }
                ]
              },
              {
                "key": "button-tarik-surat-recall",
                "label": "Button Tarik Surat (Recall)",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "utama.terkirim.detail-surat.button-tarik-surat-recall"
                  }
                ]
              },
              {
                "key": "halaman-detail-surat",
                "label": "Halaman Detail Surat",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.terkirim.detail-surat.halaman-detail-surat"
                  }
                ]
              },
              {
                "key": "unduh-lampiran",
                "label": "Unduh Lampiran",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.terkirim.detail-surat.unduh-lampiran"
                  }
                ]
              }
            ]
          },
          {
            "key": "",
            "label": "Terkirim",
            "fiturs": [
              {
                "key": "detail-surat-terkirim",
                "label": "Detail Surat Terkirim",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.terkirim.detail-surat-terkirim"
                  }
                ]
              },
              {
                "key": "halaman-detail-terkirim",
                "label": "Halaman Detail Terkirim",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.terkirim.halaman-detail-terkirim"
                  }
                ]
              },
              {
                "key": "halaman-terkirim",
                "label": "Halaman Terkirim",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.terkirim.halaman-terkirim"
                  }
                ]
              },
              {
                "key": "pencarian-filter",
                "label": "Pencarian & Filter",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.terkirim.pencarian-filter"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "tertunda",
        "label": "Tertunda",
        "subMenus": [
          {
            "key": "detail-surat",
            "label": "Detail Surat",
            "fiturs": [
              {
                "key": "button-batalkan",
                "label": "Button Batalkan",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "utama.tertunda.detail-surat.button-batalkan"
                  }
                ]
              },
              {
                "key": "button-edit",
                "label": "Button Edit",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "utama.tertunda.detail-surat.button-edit"
                  }
                ]
              },
              {
                "key": "button-kirim-ulang",
                "label": "Button Kirim Ulang",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tertunda.detail-surat.button-kirim-ulang"
                  }
                ]
              },
              {
                "key": "halaman-detail-surat",
                "label": "Halaman Detail Surat",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tertunda.detail-surat.halaman-detail-surat"
                  }
                ]
              }
            ]
          },
          {
            "key": "",
            "label": "Tertunda",
            "fiturs": [
              {
                "key": "detail-halaman-tertunda",
                "label": "Detail Halaman Tertunda",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tertunda.detail-halaman-tertunda"
                  }
                ]
              },
              {
                "key": "halaman-detail-tertunda",
                "label": "Halaman Detail Tertunda",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tertunda.halaman-detail-tertunda"
                  }
                ]
              },
              {
                "key": "halaman-tertunda",
                "label": "Halaman Tertunda",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tertunda.halaman-tertunda"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "tulis",
        "label": "Tulis",
        "subMenus": [
          {
            "key": "disposisi",
            "label": "Disposisi",
            "fiturs": [
              {
                "key": "button-kirim",
                "label": "Button Kirim",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.disposisi.button-kirim"
                  }
                ]
              },
              {
                "key": "button-pratinjau",
                "label": "Button Pratinjau",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.disposisi.button-pratinjau"
                  },
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.disposisi.button-pratinjau"
                  }
                ]
              },
              {
                "key": "halaman-disposisi",
                "label": "Halaman Disposisi",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.disposisi.halaman-disposisi"
                  }
                ]
              }
            ]
          },
          {
            "key": "kajian",
            "label": "Kajian",
            "fiturs": [
              {
                "key": "button-kirim",
                "label": "Button Kirim",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.kajian.button-kirim"
                  }
                ]
              },
              {
                "key": "button-pilih-template",
                "label": "Button Pilih Template",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.kajian.button-pilih-template"
                  }
                ]
              },
              {
                "key": "button-pratinjau",
                "label": "Button Pratinjau",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.kajian.button-pratinjau"
                  }
                ]
              },
              {
                "key": "button-simpan-template-saya",
                "label": "Button Simpan Template Saya",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.kajian.button-simpan-template-saya"
                  }
                ]
              },
              {
                "key": "button-template-saya",
                "label": "Button Template Saya",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.kajian.button-template-saya"
                  }
                ]
              },
              {
                "key": "halaman-kajian",
                "label": "Halaman Kajian",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.kajian.halaman-kajian"
                  }
                ]
              }
            ]
          },
          {
            "key": "naskah-lainnya",
            "label": "Naskah Lainnya",
            "fiturs": [
              {
                "key": "button-kirim",
                "label": "Button Kirim",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.naskah-lainnya.button-kirim"
                  }
                ]
              },
              {
                "key": "button-pratinjau",
                "label": "Button Pratinjau",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.naskah-lainnya.button-pratinjau"
                  }
                ]
              },
              {
                "key": "button-simpan-draft",
                "label": "Button Simpan Draft",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.naskah-lainnya.button-simpan-draft"
                  }
                ]
              },
              {
                "key": "halaman-naskah-lainnya",
                "label": "Halaman Naskah Lainnya",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.naskah-lainnya.halaman-naskah-lainnya"
                  }
                ]
              }
            ]
          },
          {
            "key": "nota-dinas",
            "label": "Nota Dinas",
            "fiturs": [
              {
                "key": "button-kirim",
                "label": "Button Kirim",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.nota-dinas.button-kirim"
                  }
                ]
              },
              {
                "key": "button-pilih-template",
                "label": "Button Pilih Template",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.nota-dinas.button-pilih-template"
                  }
                ]
              },
              {
                "key": "button-pratinjau",
                "label": "Button Pratinjau",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.nota-dinas.button-pratinjau"
                  },
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.nota-dinas.button-pratinjau"
                  }
                ]
              },
              {
                "key": "button-simpan-template-saya",
                "label": "Button Simpan Template Saya",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.nota-dinas.button-simpan-template-saya"
                  }
                ]
              },
              {
                "key": "button-template-saya",
                "label": "Button Template Saya",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.nota-dinas.button-template-saya"
                  }
                ]
              },
              {
                "key": "halaman-nota-dinas",
                "label": "Halaman Nota Dinas",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.nota-dinas.halaman-nota-dinas"
                  }
                ]
              },
              {
                "key": "upload-lampiran",
                "label": "Upload Lampiran",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.nota-dinas.upload-lampiran"
                  }
                ]
              }
            ]
          },
          {
            "key": "surat-dinas-eksternal",
            "label": "Surat Dinas Eksternal",
            "fiturs": [
              {
                "key": "button-pilih-template",
                "label": "Button Pilih Template",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.surat-dinas-eksternal.button-pilih-template"
                  }
                ]
              },
              {
                "key": "button-pratinjau",
                "label": "Button Pratinjau",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.surat-dinas-eksternal.button-pratinjau"
                  }
                ]
              },
              {
                "key": "button-simpan-template-saya",
                "label": "Button Simpan Template Saya",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.surat-dinas-eksternal.button-simpan-template-saya"
                  }
                ]
              },
              {
                "key": "button-template-saya",
                "label": "Button Template Saya",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.surat-dinas-eksternal.button-template-saya"
                  }
                ]
              },
              {
                "key": "halaman-surat-dinas-eksternal",
                "label": "Halaman Surat Dinas Eksternal",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.surat-dinas-eksternal.halaman-surat-dinas-eksternal"
                  }
                ]
              }
            ]
          },
          {
            "key": "surat-dinas-internal",
            "label": "Surat Dinas Internal",
            "fiturs": [
              {
                "key": "button-kirim",
                "label": "Button Kirim",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.surat-dinas-internal.button-kirim"
                  }
                ]
              },
              {
                "key": "button-pilih-template",
                "label": "Button Pilih Template",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.surat-dinas-internal.button-pilih-template"
                  }
                ]
              },
              {
                "key": "button-pratinjau",
                "label": "Button Pratinjau",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.surat-dinas-internal.button-pratinjau"
                  }
                ]
              },
              {
                "key": "button-simpan-template-saya",
                "label": "Button Simpan Template Saya",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utama.tulis.surat-dinas-internal.button-simpan-template-saya"
                  }
                ]
              },
              {
                "key": "button-template-saya",
                "label": "Button Template Saya",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.surat-dinas-internal.button-template-saya"
                  }
                ]
              },
              {
                "key": "halaman-surat-dinas-internal",
                "label": "Halaman Surat Dinas Internal",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utama.tulis.surat-dinas-internal.halaman-surat-dinas-internal"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "key": "utilitas",
    "label": "Utilitas",
    "menus": [
      {
        "key": "layanan-email",
        "label": "Layanan Email",
        "subMenus": [
          {
            "key": "kirim-email",
            "label": "Kirim Email",
            "fiturs": [
              {
                "key": "halaman-kirim-email",
                "label": "Halaman Kirim Email",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.layanan-email.kirim-email.halaman-kirim-email"
                  }
                ]
              }
            ]
          },
          {
            "key": "",
            "label": "Layanan Email",
            "fiturs": [
              {
                "key": "halaman-layanan-email",
                "label": "Halaman Layanan Email",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.layanan-email.halaman-layanan-email"
                  }
                ]
              },
              {
                "key": "kirim-email",
                "label": "Kirim Email",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.layanan-email.kirim-email"
                  }
                ]
              },
              {
                "key": "log-email",
                "label": "Log Email",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.layanan-email.log-email"
                  }
                ]
              }
            ]
          },
          {
            "key": "log-email",
            "label": "Log Email",
            "fiturs": [
              {
                "key": "halaman-log-email",
                "label": "Halaman Log Email",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.layanan-email.log-email.halaman-log-email"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "penomoran",
        "label": "Penomoran",
        "subMenus": [
          {
            "key": "persetujuan",
            "label": "Persetujuan",
            "fiturs": [
              {
                "key": "button-export",
                "label": "Button Export",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "utilitas.penomoran.persetujuan.button-export"
                  }
                ]
              },
              {
                "key": "halaman-persetujuan",
                "label": "Halaman Persetujuan",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.penomoran.persetujuan.halaman-persetujuan"
                  }
                ]
              }
            ]
          },
          {
            "key": "usulan",
            "label": "Usulan",
            "fiturs": [
              {
                "key": "button-export-usulan",
                "label": "Button Export Usulan",
                "permissions": [
                  {
                    "action": "export",
                    "label": "Read (Export)",
                    "resource": "utilitas.penomoran.usulan.button-export-usulan"
                  }
                ]
              },
              {
                "key": "button-tambah-usulan",
                "label": "Button Tambah Usulan",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.penomoran.usulan.button-tambah-usulan"
                  }
                ]
              },
              {
                "key": "halaman-usulan",
                "label": "Halaman Usulan",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.penomoran.usulan.halaman-usulan"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "penyingkatan-tautan",
        "label": "Penyingkatan Tautan",
        "subMenus": [
          {
            "key": "",
            "label": "Penyingkatan Tautan",
            "fiturs": [
              {
                "key": "button-action-delete",
                "label": "Button Action Delete",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "utilitas.penyingkatan-tautan.button-action-delete"
                  }
                ]
              },
              {
                "key": "button-action-edit",
                "label": "Button Action Edit",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "utilitas.penyingkatan-tautan.button-action-edit"
                  }
                ]
              },
              {
                "key": "button-delete-tautan",
                "label": "Button Delete Tautan",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "utilitas.penyingkatan-tautan.button-delete-tautan"
                  }
                ]
              },
              {
                "key": "button-edit-tautan",
                "label": "Button Edit Tautan",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "utilitas.penyingkatan-tautan.button-edit-tautan"
                  }
                ]
              },
              {
                "key": "button-tambah-tautan",
                "label": "Button Tambah Tautan",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.penyingkatan-tautan.button-tambah-tautan"
                  }
                ]
              },
              {
                "key": "halaman-penyingkatan-tautan",
                "label": "Halaman Penyingkatan Tautan",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.penyingkatan-tautan.halaman-penyingkatan-tautan"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "template",
        "label": "Template",
        "subMenus": [
          {
            "key": "",
            "label": "Template",
            "fiturs": [
              {
                "key": "button-action-delete",
                "label": "Button Action Delete",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "utilitas.template.button-action-delete"
                  }
                ]
              },
              {
                "key": "button-action-download",
                "label": "Button Action Download",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.template.button-action-download"
                  },
                  {
                    "action": "download",
                    "label": "Read (Download)",
                    "resource": "utilitas.template.button-action-download"
                  }
                ]
              },
              {
                "key": "button-action-edit",
                "label": "Button Action Edit",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "utilitas.template.button-action-edit"
                  }
                ]
              },
              {
                "key": "button-delete-template",
                "label": "Button Delete Template",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "utilitas.template.button-delete-template"
                  }
                ]
              },
              {
                "key": "button-download-template",
                "label": "Button Download Template",
                "permissions": [
                  {
                    "action": "download",
                    "label": "Read (Download)",
                    "resource": "utilitas.template.button-download-template"
                  }
                ]
              },
              {
                "key": "button-edit-template",
                "label": "Button Edit Template",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "utilitas.template.button-edit-template"
                  }
                ]
              },
              {
                "key": "button-tambah-template",
                "label": "Button Tambah Template",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.template.button-tambah-template"
                  }
                ]
              },
              {
                "key": "halaman-template",
                "label": "Halaman Template",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.template.halaman-template"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "titelatur-inggris",
        "label": "Titelatur Inggris",
        "subMenus": [
          {
            "key": "",
            "label": "Titelatur Inggris",
            "fiturs": [
              {
                "key": "button-delete-titelatur-inggris",
                "label": "Button Delete Titelatur Inggris",
                "permissions": [
                  {
                    "action": "delete",
                    "label": "Delete",
                    "resource": "utilitas.titelatur-inggris.button-delete-titelatur-inggris"
                  }
                ]
              },
              {
                "key": "button-edit-titelatur-inggris",
                "label": "Button Edit Titelatur Inggris",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "utilitas.titelatur-inggris.button-edit-titelatur-inggris"
                  }
                ]
              },
              {
                "key": "button-tambah-titelatur-inggris",
                "label": "Button Tambah Titelatur Inggris",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.titelatur-inggris.button-tambah-titelatur-inggris"
                  }
                ]
              },
              {
                "key": "halaman-titelatur-inggris",
                "label": "Halaman Titelatur Inggris",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.titelatur-inggris.halaman-titelatur-inggris"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "ttd-digital",
        "label": "TTD Digital",
        "subMenus": [
          {
            "key": "cek-dokumen",
            "label": "Cek Dokumen",
            "fiturs": [
              {
                "key": "halaman-cek-dokumen",
                "label": "Halaman Cek Dokumen",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.cek-dokumen.halaman-cek-dokumen"
                  }
                ]
              }
            ]
          },
          {
            "key": "log-disdig",
            "label": "Log Disdig",
            "fiturs": [
              {
                "key": "button-aktifkan-alert-gangguan",
                "label": "Button aktifkan alert gangguan",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.ttd-digital.log-disdig.button-aktifkan-alert-gangguan"
                  }
                ]
              },
              {
                "key": "button-allert",
                "label": "Button Allert",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.ttd-digital.log-disdig.button-allert"
                  }
                ]
              },
              {
                "key": "halaman-log-disdig",
                "label": "Halaman Log Disdig",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.log-disdig.halaman-log-disdig"
                  }
                ]
              }
            ]
          },
          {
            "key": "penandatanganan",
            "label": "Penandatanganan",
            "fiturs": [
              {
                "key": "button-lihat-detail-dokumen",
                "label": "Button Lihat Detail Dokumen",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.penandatanganan.button-lihat-detail-dokumen"
                  }
                ]
              },
              {
                "key": "button-lihat-dokumen",
                "label": "Button Lihat Dokumen",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.penandatanganan.button-lihat-dokumen"
                  }
                ]
              },
              {
                "key": "button-lihat-file-dokumen",
                "label": "Button Lihat File Dokumen",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.penandatanganan.button-lihat-file-dokumen"
                  }
                ]
              },
              {
                "key": "button-show-detail-dokumen",
                "label": "Button Show Detail Dokumen",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.penandatanganan.button-show-detail-dokumen"
                  }
                ]
              },
              {
                "key": "button-tolak",
                "label": "Button Tolak",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.ttd-digital.penandatanganan.button-tolak"
                  }
                ]
              },
              {
                "key": "button-ttd",
                "label": "Button TTD",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.ttd-digital.penandatanganan.button-ttd"
                  }
                ]
              },
              {
                "key": "button-ttd-digital",
                "label": "Button TTD Digital",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.ttd-digital.penandatanganan.button-ttd-digital"
                  }
                ]
              },
              {
                "key": "halaman-penandatanganan",
                "label": "Halaman Penandatanganan",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.penandatanganan.halaman-penandatanganan"
                  }
                ]
              }
            ]
          },
          {
            "key": "verifikasi-dokumen",
            "label": "Verifikasi Dokumen",
            "fiturs": [
              {
                "key": "button-edit-dokumen",
                "label": "Button Edit Dokumen",
                "permissions": [
                  {
                    "action": "update",
                    "label": "Update",
                    "resource": "utilitas.ttd-digital.verifikasi-dokumen.button-edit-dokumen"
                  }
                ]
              },
              {
                "key": "button-lihat-detail-dokumen",
                "label": "Button Lihat Detail Dokumen",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-detail-dokumen"
                  }
                ]
              },
              {
                "key": "button-lihat-dokumen",
                "label": "Button Lihat Dokumen",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-dokumen"
                  }
                ]
              },
              {
                "key": "button-lihat-file-dokumen",
                "label": "Button Lihat File Dokumen",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-file-dokumen"
                  }
                ]
              },
              {
                "key": "button-show-detail-dokumen",
                "label": "Button Show Detail Dokumen",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.verifikasi-dokumen.button-show-detail-dokumen"
                  }
                ]
              },
              {
                "key": "button-tambah-dokumen",
                "label": "Button Tambah Dokumen",
                "permissions": [
                  {
                    "action": "create",
                    "label": "Create",
                    "resource": "utilitas.ttd-digital.verifikasi-dokumen.button-tambah-dokumen"
                  }
                ]
              },
              {
                "key": "halaman-verifikasi-dokumen",
                "label": "Halaman Verifikasi Dokumen",
                "permissions": [
                  {
                    "action": "read",
                    "label": "Read",
                    "resource": "utilitas.ttd-digital.verifikasi-dokumen.halaman-verifikasi-dokumen"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
];

export const rbacRolePermissionAssignments: Record<string, string[]> = {
  "admin": [
    "administrasi.data-master.jenis.button-delete-jenis:delete",
    "administrasi.data-master.jenis.button-detail-jenis:read",
    "administrasi.data-master.jenis.button-edit-jenis:update",
    "administrasi.data-master.jenis.button-export:export",
    "administrasi.data-master.jenis.button-tambah-jenis:create",
    "administrasi.data-master.jenis.halaman-jenis:read",
    "administrasi.data-master.klasifikasi.button-action-delete:delete",
    "administrasi.data-master.klasifikasi.button-action-edit:update",
    "administrasi.data-master.klasifikasi.button-export:export",
    "administrasi.data-master.klasifikasi.button-tambah:create",
    "administrasi.data-master.klasifikasi.halaman-klasifikasi:read",
    "administrasi.data-master.perusahaan.button-action-area:read",
    "administrasi.data-master.perusahaan.button-action-delete-perusahaan:delete",
    "administrasi.data-master.perusahaan.button-action-edit-perusahaan:update",
    "administrasi.data-master.perusahaan.button-tambah-perusahaan:create",
    "administrasi.data-master.perusahaan.halaman-perusahaan:read",
    "administrasi.data-master.tertuju.button-edit-tertuju-eksternal:update",
    "administrasi.data-master.tertuju.button-export:export",
    "administrasi.data-master.tertuju.button-hapus-data:delete",
    "administrasi.data-master.tertuju.button-tambah-tertuju-eksternal:create",
    "administrasi.data-master.tertuju.halaman-tertuju:read",
    "administrasi.delegasi.button-delete-delegasi:delete",
    "administrasi.delegasi.button-edit-delegasi:update",
    "administrasi.delegasi.button-export:export",
    "administrasi.delegasi.button-tambah-delegasi:create",
    "administrasi.delegasi.halaman-delegasi:read",
    "administrasi.naskah-masuk.button-action-show-detail-naskah:read",
    "administrasi.naskah-masuk.button-export:export",
    "administrasi.naskah-masuk.button-tambah-naskah-masuk:create",
    "administrasi.naskah-masuk.halaman-verifikasi-naskah:read",
    "administrasi.penomoran.penomoran.button-export:export",
    "administrasi.penomoran.penomoran.button-tambah-penomoran:create",
    "administrasi.penomoran.penomoran.halaman-penomoran:read",
    "administrasi.penomoran.persetujuan.button-export:export",
    "administrasi.penomoran.persetujuan.halaman-persetujuan:read",
    "administrasi.penomoran.usulan.button-export:export",
    "administrasi.penomoran.usulan.halaman-usulan:read",
    "administrasi.penomoran.verifikasi.button-export:export",
    "administrasi.penomoran.verifikasi.halaman-verifikasi:read",
    "administrasi.titelatur-inggris.button-delete-titelatur:delete",
    "administrasi.titelatur-inggris.button-edit-titelatur:update",
    "administrasi.titelatur-inggris.button-tambah-titelatur:create",
    "administrasi.titelatur-inggris.halaman-titelatur-inggris:read",
    "faq.faq.halaman-faq:read",
    "faq.manajemen-faq.button-delete-faq:delete",
    "faq.manajemen-faq.button-edit-faq:update",
    "faq.manajemen-faq.button-export:export",
    "faq.manajemen-faq.button-tambah-faq:create",
    "faq.manajemen-faq.halaman-manajemen-faq:read",
    "faq.manajemen-pedoman.button-delete-pedoman:delete",
    "faq.manajemen-pedoman.button-edit-pedoman:update",
    "faq.manajemen-pedoman.button-tambah-pedoman:create",
    "faq.manajemen-pedoman.halaman-manajemen-pedoman:read",
    "faq.pedoman.halaman-pedoman:read",
    "laporan.detail-naskah.button-export:export",
    "laporan.detail-naskah.halaman-detail-naskah:read",
    "laporan.naskah-masuk.button-export:export",
    "laporan.naskah-masuk.halaman-naskah-masuk:read",
    "laporan.rekap-naskah.button-export:export",
    "laporan.rekap-naskah.halaman-rekap-masuk:read",
    "utama.beranda.dashboard.dashboard:read",
    "utama.draft.detail-halaman-draft:read",
    "utama.draft.halaman-draft:read",
    "utama.kotak-masuk.detail-surat-masuk:read",
    "utama.kotak-masuk.halaman-kotak-masuk:read",
    "utama.terkirim.detail-surat-terkirim:read",
    "utama.terkirim.halaman-terkirim:read",
    "utama.tertunda.detail-halaman-tertunda:read",
    "utama.tertunda.halaman-tertunda:read",
    "utama.tulis.kajian.button-kirim:create",
    "utama.tulis.kajian.button-pilih-template:read",
    "utama.tulis.kajian.button-pratinjau:read",
    "utama.tulis.kajian.button-simpan-template-saya:create",
    "utama.tulis.kajian.button-template-saya:read",
    "utama.tulis.kajian.halaman-kajian:read",
    "utama.tulis.naskah-lainnya.button-kirim:create",
    "utama.tulis.naskah-lainnya.button-pratinjau:read",
    "utama.tulis.naskah-lainnya.halaman-naskah-lainnya:read",
    "utilitas.layanan-email.kirim-email.halaman-kirim-email:read",
    "utilitas.layanan-email.log-email.halaman-log-email:read",
    "utilitas.penyingkatan-tautan.button-delete-tautan:delete",
    "utilitas.penyingkatan-tautan.button-edit-tautan:update",
    "utilitas.penyingkatan-tautan.button-tambah-tautan:create",
    "utilitas.penyingkatan-tautan.halaman-penyingkatan-tautan:read",
    "utilitas.template.button-delete-template:delete",
    "utilitas.template.button-download-template:download",
    "utilitas.template.button-edit-template:update",
    "utilitas.template.button-tambah-template:create",
    "utilitas.template.halaman-template:read",
    "utilitas.ttd-digital.cek-dokumen.halaman-cek-dokumen:read",
    "utilitas.ttd-digital.log-disdig.button-allert:create",
    "utilitas.ttd-digital.log-disdig.halaman-log-disdig:read",
    "utilitas.ttd-digital.penandatanganan.button-lihat-detail-dokumen:read",
    "utilitas.ttd-digital.penandatanganan.button-lihat-file-dokumen:read",
    "utilitas.ttd-digital.penandatanganan.button-tolak:create",
    "utilitas.ttd-digital.penandatanganan.button-ttd-digital:create",
    "utilitas.ttd-digital.penandatanganan.halaman-penandatanganan:read",
    "utilitas.ttd-digital.verifikasi-dokumen.button-edit-dokumen:update",
    "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-detail-dokumen:read",
    "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-file-dokumen:read",
    "utilitas.ttd-digital.verifikasi-dokumen.button-tambah-dokumen:create",
    "utilitas.ttd-digital.verifikasi-dokumen.halaman-verifikasi-dokumen:read"
  ],
  "superadmin": [
    "administrasi.data-master.jenis.button-delete-jenis:delete",
    "administrasi.data-master.jenis.button-detail-jenis:read",
    "administrasi.data-master.jenis.button-edit-jenis:update",
    "administrasi.data-master.jenis.button-export:export",
    "administrasi.data-master.jenis.button-tambah-jenis:create",
    "administrasi.data-master.jenis.halaman-jenis:read",
    "administrasi.data-master.klasifikasi.button-action-delete:delete",
    "administrasi.data-master.klasifikasi.button-action-edit:update",
    "administrasi.data-master.klasifikasi.button-export:export",
    "administrasi.data-master.klasifikasi.button-tambah-klasifikasi:create",
    "administrasi.data-master.klasifikasi.halaman-klasifikasi:read",
    "administrasi.data-master.perusahaan.button-action-area:read",
    "administrasi.data-master.perusahaan.button-action-delete-perusahaan:delete",
    "administrasi.data-master.perusahaan.button-action-edit-perusahaan:update",
    "administrasi.data-master.perusahaan.button-tambah-perusahaan:create",
    "administrasi.data-master.perusahaan.halaman-perusahaan:read",
    "administrasi.data-master.tertuju.button-edit-tertuju-eksternal:update",
    "administrasi.data-master.tertuju.button-export:export",
    "administrasi.data-master.tertuju.button-hapus-data:delete",
    "administrasi.data-master.tertuju.button-tambah-tertuju-eksternal:create",
    "administrasi.data-master.tertuju.halaman-tertuju:read",
    "administrasi.delegasi.button-delete-delegasi:delete",
    "administrasi.delegasi.button-edit-delegasi:update",
    "administrasi.delegasi.button-export:export",
    "administrasi.delegasi.button-tambah-delegasi:create",
    "administrasi.delegasi.halaman-delegasi:read",
    "administrasi.manajemen-rbac.konfigurasi-sistem:read",
    "administrasi.manajemen-rbac.permission.button-export:export",
    "administrasi.manajemen-rbac.permission.halaman-permission:read",
    "administrasi.manajemen-rbac.resource.button-export:export",
    "administrasi.manajemen-rbac.resource.halaman-resource:read",
    "administrasi.manajemen-rbac.role.button-detail-role:read",
    "administrasi.manajemen-rbac.role.button-edit-role:update",
    "administrasi.manajemen-rbac.role.halaman-role:read",
    "administrasi.manajemen-rbac.user-role.button-detail-role:read",
    "administrasi.manajemen-rbac.user-role.button-export:export",
    "administrasi.manajemen-rbac.user-role.button-tambah-role:create",
    "administrasi.manajemen-rbac.user-role.halaman-user-role:read",
    "administrasi.naskah-masuk.button-action-edit-naskah:update",
    "administrasi.naskah-masuk.button-action-show-detail-naskah:read",
    "administrasi.naskah-masuk.button-export:export",
    "administrasi.naskah-masuk.button-tambah-naskah-masuk:create",
    "administrasi.naskah-masuk.halaman-verifikasi-naskah:read",
    "administrasi.penomoran.penomoran.button-export:export",
    "administrasi.penomoran.penomoran.button-tambah-penomoran:create",
    "administrasi.penomoran.penomoran.halaman-penomoran:read",
    "administrasi.penomoran.persetujuan.button-export:export",
    "administrasi.penomoran.persetujuan.halaman-persetujuan:read",
    "administrasi.penomoran.usulan.button-export-usulan:export",
    "administrasi.penomoran.usulan.button-tambah-usulan:create",
    "administrasi.penomoran.usulan.halaman-usulan:read",
    "administrasi.penomoran.verifikasi.button-export:export",
    "administrasi.penomoran.verifikasi.halaman-verifikasi:read",
    "administrasi.titelatur-inggris.button-delete-titelatur-inggris:delete",
    "administrasi.titelatur-inggris.button-edit-titelatur-inggris:update",
    "administrasi.titelatur-inggris.button-tambah-titelatur-inggris:create",
    "administrasi.titelatur-inggris.halaman-titelatur-inggris:read",
    "faq.faq.halaman-faq:read",
    "laporan.laporan-sla.button-cetak-laporan-pdf:export",
    "laporan.laporan-sla.button-export-excel:export",
    "laporan.laporan-sla.halaman-laporan-sla:read",
    "laporan.laporan-surat.button-cetak-laporan-pdf:export",
    "laporan.laporan-surat.button-export-excel:export",
    "laporan.laporan-surat.halaman-laporan-surat:read",
    "permission:create",
    "permission:delete",
    "permission:export",
    "permission:read",
    "permission:update",
    "resource:create",
    "resource:delete",
    "resource:export",
    "resource:read",
    "resource:update",
    "role:assign-permission",
    "role:create",
    "role:delete",
    "role:export",
    "role:read",
    "role:update",
    "system-config:read",
    "system-config:update",
    "user-role:assign-role",
    "user-role:create",
    "user-role:delete",
    "user-role:export",
    "user-role:read",
    "user-role:update",
    "utama.beranda.dashboard.dashboard:read",
    "utama.beranda.dashboard.export-data-dashboard:read",
    "utama.beranda.dashboard.filter-dashboard:read",
    "utama.draft.detail-surat.button-edit:update",
    "utama.draft.detail-surat.button-hapus:delete",
    "utama.draft.detail-surat.button-kirim:create",
    "utama.draft.detail-surat.halaman-detail-surat:read",
    "utama.draft.halaman-draft:read",
    "utama.draft.pencarian-filter:read",
    "utama.kotak-masuk.detail-surat.button-arsipkan:update",
    "utama.kotak-masuk.detail-surat.button-balas-surat:create",
    "utama.kotak-masuk.detail-surat.button-lanjut-disposisi:read",
    "utama.kotak-masuk.detail-surat.button-lanjut-nota-dinas:read",
    "utama.kotak-masuk.detail-surat.button-lanjut-surat-eksternal:read",
    "utama.kotak-masuk.detail-surat.button-lanjut-surat-internal:read",
    "utama.kotak-masuk.detail-surat.button-teruskan:create",
    "utama.kotak-masuk.detail-surat.halaman-detail-surat:read",
    "utama.kotak-masuk.detail-surat.unduh-lampiran:read",
    "utama.kotak-masuk.halaman-kotak-masuk:read",
    "utama.kotak-masuk.pencarian-filter:read",
    "utama.terkirim.detail-surat.button-kirim-email:create",
    "utama.terkirim.detail-surat.button-tarik-surat-recall:delete",
    "utama.terkirim.detail-surat.halaman-detail-surat:read",
    "utama.terkirim.detail-surat.unduh-lampiran:read",
    "utama.terkirim.halaman-terkirim:read",
    "utama.terkirim.pencarian-filter:read",
    "utama.tertunda.detail-surat.button-batalkan:delete",
    "utama.tertunda.detail-surat.button-edit:update",
    "utama.tertunda.detail-surat.button-kirim-ulang:create",
    "utama.tertunda.detail-surat.halaman-detail-surat:read",
    "utama.tertunda.halaman-tertunda:read",
    "utama.tulis.disposisi.button-kirim:create",
    "utama.tulis.disposisi.button-pratinjau:create",
    "utama.tulis.disposisi.halaman-disposisi:read",
    "utama.tulis.nota-dinas.button-kirim:create",
    "utama.tulis.nota-dinas.button-pilih-template:read",
    "utama.tulis.nota-dinas.button-pratinjau:create",
    "utama.tulis.nota-dinas.button-simpan-template-saya:create",
    "utama.tulis.nota-dinas.button-template-saya:read",
    "utama.tulis.nota-dinas.halaman-nota-dinas:read",
    "utama.tulis.nota-dinas.upload-lampiran:create",
    "utama.tulis.surat-dinas-internal.button-kirim:create",
    "utama.tulis.surat-dinas-internal.button-pilih-template:read",
    "utama.tulis.surat-dinas-internal.button-pratinjau:read",
    "utama.tulis.surat-dinas-internal.button-simpan-template-saya:create",
    "utama.tulis.surat-dinas-internal.button-template-saya:read",
    "utama.tulis.surat-dinas-internal.halaman-surat-dinas-internal:read",
    "utilitas.layanan-email.halaman-layanan-email:read",
    "utilitas.layanan-email.kirim-email:create",
    "utilitas.layanan-email.log-email:read",
    "utilitas.penyingkatan-tautan.button-action-delete:delete",
    "utilitas.penyingkatan-tautan.button-action-edit:update",
    "utilitas.penyingkatan-tautan.button-tambah-tautan:create",
    "utilitas.penyingkatan-tautan.halaman-penyingkatan-tautan:read",
    "utilitas.template.button-action-delete:delete",
    "utilitas.template.button-action-download:read",
    "utilitas.template.button-action-edit:update",
    "utilitas.template.button-tambah-template:create",
    "utilitas.template.halaman-template:read",
    "utilitas.ttd-digital.cek-dokumen.halaman-cek-dokumen:read",
    "utilitas.ttd-digital.log-disdig.button-aktifkan-alert-gangguan:create",
    "utilitas.ttd-digital.log-disdig.halaman-log-disdig:read",
    "utilitas.ttd-digital.penandatanganan.button-lihat-dokumen:read",
    "utilitas.ttd-digital.penandatanganan.button-show-detail-dokumen:read",
    "utilitas.ttd-digital.penandatanganan.button-tolak:create",
    "utilitas.ttd-digital.penandatanganan.button-ttd:create",
    "utilitas.ttd-digital.penandatanganan.halaman-penandatanganan:read",
    "utilitas.ttd-digital.verifikasi-dokumen.button-edit-dokumen:update",
    "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-dokumen:read",
    "utilitas.ttd-digital.verifikasi-dokumen.button-show-detail-dokumen:read",
    "utilitas.ttd-digital.verifikasi-dokumen.button-tambah-dokumen:create",
    "utilitas.ttd-digital.verifikasi-dokumen.halaman-verifikasi-dokumen:read"
  ],
  "user": [
    "faq.faq.halaman-faq:read",
    "faq.pedoman.halaman-pedoman:read",
    "utama.beranda.dashboard.halaman-dashboard:read",
    "utama.draft.detail-surat.button-edit:update",
    "utama.draft.detail-surat.button-hapus:delete",
    "utama.draft.detail-surat.halaman-detail-surat:read",
    "utama.draft.halaman-draft:read",
    "utama.kotak-masuk.halaman-detail-surat-masuk:read",
    "utama.kotak-masuk.halaman-kotak-masuk:read",
    "utama.terkirim.halaman-detail-terkirim:read",
    "utama.terkirim.halaman-terkirim:read",
    "utama.tertunda.halaman-detail-tertunda:read",
    "utama.tertunda.halaman-tertunda:read",
    "utama.tulis.disposisi.button-pratinjau:read",
    "utama.tulis.disposisi.halaman-disposisi:read",
    "utama.tulis.kajian.button-pilih-template:read",
    "utama.tulis.kajian.button-pratinjau:read",
    "utama.tulis.kajian.button-simpan-template-saya:create",
    "utama.tulis.kajian.button-template-saya:read",
    "utama.tulis.kajian.halaman-kajian:read",
    "utama.tulis.naskah-lainnya.button-kirim:create",
    "utama.tulis.naskah-lainnya.button-pratinjau:read",
    "utama.tulis.naskah-lainnya.button-simpan-draft:create",
    "utama.tulis.naskah-lainnya.halaman-naskah-lainnya:read",
    "utama.tulis.nota-dinas.button-pilih-template:read",
    "utama.tulis.nota-dinas.button-pratinjau:read",
    "utama.tulis.nota-dinas.button-simpan-template-saya:create",
    "utama.tulis.nota-dinas.button-template-saya:read",
    "utama.tulis.nota-dinas.halaman-nota-dinas:read",
    "utama.tulis.surat-dinas-eksternal.button-pilih-template:read",
    "utama.tulis.surat-dinas-eksternal.button-pratinjau:read",
    "utama.tulis.surat-dinas-eksternal.button-simpan-template-saya:create",
    "utama.tulis.surat-dinas-eksternal.button-template-saya:read",
    "utama.tulis.surat-dinas-eksternal.halaman-surat-dinas-eksternal:read",
    "utama.tulis.surat-dinas-internal.button-pilih-template:read",
    "utama.tulis.surat-dinas-internal.button-pratinjau:read",
    "utama.tulis.surat-dinas-internal.button-simpan-template-saya:create",
    "utama.tulis.surat-dinas-internal.button-template-saya:read",
    "utama.tulis.surat-dinas-internal.halaman-surat-dinas-internal:read",
    "utilitas.layanan-email.kirim-email:create",
    "utilitas.layanan-email.log-email:read",
    "utilitas.penomoran.persetujuan.button-export:export",
    "utilitas.penomoran.persetujuan.halaman-persetujuan:read",
    "utilitas.penomoran.usulan.button-export-usulan:export",
    "utilitas.penomoran.usulan.button-tambah-usulan:create",
    "utilitas.penomoran.usulan.halaman-usulan:read",
    "utilitas.penyingkatan-tautan.button-action-delete:delete",
    "utilitas.penyingkatan-tautan.button-action-edit:update",
    "utilitas.penyingkatan-tautan.button-tambah-tautan:create",
    "utilitas.penyingkatan-tautan.halaman-penyingkatan-tautan:read",
    "utilitas.template.button-action-delete:delete",
    "utilitas.template.button-action-download:download",
    "utilitas.template.button-action-edit:update",
    "utilitas.template.button-tambah-template:create",
    "utilitas.template.halaman-template:read",
    "utilitas.titelatur-inggris.button-delete-titelatur-inggris:delete",
    "utilitas.titelatur-inggris.button-edit-titelatur-inggris:update",
    "utilitas.titelatur-inggris.button-tambah-titelatur-inggris:create",
    "utilitas.titelatur-inggris.halaman-titelatur-inggris:read",
    "utilitas.ttd-digital.verifikasi-dokumen.button-edit-dokumen:update",
    "utilitas.ttd-digital.verifikasi-dokumen.button-lihat-dokumen:read",
    "utilitas.ttd-digital.verifikasi-dokumen.button-show-detail-dokumen:read",
    "utilitas.ttd-digital.verifikasi-dokumen.button-tambah-dokumen:create",
    "utilitas.ttd-digital.verifikasi-dokumen.halaman-verifikasi-dokumen:read"
  ]
};
