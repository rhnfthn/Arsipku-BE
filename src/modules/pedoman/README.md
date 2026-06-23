# Modul Pedoman

## Deskripsi

Fitur **Pedoman** menampilkan Peraturan Direksi, Keputusan Direksi, dan SOP tentang Kearsipan yang ada di lingkungan Perum LPPNPI.

Modul ini ditempatkan di bawah fitur menu FAQ pada aplikasi.

## Akses

| Aksi | Role | Keterangan |
|------|------|------------|
| GET (read) | Semua user | User yang sudah login dapat melihat semua pedoman aktif |
| POST (create) | Admin & Super Admin | Hanya admin/super admin yang dapat membuat pedoman baru |
| PATCH (update) | Admin & Super Admin | Hanya admin/super admin yang dapat memperbarui pedoman |
| DELETE (delete) | Admin & Super Admin | Hanya admin/super admin yang dapat menghapus pedoman |

## Struktur Modul

```
pedoman/
├── pedoman.module.ts
├── controllers/
│   └── pedoman.controller.ts
├── dto/
│   ├── create-pedoman.dto.ts
│   ├── update-pedoman.dto.ts
│   └── pedoman.dto.ts
├── entities/
│   └── pedoman.entity.ts
├── services/
│   └── pedoman.service.ts
└── README.md
```

## Entity

### `pedoman` table

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | Primary key, auto-generated |
| `judul` | varchar(500) | Judul dokumen pedoman |
| `deskripsi` | text | Deskripsi / ringkasan dokumen |
| `jenis` | varchar(100) | Jenis dokumen: `Peraturan Direksi`, `Keputusan Direksi`, `SOP Kearsipan` |
| `nomorDokumen` | varchar(100), nullable | Nomor dokumen pedoman |
| `tanggalBerlaku` | date, nullable | Tanggal berlaku dokumen |
| `fileUrl` | varchar(255), nullable | URL file dokumen pedoman |
| `isActive` | boolean, default true | Status aktif/non-aktif pedoman |
| `created_at` | datetime | Timestamp pembuatan |
| `updated_at` | datetime | Timestamp pembaruan terakhir |

### Enum `PedomanJenis`

| Nilai | Keterangan |
|-------|------------|
| `Peraturan Direksi` | Peraturan Direksi Perum LPPNPI |
| `Keputusan Direksi` | Keputusan Direksi Perum LPPNPI |
| `SOP Kearsipan` | SOP tentang Kearsipan |

## Endpoint API

### 1. GET `/pedoman`

Mendapatkan semua pedoman.

**Akses:** Semua user (JWT required)

**Query Parameters:**

| Parameter | Tipe | Required | Keterangan |
|-----------|------|----------|------------|
| `jenis` | string | No | Filter berdasarkan jenis: `Peraturan Direksi`, `Keputusan Direksi`, `SOP Kearsipan` |
| `search` | string | No | Pencarian pada judul dan deskripsi |
| `includeInactive` | string | No | `true` untuk menampilkan pedoman tidak aktif (default: `false`) |

**Response 200:**

```json
{
  "success": true,
  "message": "Data pedoman berhasil diambil",
  "data": [
    {
      "id": "uuid",
      "judul": "SOP Pengelolaan Arsip Dinamis",
      "deskripsi": "SOP tentang pengelolaan arsip dinamis...",
      "jenis": "SOP Kearsipan",
      "nomorDokumen": "SOP-001/2025",
      "tanggalBerlaku": "2025-01-01",
      "fileUrl": "https://example.com/sop-001.pdf",
      "isActive": true,
      "created_at": "2025-06-23T00:00:00.000Z",
      "updated_at": "2025-06-23T00:00:00.000Z"
    }
  ]
}
```

---

### 2. GET `/pedoman/:id`

Mendapatkan pedoman berdasarkan ID.

**Akses:** Semua user (JWT required)

**Response 200:**

```json
{
  "success": true,
  "message": "Data pedoman berhasil diambil",
  "data": {
    "id": "uuid",
    "judul": "Peraturan Direksi No. 1 Tahun 2025",
    "deskripsi": "Peraturan tentang kearsipan...",
    "jenis": "Peraturan Direksi",
    "nomorDokumen": "PD-001/2025",
    "tanggalBerlaku": "2025-01-01",
    "fileUrl": "https://example.com/pd-001.pdf",
    "isActive": true,
    "created_at": "2025-06-23T00:00:00.000Z",
    "updated_at": "2025-06-23T00:00:00.000Z"
  }
}
```

**Response 404:**

```json
{
  "success": false,
  "message": "Gagal mengambil data pedoman",
  "error": "Pedoman dengan ID xxx tidak ditemukan"
}
```

---

### 3. POST `/pedoman`

Membuat pedoman baru.

**Akses:** Admin & Super Admin (`@Roles('admin', 'superadmin')`)

**Request Body:**

```json
{
  "judul": "SOP Pengelolaan Arsip Dinamis",
  "deskripsi": "SOP tentang pengelolaan arsip dinamis di lingkungan Perum LPPNPI",
  "jenis": "SOP Kearsipan",
  "nomorDokumen": "SOP-001/2025",
  "tanggalBerlaku": "2025-01-01",
  "fileUrl": "https://example.com/sop-001.pdf",
  "isActive": true
}
```

**Field Validation:**

| Field | Tipe | Required | Validation |
|-------|------|----------|------------|
| `judul` | string | Yes | max 500 chars |
| `deskripsi` | string | Yes | - |
| `jenis` | enum | Yes | `Peraturan Direksi` \| `Keputusan Direksi` \| `SOP Kearsipan` |
| `nomorDokumen` | string | No | max 100 chars |
| `tanggalBerlaku` | ISO date string | No | e.g. `2025-01-01` |
| `fileUrl` | string (URL) | No | max 255 chars, valid URL |
| `isActive` | boolean | No | default `true` |

**Response 201:**

```json
{
  "success": true,
  "message": "Pedoman berhasil dibuat",
  "data": { ... }
}
```

**Response 403 (Forbidden):**

```json
{
  "message": "User does not have required role. Required: superadmin, Current: user"
}
```

---

### 4. PATCH `/pedoman/:id`

Memperbarui pedoman berdasarkan ID. Semua field bersifat optional (partial update).

**Akses:** Admin & Super Admin (`@Roles('admin', 'superadmin')`)

**Request Body (all fields optional):**

```json
{
  "judul": "SOP Pengelolaan Arsip Dinamis (Revisi)",
  "deskripsi": "Deskripsi yang diperbarui...",
  "jenis": "SOP Kearsipan",
  "nomorDokumen": "SOP-001/2025-Rev1",
  "tanggalBerlaku": "2025-06-01",
  "fileUrl": "https://example.com/sop-001-rev1.pdf",
  "isActive": false
}
```

**Response 200:**

```json
{
  "success": true,
  "message": "Pedoman berhasil diperbarui",
  "data": { ... }
}
```

**Response 404:**

```json
{
  "success": false,
  "message": "Gagal memperbarui pedoman",
  "error": "Pedoman dengan ID xxx tidak ditemukan"
}
```

---

### 5. DELETE `/pedoman/:id`

Menghapus pedoman berdasarkan ID.

**Akses:** Admin & Super Admin (`@Roles('admin', 'superadmin')`)

**Response 200:**

```json
{
  "success": true,
  "message": "Pedoman berhasil dihapus",
  "data": { ... }
}
```

**Response 404:**

```json
{
  "success": false,
  "message": "Gagal menghapus pedoman",
  "error": "Pedoman dengan ID xxx tidak ditemukan"
}
```

## SQL Migration

Jalankan SQL berikut untuk membuat tabel `pedoman`:

```sql
CREATE TABLE `pedoman` (
  `id` CHAR(36) NOT NULL PRIMARY KEY,
  `judul` VARCHAR(500) NOT NULL,
  `deskripsi` TEXT NOT NULL,
  `jenis` VARCHAR(100) NOT NULL,
  `nomorDokumen` VARCHAR(100) NOT NULL,
  `tanggalBerlaku` DATE NOT NULL,
  `fileUrl` VARCHAR(255) NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `IDX_pedoman_jenis` (`jenis`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Registrasi Modul

Modul `PedomanModule` telah didaftarkan di `app.module.ts`, ditempatkan tepat setelah `FaqModule`:

```typescript
import { PedomanModule } from './modules/pedoman/pedoman.module';

@Module({
  imports: [
    // ... other modules
    FaqModule,
    PedomanModule,  // ← ditambahkan setelah FaqModule
    ShortUrlModule,
  ],
})
export class AppModule {}
```