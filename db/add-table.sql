SET NAMES utf8mb3;
SET FOREIGN_KEY_CHECKS = 0;

-- ===========================================================
-- 1. label
-- ===========================================================
CREATE TABLE label (
    id CHAR(36) PRIMARY KEY,
    persnum VARCHAR(50),
    nama VARCHAR(150),
    deskripsi TEXT,
    id_parent CHAR(36),
    aktif BOOLEAN DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- ===========================================================
-- 2. grup_penerima
-- ===========================================================
CREATE TABLE grup_penerima (
    id CHAR(36) PRIMARY KEY,
    company VARCHAR(50),
    area VARCHAR(50),
    nama VARCHAR(150),
    deskripsi TEXT,
    deskripsi_english TEXT,
    urutan INT,
    aktif BOOLEAN DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- ===========================================================
-- 3. grup_penerima_detail
-- ===========================================================
CREATE TABLE grup_penerima_detail (
    id CHAR(36) PRIMARY KEY,
    id_grup_penerima CHAR(36),
    position VARCHAR(150)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- ===========================================================
-- 4. naskah
-- ===========================================================
CREATE TABLE naskah (
    id CHAR(36) PRIMARY KEY,
    jenis ENUM('ND','SDI','SDE','DI','KA'),
    klasifikasi VARCHAR(50),
    klasifikasi_text VARCHAR(100),
    sifat ENUM('sangat_rahasia','rahasia','terbatas','biasa','terbuka'),
    nomor VARCHAR(100),
    tanggal DATE,
    lampiran VARCHAR(100),
    perihal TEXT,
    konten TEXT,
    tempat VARCHAR(100),
    status ENUM('draf','final','final_tte'),
    final_pdf VARCHAR(255),
    english BOOLEAN DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- ===========================================================
-- 5. naskah_lampiran
-- ===========================================================
CREATE TABLE naskah_lampiran (
    id CHAR(36) PRIMARY KEY,
    id_naskah CHAR(36),
    file_name VARCHAR(255),
    file_pdf VARCHAR(255),
    jenis ENUM('ND','SDI','SDE','DI','KA')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- ===========================================================
-- 6. naskah_referensi
-- ===========================================================
CREATE TABLE naskah_referensi (
    id CHAR(36) PRIMARY KEY,
    id_naskah CHAR(36),
    ref_jenis ENUM('ND','SDI','SDE'),
    ref_pengirim VARCHAR(150),
    ref_tanggal DATE,
    ref_nomor VARCHAR(100),
    ref_perihal TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- ===========================================================
-- 7. naskah_sirkulasi
-- ===========================================================
CREATE TABLE naskah_sirkulasi (
    id CHAR(36) PRIMARY KEY,
    id_naskah CHAR(36),
    sirkuler ENUM('pengirim','penerima','tembusan'),
    company VARCHAR(50),
    company_text VARCHAR(100),
    area VARCHAR(50),
    area_text VARCHAR(100),
    sub_area VARCHAR(50),
    sub_area_text VARCHAR(100),
    organization VARCHAR(100),
    organization_text VARCHAR(150),
    position VARCHAR(100),
    position_text VARCHAR(150),
    position_status ENUM('pyb','pt','ph','ext'),
    id_sirkuler CHAR(36),
    nama_sirkuler VARCHAR(150),
    alamat VARCHAR(255),
    telepon VARCHAR(50),
    email VARCHAR(150),

    id_grup_penerima CHAR(36),
    send_read_time DATETIME,
    send_read_user VARCHAR(100),

    id_label CHAR(36),

    flag_favorit BOOLEAN DEFAULT 0,
    flag_note BOOLEAN DEFAULT 0,
    flag_arsip BOOLEAN DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- ===========================================================
-- 8. eksternal
-- ===========================================================
CREATE TABLE eksternal (
    id CHAR(36) PRIMARY KEY,
    company VARCHAR(50),
    area VARCHAR(50),
    nama VARCHAR(150),
    alamat TEXT,
    telepon VARCHAR(50),
    email VARCHAR(150),
    kontak VARCHAR(150),
    aktif BOOLEAN DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- ===========================================================
-- 9. klasifikasi
-- ===========================================================
CREATE TABLE klasifikasi (
    id CHAR(36) PRIMARY KEY,
    company VARCHAR(50),
    klasifikasi VARCHAR(50),
    aktif BOOLEAN DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- ===========================================================
-- 10. sub_area_alamat
-- ===========================================================
CREATE TABLE sub_area_alamat (
    id CHAR(36) PRIMARY KEY,
    start_date DATE,
    end_date DATE,
    company VARCHAR(50),
    area VARCHAR(50),
    sub_area VARCHAR(50),
    kantor VARCHAR(100),
    kantor_english VARCHAR(100),
    gedung VARCHAR(100),
    gedung_english VARCHAR(100),
    alamat TEXT,
    alamat_english TEXT,
    telepon VARCHAR(50),
    logo VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- ===========================================================
-- 11. disposisi_item
-- ===========================================================
CREATE TABLE disposisi_item (
    id CHAR(36) PRIMARY KEY,
    company VARCHAR(50),
    nama VARCHAR(150),
    urutan INT,
    aktif BOOLEAN DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

SET FOREIGN_KEY_CHECKS = 1;
