# Berkas Module - API Documentation

## Overview
Module CRUD lengkap untuk management berkas/arsip dengan fitur soft delete dan restore.

## Database Setup

Jalankan file SQL berikut untuk membuat tabel:
```sql
-- File: db/berkas.sql
```

## Endpoints

### 1. Create Berkas
**POST** `/berkas`

**Body:**
```json
{
  "klasifikasi": "Dokumen Rahasia",
  "judul_berkas": "Laporan Keuangan 2024",
  "hitung_waktu_retensi_dari": "Sejak Berkas Dibuat",
  "tindakan_penyusutan_akhir": "Musnah",
  "lokasi": "Ruang Arsip A - Rak 5",
  "isi_ringkas": "Laporan keuangan tahunan perusahaan tahun fiskal 2024"
}
```

**Note:** Field `is_aktif` tidak perlu dimasukkan karena default value-nya adalah `true`

**Response (201):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "klasifikasi": "Dokumen Rahasia",
  "judulBerkas": "Laporan Keuangan 2024",
  "hitungWaktuRetensiDari": "Sejak Berkas Dibuat",
  "tindakanPenyusutanAkhir": "Musnah",
  "lokasi": "Ruang Arsip A - Rak 5",
  "isiRingkas": "Laporan keuangan tahunan perusahaan tahun fiskal 2024",
  "isAktif": true,
  "createdAt": "2025-12-08T08:00:00.000Z",
  "updatedAt": "2025-12-08T08:00:00.000Z"
}
```

### 2. Get All Berkas
**GET** `/berkas`

**Query Parameters:**
- `includeInactive` (optional): boolean, default `false` - Set `true` untuk melihat berkas yang sudah dinonaktifkan

**Example:**
```
GET /berkas
GET /berkas?includeInactive=true
```

**Response (200):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "klasifikasi": "Dokumen Rahasia",
    "judulBerkas": "Laporan Keuangan 2024",
    "hitungWaktuRetensiDari": "Sejak Berkas Dibuat",
    "tindakanPenyusutanAkhir": "Musnah",
    "lokasi": "Ruang Arsip A - Rak 5",
    "isiRingkas": "Laporan keuangan tahunan perusahaan tahun fiskal 2024",
    "isAktif": true,
    "createdAt": "2025-12-08T08:00:00.000Z",
    "updatedAt": "2025-12-08T08:00:00.000Z"
  }
]
```

### 3. Get Berkas By ID
**GET** `/berkas/:id`

**Example:**
```
GET /berkas/550e8400-e29b-41d4-a716-446655440000
```

**Response (200):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "klasifikasi": "Dokumen Rahasia",
  "judulBerkas": "Laporan Keuangan 2024",
  "hitungWaktuRetensiDari": "Sejak Berkas Dibuat",
  "tindakanPenyusutanAkhir": "Musnah",
  "lokasi": "Ruang Arsip A - Rak 5",
  "isiRingkas": "Laporan keuangan tahunan perusahaan tahun fiskal 2024",
  "isAktif": true,
  "createdAt": "2025-12-08T08:00:00.000Z",
  "updatedAt": "2025-12-08T08:00:00.000Z"
}
```

**Response (404):**
```json
{
  "statusCode": 404,
  "message": "Berkas dengan ID 550e8400-e29b-41d4-a716-446655440000 tidak ditemukan",
  "error": "Not Found"
}
```

### 4. Update Berkas
**PATCH** `/berkas/:id`

**Body (semua field optional):**
```json
{
  "klasifikasi": "Dokumen Sangat Rahasia",
  "judul_berkas": "Laporan Keuangan 2024 - Revisi",
  "lokasi": "Ruang Arsip B - Rak 3"
}
```

**Response (200):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "klasifikasi": "Dokumen Sangat Rahasia",
  "judulBerkas": "Laporan Keuangan 2024 - Revisi",
  "hitungWaktuRetensiDari": "Sejak Berkas Dibuat",
  "tindakanPenyusutanAkhir": "Musnah",
  "lokasi": "Ruang Arsip B - Rak 3",
  "isiRingkas": "Laporan keuangan tahunan perusahaan tahun fiskal 2024",
  "isAktif": true,
  "createdAt": "2025-12-08T08:00:00.000Z",
  "updatedAt": "2025-12-08T08:15:00.000Z"
}
```

### 5. Soft Delete Berkas
**DELETE** `/berkas/:id/soft`

Menonaktifkan berkas tanpa menghapus dari database (mengubah `is_aktif` menjadi `false`)

**Example:**
```
DELETE /berkas/550e8400-e29b-41d4-a716-446655440000/soft
```

**Response (200):**
```json
{
  "message": "Berkas 550e8400-e29b-41d4-a716-446655440000 berhasil dinonaktifkan"
}
```

### 6. Hard Delete Berkas
**DELETE** `/berkas/:id`

Menghapus berkas secara permanen dari database

**Example:**
```
DELETE /berkas/550e8400-e29b-41d4-a716-446655440000
```

**Response (200):**
```json
{
  "message": "Berkas 550e8400-e29b-41d4-a716-446655440000 berhasil dihapus permanen"
}
```

### 7. Restore Berkas
**PATCH** `/berkas/:id/restore`

Mengaktifkan kembali berkas yang sudah dinonaktifkan

**Example:**
```
PATCH /berkas/550e8400-e29b-41d4-a716-446655440000/restore
```

**Response (200):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "klasifikasi": "Dokumen Rahasia",
  "judulBerkas": "Laporan Keuangan 2024",
  "hitungWaktuRetensiDari": "Sejak Berkas Dibuat",
  "tindakanPenyusutanAkhir": "Musnah",
  "lokasi": "Ruang Arsip A - Rak 5",
  "isiRingkas": "Laporan keuangan tahunan perusahaan tahun fiskal 2024",
  "isAktif": true,
  "createdAt": "2025-12-08T08:00:00.000Z",
  "updatedAt": "2025-12-08T08:20:00.000Z"
}
```

## Enum Values

### hitung_waktu_retensi_dari
- `Sejak Berkas Dibuat`
- `Sejak Berkas Ditutup`

### tindakan_penyusutan_akhir
- `Musnah`
- `Dinilai Kembali`
- `Permanen`

## Validation Rules

- `klasifikasi`: Required, max 50 characters
- `judul_berkas`: Required, max 200 characters
- `hitung_waktu_retensi_dari`: Required, must be one of the enum values
- `tindakan_penyusutan_akhir`: Required, must be one of the enum values
- `lokasi`: Required, max 255 characters
- `isi_ringkas`: Required, text field
- `is_aktif`: Optional, boolean, default `true`

## Testing dengan PowerShell

### Create Berkas
```powershell
$body = @{
    klasifikasi = 'Dokumen Rahasia'
    judul_berkas = 'Laporan Keuangan 2024'
    hitung_waktu_retensi_dari = 'Sejak Berkas Dibuat'
    tindakan_penyusutan_akhir = 'Musnah'
    lokasi = 'Ruang Arsip A - Rak 5'
    isi_ringkas = 'Laporan keuangan tahunan perusahaan tahun fiskal 2024'
} | ConvertTo-Json

Invoke-RestMethod -Uri 'http://localhost:3000/berkas' -Method Post -Body $body -ContentType 'application/json'
```

### Get All Berkas
```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/berkas' -Method Get
```

### Get Berkas By ID
```powershell
$id = '550e8400-e29b-41d4-a716-446655440000'
Invoke-RestMethod -Uri "http://localhost:3000/berkas/$id" -Method Get
```

### Update Berkas
```powershell
$id = '550e8400-e29b-41d4-a716-446655440000'
$body = @{
    lokasi = 'Ruang Arsip B - Rak 3'
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/berkas/$id" -Method Patch -Body $body -ContentType 'application/json'
```

### Soft Delete
```powershell
$id = '550e8400-e29b-41d4-a716-446655440000'
Invoke-RestMethod -Uri "http://localhost:3000/berkas/$id/soft" -Method Delete
```

### Hard Delete
```powershell
$id = '550e8400-e29b-41d4-a716-446655440000'
Invoke-RestMethod -Uri "http://localhost:3000/berkas/$id" -Method Delete
```

### Restore
```powershell
$id = '550e8400-e29b-41d4-a716-446655440000'
Invoke-RestMethod -Uri "http://localhost:3000/berkas/$id/restore" -Method Patch
```

## File Structure

```
src/modules/berkas/
├── berkas.module.ts          # Module definition
├── controllers/
│   ├── index.ts
│   └── berkas.controller.ts  # REST API endpoints
├── services/
│   ├── index.ts
│   └── berkas.service.ts     # Business logic
├── dto/
│   ├── index.ts
│   ├── create-berkas.dto.ts  # Create validation
│   └── update-berkas.dto.ts  # Update validation
└── entities/
    └── berkas.entity.ts      # Database entity
```

## Features

✅ Create berkas dengan default `is_aktif = true`
✅ Read all berkas (dengan filter aktif/nonaktif)
✅ Read berkas by ID
✅ Update berkas (partial update)
✅ Soft delete (nonaktifkan berkas)
✅ Hard delete (hapus permanen)
✅ Restore (aktifkan kembali berkas yang dinonaktifkan)
✅ Validation lengkap untuk semua input
✅ TypeORM entity dengan UUID auto-generated
✅ Timestamps otomatis (created_at, updated_at)
