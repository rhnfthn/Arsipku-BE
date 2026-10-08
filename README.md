<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
   <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>

# Arsipku Backend

Sistem manajemen surat dan arsip digital dengan fitur lengkap untuk pengelolaan naskah dinas, disposisi, dan tanda tangan digital.

## Tentang Aplikasi

Arsipku adalah aplikasi untuk mengelola:
- 📨 **Surat Masuk & Keluar** - Nota Dinas, Surat Dinas Internal/Eksternal
- 📋 **Disposisi** - Instruksi dan delegasi surat
- ✍️ **Digital Signature** - Tanda tangan digital untuk dokumen
- 📝 **Konsep Surat** - Workflow approval draft surat
- 📊 **Dashboard** - Monitoring dan statistik surat

## Persiapan Awal

Pastikan sudah terinstall:
- **Node.js** versi 18 atau lebih baru ([Download](https://nodejs.org))
- **MySQL** atau **MariaDB** ([Download](https://dev.mysql.com/downloads/))
- **Git** (optional, untuk clone repository)

## Cara Instalasi

### 1. Clone atau Download Project
```bash
git clone <repository-url>
cd arsipku-be
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Database
- Buat database baru di MySQL:
  ```sql
  CREATE DATABASE navmail;
  ```
- Import file SQL yang ada di folder `db/`:
  ```bash
  mysql -u root -p navmail < db/nav-mailku.sql
  ```

### 4. Konfigurasi Environment
Buat file `.env` di root project dan isi dengan:
```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=navmail

# App
PORT=3000
NODE_ENV=development

# JWT Secret (untuk authentication)
JWT_SECRET=your_secret_key_here
```

### 5. Jalankan Aplikasi
```bash
# Development mode (auto-reload)
npm run start:dev

# Production mode
npm run start:prod
```

Aplikasi akan berjalan di `http://localhost:3000`

## Fitur Utama

### API Endpoints
- `GET /dashboard` - Dashboard dengan statistik lengkap
- `POST /auth/login` - Login user
- `GET /naskah` - List surat/naskah
- `GET /digsig` - Dokumen tanda tangan digital
- `GET /disposisi` - List disposisi

### Dashboard Summary
Dashboard menyediakan informasi:
- Total pesan masuk & belum dibaca
- Dokumen yang menunggu tanda tangan
- Disposisi yang perlu diproses
- Konsep yang perlu direview
- Statistik bulanan dan per jenis surat

## Troubleshooting

**Error koneksi database:**
- Pastikan MySQL/MariaDB sudah running
- Cek username, password, dan nama database di file `.env`

**Port sudah digunakan:**
- Ganti PORT di file `.env` ke port lain (misal: 3001)

**Module not found:**
- Jalankan ulang `npm install`

## Dokumentasi Lengkap

Untuk informasi lebih detail tentang NestJS framework:
- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)

## Struktur Folder

```
arsipku-be/
├── src/
│   ├── modules/          # Modul fitur (auth, naskah, digsig, dll)
│   ├── common/           # Utilities, guards, interceptors
│   └── main.ts           # Entry point aplikasi
├── db/                   # SQL migrations dan database schema
├── storage/              # File upload storage
└── .env                  # Konfigurasi environment (buat sendiri)
```

## Pengembangan

```bash
# Install dependencies
npm install

# Jalankan development server
npm run start:dev

# Build untuk production
npm run build

# Jalankan tests
npm run test
```

## Tech Stack

- **Framework:** NestJS (Node.js)
- **Database:** MySQL/MariaDB
- **ORM:** TypeORM
- **Authentication:** JWT
- **Language:** TypeScript

---


### Enkripsi pesan forum Tugas

Kolom `tugas_task_comment.isi` memakai AES-256-GCM (nonce acak per pesan,
 authentication tag, envelope versi `tugas-chat:v1`). TypeORM mengenkripsi saat
 menulis dan mendekripsi saat membaca; API dan mention tetap memakai teks asli.
 Ini enkripsi penyimpanan oleh backend, bukan end-to-end encryption.

Set `TUGAS_COMMENT_ENCRYPTION_KEY` ke 32 byte acak dalam format 64 karakter hex
(lihat `.env.example`). Gunakan kunci yang sama pada seluruh instance backend,
simpan salinannya di secret manager/backup terpisah dari database, dan muat ulang
backend setelah konfigurasi berubah. Tanpa kunci yang valid, penulisan gagal;
kunci yang hilang atau diganti tidak bisa membuka pesan terenkripsi sebelumnya.
Jangan mengganti kunci tanpa migrasi seluruh ciphertext.

Jalankan `npm run tugas:encrypt-comments` setelah kunci terpasang untuk mengenkripsi
pesan lama. Backfill hanya menyentuh kolom isi, memakai transaksi, dan bisa diulang
(tidak mengenkripsi ulang ciphertext; kunci diverifikasi). Teks lama masih bisa
dibaca selama transisi. Audit baru tidak menyalin isi pesan forum. Backfill ini tidak
mengubah salinan audit historis maupun backup database lama.
