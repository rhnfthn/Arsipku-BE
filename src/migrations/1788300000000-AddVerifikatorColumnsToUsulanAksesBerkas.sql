-- 1788300000000 - Add verifikator columns to usulan_akses_berkas
-- Idempoten: hanya ADD COLUMN bila belum ada (cek information_schema).
-- Insert ke tabel migrations mencegah TypeORM menjalankan migration ini
-- lagi saat BE start (migrationsRun).

DROP PROCEDURE IF EXISTS `uab_add_verifikator_cols`;
DELIMITER $$
CREATE PROCEDURE `uab_add_verifikator_cols`() BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE()
                   AND table_name = 'usulan_akses_berkas'
                   AND column_name = 'verifikatorPengusul') THEN
    ALTER TABLE `usulan_akses_berkas`
      ADD COLUMN `verifikatorPengusul` JSON NULL COMMENT 'Konfigurasi verifikator pengusul (JSON array, auto-sort bottom-to-top)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE()
                   AND table_name = 'usulan_akses_berkas'
                   AND column_name = 'verifikatorPemberi') THEN
    ALTER TABLE `usulan_akses_berkas`
      ADD COLUMN `verifikatorPemberi` JSON NULL COMMENT 'Konfigurasi verifikator pemberi (JSON array)';
  END IF;
END$$
DELIMITER ;
CALL `uab_add_verifikator_cols`();
DROP PROCEDURE IF EXISTS `uab_add_verifikator_cols`;

INSERT INTO `migrations` (`timestamp`, `name`)
SELECT 1788300000000, 'AddVerifikatorColumnsToUsulanAksesBerkas1788300000000'
WHERE NOT EXISTS (
  SELECT 1 FROM `migrations`
  WHERE `name` = 'AddVerifikatorColumnsToUsulanAksesBerkas1788300000000'
);
