import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Menghapus tabel tema statis yang digantikan oleh config_special_theme.
 * Object gambar pada MinIO tidak ikut dihapus dan tetap dapat digunakan ulang.
 */
export class DropLegacyThemeTables1790701000000 implements MigrationInterface {
  name = 'DropLegacyThemeTables1790701000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `config_theme_template`');
    await queryRunner.query('DROP TABLE IF EXISTS `config_theme`');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`config_theme\` (
        \`id\` char(36) NOT NULL,
        \`landing_background_key\` varchar(500) NULL,
        \`dashboard_background_key\` varchar(500) NULL,
        \`updated_by\` int NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`config_theme_template\` (
        \`id\` char(36) NOT NULL,
        \`target\` varchar(20) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`storage_key\` varchar(500) NOT NULL,
        \`is_system\` tinyint NOT NULL DEFAULT 0,
        \`created_by\` int NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_config_theme_template_target_key\` (\`target\`, \`storage_key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
}
