-- ============================================================
-- Tabel untuk menyimpan counter nomor urut surat per tahun
-- Counter di-reset ke 1 setiap pergantian tahun (1 Januari)
-- ============================================================

CREATE TABLE IF NOT EXISTS `nomor_counter` (
  `id` VARCHAR(50) NOT NULL COMMENT 'Format: {jenis}_{jabatan}_{lokasi}_{tahun} e.g. DI_P_00_2025',
  `jenis` VARCHAR(10) NOT NULL COMMENT 'Jenis naskah: DI, ND, SDI, SDE, KA, dll',
  `jabatan` VARCHAR(10) NOT NULL COMMENT 'Kode jabatan: P, U, S, O, K, VP, M, dll',
  `lokasi` VARCHAR(10) NOT NULL COMMENT 'Kode lokasi: 00 (Pusat), 01 (Cabang), dll',
  `tahun` INT NOT NULL COMMENT 'Tahun penomoran: 2025, 2026, dll',
  `last_number` INT NOT NULL DEFAULT 0 COMMENT 'Nomor terakhir yang digunakan',
  `last_used_at` DATETIME NULL COMMENT 'Waktu terakhir nomor digunakan',
  PRIMARY KEY (`id`),
  INDEX `idx_jenis_jabatan_lokasi_tahun` (`jenis`, `jabatan`, `lokasi`, `tahun`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Contoh data counter (opsional, untuk testing)
-- ============================================================
-- INSERT INTO `nomor_counter` (`id`, `jenis`, `jabatan`, `lokasi`, `tahun`, `last_number`, `last_used_at`)
-- VALUES ('DI_P_00_2025', 'DI', 'P', '00', 2025, 0, NULL);
