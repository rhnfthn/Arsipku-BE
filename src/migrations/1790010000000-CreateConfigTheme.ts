import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConfigTheme1790010000000 implements MigrationInterface {
  name = 'CreateConfigTheme1790010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('config_theme')) return;

    await queryRunner.query(`
      CREATE TABLE \`config_theme\` (
        \`id\` char(36) NOT NULL,
        \`landing_background_key\` varchar(500) NULL,
        \`dashboard_background_key\` varchar(500) NULL,
        \`updated_by\` int NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('config_theme')) {
      await queryRunner.query('DROP TABLE `config_theme`');
    }
  }
}
