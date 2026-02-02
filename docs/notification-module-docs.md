# Dokumentasi Modul Notification

## Overview

Modul notification digunakan untuk:
1. **In-App Notification** - Menyimpan history notifikasi di database
2. **Push Notification** - Mengirim notifikasi ke device mobile via Firebase Cloud Messaging (FCM)

Implementasi awal difokuskan untuk fitur **Kotak Masuk** - setiap ada naskah yang masuk ke user, notifikasi akan muncul.

---

## 1. Database Schema

### 1.1 Tabel `fcm_token`

Menyimpan token FCM dari device user untuk push notification.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | CHAR(36) | NO | - | Primary Key (UUID) |
| `user_persnum` | INT | NO | - | Persnum user (FK ke pa_personal) |
| `token` | VARCHAR(500) | NO | - | FCM Token dari Firebase |
| `device_id` | VARCHAR(255) | NO | - | Unique device identifier |
| `platform` | ENUM('android','ios','web') | NO | - | Platform device |
| `is_active` | TINYINT(1) | NO | 1 | Status aktif token |
| `last_used_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | Terakhir digunakan |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | Waktu dibuat |

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE (`token`)
- UNIQUE (`user_persnum`, `device_id`)
- INDEX (`user_persnum`)
- INDEX (`is_active`)

---

### 1.2 Tabel `notification`

Menyimpan history notifikasi in-app.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | CHAR(36) | NO | - | Primary Key (UUID) |
| `position_id` | VARCHAR(100) | NO | - | **PRIMARY**: Position ID penerima (jabatan) |
| `user_persnum` | INT | YES | NULL | OPTIONAL: Persnum untuk push notification |
| `type` | ENUM(...) | NO | - | Tipe notifikasi |
| `title` | VARCHAR(255) | NO | - | Judul notifikasi |
| `body` | TEXT | NO | - | Isi notifikasi |
| `data` | JSON | YES | NULL | Data tambahan (naskah_id, dll) |
| `is_read` | TINYINT(1) | NO | 0 | Status sudah dibaca |
| `read_at` | TIMESTAMP | YES | NULL | Waktu dibaca |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | Waktu dibuat |

**Notification Types (Enum):**
```
NASKAH_MASUK        - Naskah masuk ke kotak masuk
NASKAH_TEMBUSAN     - Naskah tembusan
DISPOSISI           - Disposisi baru
DISPOSISI_SELESAI   - Disposisi selesai
KONSEP_DISETUJUI    - Konsep naskah disetujui
KONSEP_DITOLAK      - Konsep naskah ditolak
SYSTEM              - Notifikasi sistem
```

**Indexes:**
- PRIMARY KEY (`id`)
- INDEX (`position_id`) ← Query utama berdasarkan jabatan
- INDEX (`user_persnum`) ← Untuk push notification
- INDEX (`is_read`)
- INDEX (`type`)
- INDEX (`created_at`)

---

### 1.3 Kenapa `position_id` sebagai Primary Identifier?

| Aspek | `position_id` (Jabatan) ✅ | `persnum` (Orang) ❌ |
|-------|---------------------------|---------------------|
| **Kotak Masuk** | Naskah dikirim ke jabatan | Naskah bukan ke orang |
| **Mutasi/Rotasi** | Notifikasi tetap di jabatan | Notifikasi ikut orang (salah) |
| **Plt/Pjs** | Bisa lihat notif jabatan yg diwakili | Tidak bisa |
| **Multi-jabatan** | Notif per jabatan terpisah | Campur semua jabatan |

**Kesimpulan:**
- `notification.position_id` → Notifikasi milik **jabatan**, konsisten dengan kotak masuk
- `fcm_token.user_persnum` → Token FCM milik **orang/device**

**Flow Pengiriman:**
```
[Naskah Masuk ke position_id: "KABAG-IT"]
                ↓
[Cari siapa yang menjabat KABAG-IT saat ini → persnum: 10010229]
                ↓
[Save notification: position_id="KABAG-IT", user_persnum=10010229]
                ↓
[Kirim push ke FCM token milik persnum=10010229]
```

---

## 2. SQL Migration

```sql
-- ============================================================
-- Migration: Create Notification Tables
-- Date: 2026-01-31
-- Description: FCM Token & Notification tables for push notification
-- ============================================================

-- ============================================================
-- 1. FCM Token Table
-- Menyimpan token FCM dari device user (milik ORANG)
-- ============================================================
CREATE TABLE IF NOT EXISTS `fcm_token` (
  `id` CHAR(36) NOT NULL,
  `user_persnum` INT NOT NULL COMMENT 'Persnum user pemilik device',
  `token` VARCHAR(500) NOT NULL COMMENT 'FCM Token dari Firebase',
  `device_id` VARCHAR(255) NOT NULL COMMENT 'Unique device identifier',
  `platform` ENUM('android', 'ios', 'web') NOT NULL COMMENT 'Platform device',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Status aktif token',
  `last_used_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Terakhir digunakan',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Waktu dibuat',
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token` (`token`),
  UNIQUE KEY `uk_user_device` (`user_persnum`, `device_id`),
  INDEX `idx_user_persnum` (`user_persnum`),
  INDEX `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Menyimpan FCM token untuk push notification (milik ORANG/device)';

-- ============================================================
-- 2. Notification Table
-- Menyimpan history notifikasi in-app (milik JABATAN)
-- ============================================================
CREATE TABLE IF NOT EXISTS `notification` (
  `id` CHAR(36) NOT NULL,
  `position_id` VARCHAR(100) NOT NULL COMMENT 'PRIMARY: Position ID penerima (jabatan)',
  `user_persnum` INT NULL COMMENT 'OPTIONAL: Persnum untuk push notification',
  `type` ENUM(
    'NASKAH_MASUK',
    'NASKAH_TEMBUSAN', 
    'DISPOSISI',
    'DISPOSISI_SELESAI',
    'KONSEP_DISETUJUI',
    'KONSEP_DITOLAK',
    'SYSTEM'
  ) NOT NULL COMMENT 'Tipe notifikasi',
  `title` VARCHAR(255) NOT NULL COMMENT 'Judul notifikasi',
  `body` TEXT NOT NULL COMMENT 'Isi/pesan notifikasi',
  `data` JSON NULL COMMENT 'Data tambahan (naskah_id, nomor, dll)',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Status sudah dibaca',
  `read_at` TIMESTAMP NULL COMMENT 'Waktu dibaca',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Waktu dibuat',
  
  PRIMARY KEY (`id`),
  INDEX `idx_position_id` (`position_id`) COMMENT 'Query utama by jabatan',
  INDEX `idx_user_persnum` (`user_persnum`) COMMENT 'Untuk push notification',
  INDEX `idx_is_read` (`is_read`),
  INDEX `idx_type` (`type`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_position_read` (`position_id`, `is_read`) COMMENT 'Composite untuk unread count'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Menyimpan history notifikasi in-app (milik JABATAN)';
```

### 2.1 Perbedaan Kepemilikan Data

| Tabel | Primary Identifier | Alasan |
|-------|-------------------|--------|
| `fcm_token` | `user_persnum` | Token FCM milik **ORANG** (device fisik) |
| `notification` | `position_id` | Notifikasi milik **JABATAN** (kotak masuk) |

### 2.2 Contoh Skenario

**Skenario 1: Mutasi Jabatan**
```
Pak Budi (persnum: 10001) pindah dari Kabag IT ke Kabag HR

SEBELUM mutasi:
- Notifikasi Kabag IT → terlihat oleh Pak Budi

SESUDAH mutasi:
- Notifikasi Kabag IT → TIDAK terlihat oleh Pak Budi ✅
- Notifikasi Kabag IT → terlihat oleh pejabat baru Kabag IT ✅
- Notifikasi Kabag HR → terlihat oleh Pak Budi ✅
```

**Skenario 2: Plt/Pjs (Multi-jabatan)**
```
Bu Ani (persnum: 10002) menjabat:
- Kabag Keuangan (jabatan utama)
- Plt Kabag Umum (jabatan sementara)

Notifikasi:
- Naskah masuk ke Kabag Keuangan → terlihat di inbox Kabag Keuangan ✅
- Naskah masuk ke Kabag Umum → terlihat di inbox Kabag Umum ✅
- Push notification → dikirim ke device Bu Ani (1x per naskah) ✅
```

---

## 3. Module Structure

```
src/modules/
├── fcm/
│   ├── fcm.module.ts
│   ├── controllers/
│   │   ├── index.ts
│   │   └── fcm.controller.ts
│   ├── services/
│   │   ├── index.ts
│   │   └── fcm.service.ts
│   ├── entities/
│   │   ├── index.ts
│   │   └── fcm-token.entity.ts
│   └── dto/
│       ├── index.ts
│       └── fcm.dto.ts
│
└── notification/
    ├── notification.module.ts
    ├── controllers/
    │   ├── index.ts
    │   └── notification.controller.ts
    ├── services/
    │   ├── index.ts
    │   └── notification.service.ts
    ├── entities/
    │   ├── index.ts
    │   └── notification.entity.ts
    └── dto/
        ├── index.ts
        └── notification.dto.ts
```

---

## 4. Environment Variables

Tambahkan ke file `.env`:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

**Catatan:** 
- Dapatkan credentials dari Firebase Console > Project Settings > Service Accounts > Generate New Private Key
- Private key harus dalam format string dengan `\n` untuk newline

---

## 5. API Endpoints

### 5.1 FCM Module

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/fcm/register` | Register FCM token | JWT |
| DELETE | `/fcm/remove` | Remove FCM token (logout) | JWT |

#### POST /fcm/register
**Request Body:**
```json
{
  "token": "fcm_token_from_firebase",
  "deviceId": "unique-device-id",
  "platform": "android" // android | ios | web
}
```

**Response:**
```json
{
  "success": true,
  "message": "FCM token registered successfully",
  "data": {
    "id": "uuid",
    "deviceId": "unique-device-id",
    "platform": "android"
  }
}
```

#### DELETE /fcm/remove
**Request Body:**
```json
{
  "token": "fcm_token_to_remove",
  // atau
  "deviceId": "device-id-to-remove"
}
```

---

### 5.2 Notification Module

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/notifications` | Get all notifications (paginated) | JWT |
| GET | `/notifications/unread-count` | Get unread count | JWT |
| PATCH | `/notifications/:id/read` | Mark as read | JWT |
| PATCH | `/notifications/read-all` | Mark all as read | JWT |
| DELETE | `/notifications/:id` | Delete notification | JWT |
| DELETE | `/notifications/clear-all` | Delete all notifications | JWT |

#### GET /notifications
**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `isRead` (boolean, optional)
- `type` (NotificationType, optional)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "NASKAH_MASUK",
      "title": "Naskah Masuk Baru",
      "body": "Anda menerima nota dinas dari ...",
      "data": {
        "naskahId": "uuid",
        "jenis": "ND",
        "nomor": "ND-001/2026"
      },
      "isRead": false,
      "createdAt": "2026-01-31T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### GET /notifications/unread-count
**Response:**
```json
{
  "success": true,
  "data": {
    "count": 5
  }
}
```

---

## 6. Integration dengan Kotak Masuk

### 6.1 Trigger Notifikasi

Notifikasi dikirim ketika:
1. **Naskah baru masuk** - Insert ke `naskah_sirkulasi` dengan `sirkuler = 'penerima'`
2. **Naskah tembusan** - Insert ke `naskah_sirkulasi` dengan `sirkuler = 'tembusan'`

### 6.2 Flow Pengiriman Notifikasi

```
[User Kirim Naskah]
        ↓
[Insert naskah_sirkulasi untuk setiap penerima]
        ↓
[NotificationService.createNaskahMasukNotification()]
        ↓
    ┌───────────────────┐
    │ Save to DB        │ → notification table
    │ (In-App History)  │
    └───────────────────┘
            ↓
    ┌───────────────────┐
    │ Send Push via FCM │ → Firebase → Mobile Device
    │ (Real-time)       │
    └───────────────────┘
```

### 6.3 Data Payload untuk Naskah Masuk

```json
{
  "type": "NASKAH_MASUK",
  "title": "Naskah Masuk Baru",
  "body": "Nota Dinas dari Kepala Bagian IT - Perihal: Permintaan Server Baru",
  "data": {
    "naskahId": "uuid-naskah",
    "sirkulasiId": "uuid-sirkulasi",
    "jenis": "ND",
    "nomor": "ND-001/IT/2026",
    "perihal": "Permintaan Server Baru",
    "pengirim": "Kepala Bagian IT",
    "action": "OPEN_INBOX_DETAIL"
  }
}
```

---

## 7. TypeORM Entity Definitions

### 7.1 FcmTokenEntity

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('fcm_token')
export class FcmTokenEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('int', { name: 'user_persnum' })
  userPersnum: number;

  @Column('varchar', { length: 500 })
  token: string;

  @Column('varchar', { name: 'device_id', length: 255 })
  deviceId: string;

  @Column('enum', { enum: ['android', 'ios', 'web'] })
  platform: 'android' | 'ios' | 'web';

  @Column('tinyint', { name: 'is_active', default: 1 })
  isActive: boolean;

  @Column('timestamp', { name: 'last_used_at', default: () => 'CURRENT_TIMESTAMP' })
  lastUsedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

### 7.2 NotificationEntity

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

// Enum untuk tipe notifikasi
export enum NotificationType {
  NASKAH_MASUK = 'NASKAH_MASUK',
  NASKAH_TEMBUSAN = 'NASKAH_TEMBUSAN',
  DISPOSISI = 'DISPOSISI',
  DISPOSISI_SELESAI = 'DISPOSISI_SELESAI',
  KONSEP_DISETUJUI = 'KONSEP_DISETUJUI',
  KONSEP_DITOLAK = 'KONSEP_DITOLAK',
  SYSTEM = 'SYSTEM',
}

@Entity('notification')
export class NotificationEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  // PRIMARY: Notifikasi milik JABATAN
  @Column('varchar', { name: 'position_id', length: 100 })
  positionId: string;

  // OPTIONAL: Untuk push notification ke device
  @Column('int', { name: 'user_persnum', nullable: true })
  userPersnum: number | null;

  @Column('enum', { 
    enum: NotificationType,
    enumName: 'notification_type_enum'
  })
  type: NotificationType;

  @Column('varchar', { length: 255 })
  title: string;

  @Column('text')
  body: string;

  @Column('json', { nullable: true })
  data: Record<string, any> | null;

  @Column('tinyint', { name: 'is_read', default: 0 })
  isRead: boolean;

  @Column('timestamp', { name: 'read_at', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

### 7.3 Interface untuk Notification Data

```typescript
// Interface untuk data payload notifikasi naskah masuk
export interface NaskahMasukNotificationData {
  naskahId: string;
  sirkulasiId: string;
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';
  nomor: string | null;
  perihal: string;
  pengirim: string;
  pengirimPosition: string;
  action: 'OPEN_INBOX_DETAIL';
}

// Interface untuk data payload notifikasi disposisi
export interface DisposisiNotificationData {
  disposisiId: string;
  naskahId: string;
  instruksi: string;
  pengirim: string;
  action: 'OPEN_DISPOSISI_DETAIL';
}
```

---

## 8. Checklist Implementasi

### Phase 1: Setup Database
- [ ] Jalankan migration SQL untuk create tables
- [ ] Verifikasi tabel `fcm_token` dan `notification` terbuat

### Phase 2: FCM Module
- [ ] Create `fcm-token.entity.ts`
- [ ] Create `fcm.dto.ts`
- [ ] Create `fcm.service.ts` (init Firebase, register/remove token, send push)
- [ ] Create `fcm.controller.ts`
- [ ] Create `fcm.module.ts`
- [ ] Register di `app.module.ts`

### Phase 3: Notification Module
- [ ] Create `notification.entity.ts`
- [ ] Create `notification.dto.ts`
- [ ] Create `notification.service.ts`
- [ ] Create `notification.controller.ts`
- [ ] Create `notification.module.ts`
- [ ] Register di `app.module.ts`

### Phase 4: Integration
- [ ] Integrate dengan service pengiriman naskah
- [ ] Test kirim notifikasi saat naskah masuk
- [ ] Test push notification ke device

### Phase 5: Testing
- [ ] Test register FCM token
- [ ] Test remove FCM token
- [ ] Test get notifications
- [ ] Test mark as read
- [ ] Test push notification delivery

---

## 9. Firebase Setup Guide

1. Buka [Firebase Console](https://console.firebase.google.com/)
2. Buat project baru atau gunakan existing
3. Pergi ke **Project Settings** > **Service Accounts**
4. Klik **Generate New Private Key**
5. Download file JSON
6. Copy values berikut ke `.env`:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`

---

## 10. Mobile Client Integration

### Android (Kotlin/Java)
```kotlin
// Get FCM Token
FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
    if (task.isSuccessful) {
        val token = task.result
        // Send to backend: POST /fcm/register
    }
}
```

### iOS (Swift)
```swift
Messaging.messaging().token { token, error in
    if let token = token {
        // Send to backend: POST /fcm/register
    }
}
```

### Flutter
```dart
final fcmToken = await FirebaseMessaging.instance.getToken();
// Send to backend: POST /fcm/register
```
