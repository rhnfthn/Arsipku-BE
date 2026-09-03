import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSdeMasalFolder1788400000000 implements MigrationInterface {
  name = 'CreateSdeMasalFolder1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sde_masal_folder'))) {
      await queryRunner.query(`
        CREATE TABLE \`sde_masal_folder\` (
          \`id\` char(36) NOT NULL,
          \`judul\` varchar(255) NOT NULL,
          \`parent_naskah_id\` char(36) NULL,
          \`tanggal\` date NULL,
          \`klasifikasi\` varchar(50) NULL,
          \`klasifikasi_text\` varchar(100) NULL,
          \`pengirim_id\` varchar(100) NULL,
          \`pengirim_name\` varchar(255) NULL,
          \`sifat\` varchar(50) NULL,
          \`atas_nama\` varchar(150) NULL,
          \`atas_nama_position_id\` varchar(50) NULL,
          \`skema_template\` varchar(100) NULL,
          \`versi_template\` varchar(100) NULL,
          \`konten_template\` text NULL,
          \`dynamic_variables\` text NULL,
          \`original_file_url\` text NULL,
          \`sign_option\` varchar(20) NULL,
          \`status\` varchar(20) NOT NULL DEFAULT 'DRAFT',
          \`total_items\` int NOT NULL DEFAULT 0,
          \`total_terkirim\` int NOT NULL DEFAULT 0,
          \`total_ditolak\` int NOT NULL DEFAULT 0,
          \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_sde_masal_folder_status\` (\`status\`),
          INDEX \`idx_sde_masal_folder_tanggal\` (\`tanggal\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await queryRunner.hasColumn('sde_masal', 'folder_id'))) {
      await queryRunner.query(
        'ALTER TABLE `sde_masal` ADD COLUMN `folder_id` char(36) NULL AFTER `concept_id`, ADD INDEX `idx_sde_masal_folder` (`folder_id`)',
      );
    }
    if (!(await queryRunner.hasColumn('sde_masal', 'recipient_data'))) {
      await queryRunner.query(
        'ALTER TABLE `sde_masal` ADD COLUMN `recipient_data` text NULL AFTER `folder_id`',
      );
    }

    // Menjaga data lama tetap dapat ditelusuri tanpa menghapus concept_id.
    if (await queryRunner.hasColumn('sde_masal', 'concept_id')) {
      await queryRunner.query(
        'UPDATE `sde_masal` SET `folder_id` = `concept_id` WHERE `folder_id` IS NULL AND `concept_id` IS NOT NULL',
      );
      await queryRunner.query(`
        INSERT IGNORE INTO \`sde_masal_folder\` (
          \`id\`, \`judul\`, \`parent_naskah_id\`, \`tanggal\`, \`klasifikasi\`,
          \`klasifikasi_text\`, \`pengirim_id\`, \`pengirim_name\`, \`sifat\`,
          \`skema_template\`, \`versi_template\`, \`konten_template\`, \`status\`,
          \`total_items\`, \`total_terkirim\`, \`total_ditolak\`, \`created_at\`, \`updated_at\`
        )
        SELECT
          \`concept_id\`,
          CONCAT('SDE Massal - ', DATE_FORMAT(COALESCE(MIN(\`tanggal_konsep\`), CURDATE()), '%d %b %Y')),
          MAX(\`parent_naskah_id\`), MIN(\`tanggal_konsep\`),
          SUBSTRING_INDEX(MAX(\`klasifikasi_name\`), ' - ', 1),
          CASE WHEN MAX(\`klasifikasi_name\`) LIKE '% - %'
            THEN SUBSTRING(MAX(\`klasifikasi_name\`), LOCATE(' - ', MAX(\`klasifikasi_name\`)) + 3)
            ELSE MAX(\`klasifikasi_name\`) END,
          MAX(\`pengirim_id\`), MAX(\`pengirim_name\`), MAX(\`sifat_surat\`),
          MAX(\`skema_template\`), MAX(\`versi_template\`), MAX(\`isi_ringkasan\`),
          CASE
            WHEN SUM(\`status_verifikasi\` = 'TERKIRIM') = SUM(\`perihal\` <> '__CONCEPT__') THEN 'TERKIRIM'
            WHEN SUM(\`status_verifikasi\` = 'DITOLAK') = SUM(\`perihal\` <> '__CONCEPT__') THEN 'DITOLAK'
            WHEN SUM(\`status_verifikasi\` = 'MENUNGGU_VERIFIKASI') > 0 THEN 'MENUNGGU_VERIFIKASI'
            ELSE 'DRAFT' END,
          SUM(\`perihal\` <> '__CONCEPT__'),
          SUM(\`status_verifikasi\` = 'TERKIRIM'),
          SUM(\`status_verifikasi\` = 'DITOLAK'),
          MIN(\`created_at\`), MAX(\`updated_at\`)
        FROM \`sde_masal\`
        WHERE \`concept_id\` IS NOT NULL
        GROUP BY \`concept_id\`
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('sde_masal', 'recipient_data')) {
      await queryRunner.query(
        'ALTER TABLE `sde_masal` DROP COLUMN `recipient_data`',
      );
    }
    if (await queryRunner.hasColumn('sde_masal', 'folder_id')) {
      await queryRunner.query(
        'ALTER TABLE `sde_masal` DROP COLUMN `folder_id`',
      );
    }
    if (await queryRunner.hasTable('sde_masal_folder')) {
      await queryRunner.dropTable('sde_masal_folder');
    }
  }
}
