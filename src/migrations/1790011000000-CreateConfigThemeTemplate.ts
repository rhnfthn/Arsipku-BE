import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConfigThemeTemplate1790011000000 implements MigrationInterface {
  name = 'CreateConfigThemeTemplate1790011000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('config_theme_template')) return;

    await queryRunner.query(`
      CREATE TABLE \`config_theme_template\` (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('config_theme_template')) {
      await queryRunner.query('DROP TABLE `config_theme_template`');
    }
  }
}
