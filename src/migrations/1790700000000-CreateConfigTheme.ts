import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConfigTheme1790700000000 implements MigrationInterface {
  name = 'CreateConfigTheme1790700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE config_special_theme (
        id char(36) NOT NULL,
        name varchar(100) NOT NULL,
        slug varchar(100) NOT NULL,
        image_key varchar(255) NOT NULL,
        description varchar(500) NULL,
        start_date date NULL,
        end_date date NULL,
        repeat_yearly tinyint NOT NULL DEFAULT 0,
        is_enabled tinyint NOT NULL DEFAULT 1,
        manual_override tinyint NULL,
        priority int NOT NULL DEFAULT 0,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX UQ_config_special_theme_name (name),
        UNIQUE INDEX UQ_config_special_theme_slug (slug),
        UNIQUE INDEX UQ_config_special_theme_manual_override (manual_override),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
    `);

    const superadmin = await queryRunner.query(
      `SELECT id FROM rbac_role WHERE name = ? LIMIT 1`,
      ['SUPERADMIN'],
    );
    await queryRunner.query(
      `INSERT INTO rbac_resource (id, name, description, created_at, updated_at)
       VALUES (UUID(), 'konfigurasi', 'Konfigurasi sistem', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
    );
    const resource = await queryRunner.query(
      `SELECT id FROM rbac_resource WHERE name = 'konfigurasi' LIMIT 1`,
    );
    const resourceId = resource[0]?.id;
    if (resourceId) {
      await queryRunner.query(
        `INSERT INTO rbac_permission
           (id, name, description, action, resource_id, created_at, updated_at)
         VALUES (UUID(), 'konfigurasi.read-tema', 'Melihat konfigurasi tema', 'read-tema', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE description = VALUES(description), resource_id = VALUES(resource_id), updated_at = CURRENT_TIMESTAMP`,
        [resourceId],
      );
      const permission = await queryRunner.query(
        `SELECT id FROM rbac_permission WHERE name = 'konfigurasi.read-tema' LIMIT 1`,
      );
      if (superadmin[0]?.id && permission[0]?.id) {
        await queryRunner.query(
          `INSERT IGNORE INTO rbac_role_permission (id, role_id, permission_id, created_at)
           VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
          [superadmin[0].id, permission[0].id],
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM rbac_role_permission WHERE permission_id IN
       (SELECT id FROM rbac_permission WHERE name = 'konfigurasi.read-tema')`,
    );
    await queryRunner.query(
      `DELETE FROM rbac_permission WHERE name = 'konfigurasi.read-tema'`,
    );
    await queryRunner.query(`DROP TABLE config_special_theme`);
  }
}
