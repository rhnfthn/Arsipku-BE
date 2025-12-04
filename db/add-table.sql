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
    position_status ENUM('ybs','pt','ph','ps','se','vi','ext'),
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
    flag_arsip BOOLEAN DEFAULT 0,
    is_draft BOOLEAN DEFAULT TRUE
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
    end_date DATE DEFAULT '9999-12-31',
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

CREATE TABLE nd (
    id CHAR(36) PRIMARY KEY,
    id_naskah CHAR(36),

    -- kop naskah
    kop_logo VARCHAR(255),
    kop_nama VARCHAR(150),
    alamat_perusahaan TEXT,

    nomor VARCHAR(100),
    kepada_yth VARCHAR(255),
    dari VARCHAR(150),
    perihal TEXT,
    konten TEXT,
    nama_tempat VARCHAR(150),
    tanggal DATE,

    nama_jabatan VARCHAR(150),
    tanda_tangan VARCHAR(255),
    nama_lengkap VARCHAR(150),

    tembusan TEXT,

    -- Sirkulasi Position IDs (untuk draft - belum masuk naskah_sirkulasi)
    pengirim_position_id INT,
    penerima_position_ids TEXT,
    tembusan_position_ids TEXT,

    INDEX idx_nd_id_naskah (id_naskah)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE sdi_sde (
    id CHAR(36) PRIMARY KEY,
    id_naskah CHAR(36),

    -- kop naskah
    kop_logo VARCHAR(255),
    kop_nama VARCHAR(150),
    alamat_perusahaan TEXT,

    nama_tempat VARCHAR(150),
    tanggal DATE,
    nomor VARCHAR(100),
    sifat VARCHAR(50),
    lampiran VARCHAR(150),
    perihal TEXT,

    kepada_yth VARCHAR(255),
    nama VARCHAR(150),
    alamat TEXT,
    konten TEXT,

    nama_jabatan VARCHAR(150),
    tanda_tangan VARCHAR(255),
    nama_lengkap VARCHAR(150),

    tembusan TEXT,

    INDEX idx_sdi_sde_id_naskah (id_naskah)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE di (
    id CHAR(36) PRIMARY KEY,
    id_naskah CHAR(36),

    -- kop naskah
    kop_logo VARCHAR(255),
    kop_judul VARCHAR(150),
    nama_jabatan VARCHAR(150),

    nomor_agenda VARCHAR(100),
    tanggal_agenda DATE,
    surat_dari VARCHAR(150),
    tanggal DATE,
    nomor VARCHAR(100),
    perihal TEXT,
    klasifikasi VARCHAR(100),

    kepada_yth VARCHAR(255),
    disposisi TEXT,
    catatan TEXT,
    paraf VARCHAR(100),

    INDEX idx_di_id_naskah (id_naskah)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;


CREATE TABLE konsep (
    id CHAR(36) PRIMARY KEY,
    company VARCHAR(50),

    id_naskah CHAR(36),
    jenis ENUM('ND','SDI','SDE'),

    -- =========================
    -- FROM (PENGIRIM / KONSEPTOR / PEMERIKSA)
    -- =========================
    from_area VARCHAR(50),
    from_area_text VARCHAR(150),

    from_sub_area VARCHAR(50),
    from_sub_area_text VARCHAR(150),

    from_organization VARCHAR(100),
    from_organization_text VARCHAR(150),

    from_position VARCHAR(100),
    from_position_text VARCHAR(150),
    from_position_status ENUM('ybs','pt','ph'),

    from_id_sirkuler VARCHAR(50),        -- persnum
    from_nama_sirkuler VARCHAR(150),     -- name

    from_telepon VARCHAR(50),
    from_email VARCHAR(150),

    from_actor ENUM('konseptor','pemeriksa'),

    -- =========================
    -- TO (PENERIMA / PEMERIKSA / PENGIRIM)
    -- =========================
    to_area VARCHAR(50),
    to_area_text VARCHAR(150),

    to_sub_area VARCHAR(50),
    to_sub_area_text VARCHAR(150),

    to_organization VARCHAR(100),
    to_organization_text VARCHAR(150),

    to_position VARCHAR(100),
    to_position_text VARCHAR(150),
    to_position_status ENUM('ybs','pt','ph'),

    to_id_sirkuler VARCHAR(50),          -- persnum
    to_nama_sirkuler VARCHAR(150),       -- name

    to_telepon VARCHAR(50),
    to_email VARCHAR(150),

    to_actor ENUM('pemeriksa','pengirim'),

    -- =========================
    -- CATATAN & STATUS
    -- =========================
    catatan TEXT,

    send_read_time DATETIME,
    send_read_user VARCHAR(100),
    id_label CHAR(36),

    flag_favorit TINYINT(1) DEFAULT 0,
    flag_note TINYINT(1) DEFAULT 0,
    flag_arsip TINYINT(1) DEFAULT 0,

    create_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb3 
COLLATE=utf8mb3_general_ci;


CREATE TABLE delegasi (
    id CHAR(36) PRIMARY KEY,

    start_date DATE,
    end_date DATE DEFAULT '9999-12-31',

    company VARCHAR(50),
    company_text VARCHAR(150),

    -- =========================
    -- SEBAGAI (AS_)
    -- =========================
    as_area VARCHAR(50),
    as_area_text VARCHAR(150),

    as_sub_area VARCHAR(50),
    as_sub_area_text VARCHAR(150),

    as_organization VARCHAR(100),
    as_organization_text VARCHAR(150),

    as_position VARCHAR(100),
    as_position_text VARCHAR(150),

    as_persnum VARCHAR(50),
    as_name VARCHAR(150),

    position_status ENUM('PT','PH','PS','SE','VI'),

    -- =========================
    -- AKTUAL / REAL
    -- =========================
    area VARCHAR(50),
    area_text VARCHAR(150),

    sub_area VARCHAR(50),
    sub_area_text VARCHAR(150),

    organization VARCHAR(100),
    organization_text VARCHAR(150),

    position VARCHAR(100),
    position_text VARCHAR(150),

    persnum VARCHAR(50),
    name VARCHAR(150),

    create_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb3
COLLATE=utf8mb3_general_ci;


CREATE TABLE literatur_en (
    id CHAR(36) PRIMARY KEY,

    company VARCHAR(50),

    start_date DATE,
    end_date DATE,

    object_type ENUM('CO','PA','SA','S'),

    long_text TEXT,
    long_text_en TEXT,

    create_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb3
COLLATE=utf8mb3_general_ci;


CREATE TABLE template (
    id CHAR(36) PRIMARY KEY,

    tanggal DATE,
    nama_template VARCHAR(150),
    file VARCHAR(255),

    create_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb3
COLLATE=utf8mb3_general_ci;
