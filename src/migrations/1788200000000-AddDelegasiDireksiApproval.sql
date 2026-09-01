-- 1788200000000 - Add delegasi direksi columns to naskah_lainnya_approval
-- Idempoten: hanya ADD COLUMN bila belum ada (cek information_schema).

DROP PROCEDURE IF EXISTS `nl_add_delegasi_cols`;
DELIMITER $$
CREATE PROCEDURE `nl_add_delegasi_cols`() BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE()
                   AND table_name = 'naskah_lainnya_approval'
                   AND column_name = 'delegate_persnum') THEN
    ALTER TABLE `naskah_lainnya_approval`
      ADD COLUMN `delegate_persnum` INT NULL,
      ADD COLUMN `delegate_name` VARCHAR(255) NULL,
      ADD COLUMN `delegate_position_status` VARCHAR(8) NULL,
      ADD COLUMN `assigned_by_persnum` INT NULL,
      ADD COLUMN `assigned_at` DATETIME NULL;
  END IF;
END$$
DELIMITER ;
CALL `nl_add_delegasi_cols`();
DROP PROCEDURE IF EXISTS `nl_add_delegasi_cols`;

INSERT INTO `migrations` (`timestamp`, `name`)
SELECT 1788200000000, 'AddDelegasiDireksiApproval1788200000000'
WHERE NOT EXISTS (
  SELECT 1 FROM `migrations`
  WHERE `name` = 'AddDelegasiDireksiApproval1788200000000'
);
