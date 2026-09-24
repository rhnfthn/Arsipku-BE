import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Memastikan permission Tema tersedia di RBAC dan diberikan kepada
 * SUPERADMIN. Migration ini aman dijalankan pada database baru maupun lama.
 */
export class AddKonfigurasiTemaReadPermission1790009000000
  implements MigrationInterface
{
  name = 'AddKonfigurasiTemaReadPermission1790009000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO rbac_resource (id, name, description, created_at, updated_at)
       VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         description = VALUES(description),
         updated_at = CURRENT_TIMESTAMP`,
      ['konfigurasi', 'Konfigurasi sistem'],
    );

    const resource = await queryRunner.query(
      `SELECT id FROM rbac_resource WHERE name = ? LIMIT 1`,
      ['konfigurasi'],
    );
    const resourceId = resource[0]?.id;
    if (!resourceId) return;

    await queryRunner.query(
      `INSERT INTO rbac_permission
         (id, name, description, action, resource_id, created_at, updated_at)
       VALUES (UUID(), ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         description = VALUES(description),
         action = VALUES(action),
         resource_id = VALUES(resource_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        'konfigurasi.read-tema',
        'Melihat konfigurasi Tema',
        'read-tema',
        resourceId,
      ],
    );

    const superadmin = await queryRunner.query(
      `SELECT id FROM rbac_role WHERE name = ? LIMIT 1`,
      ['SUPERADMIN'],
    );
    const superadminId = superadmin[0]?.id;
    if (!superadminId) return;

    const permission = await queryRunner.query(
      `SELECT id FROM rbac_permission WHERE name = ? LIMIT 1`,
      ['konfigurasi.read-tema'],
    );
    const permissionId = permission[0]?.id;
    if (!permissionId) return;

    await queryRunner.query(
      `INSERT IGNORE INTO rbac_role_permission
         (id, role_id, permission_id, created_at)
       VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
      [superadminId, permissionId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM rbac_role_permission
       WHERE permission_id IN (
         SELECT id FROM rbac_permission WHERE name = ?
       )`,
      ['konfigurasi.read-tema'],
    );
    await queryRunner.query(
      `DELETE FROM rbac_permission WHERE name = ?`,
      ['konfigurasi.read-tema'],
    );
  }
}
