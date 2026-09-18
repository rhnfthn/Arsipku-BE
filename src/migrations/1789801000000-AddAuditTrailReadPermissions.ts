import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Memecah akses Audit Trail per submenu tanpa mengubah permission lama.
 * Assignment role selain SUPERADMIN sengaja tidak disentuh.
 */
export class AddAuditTrailReadPermissions1789801000000
  implements MigrationInterface
{
  name = 'AddAuditTrailReadPermissions1789801000000';

  private readonly permissions = [
    {
      action: 'read-log',
      description: 'Melihat log aktivitas audit',
    },
    {
      action: 'read-anomaly',
      description: 'Melihat anomali dan alert audit',
    },
    {
      action: 'read-report',
      description: 'Melihat ringkasan dan laporan audit',
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const roleRows = await queryRunner.query(
      `SELECT id FROM rbac_role WHERE name = ? LIMIT 1`,
      ['SUPERADMIN'],
    );
    const superadminId = roleRows[0]?.id;

    await queryRunner.query(
      `INSERT INTO rbac_resource
         (id, name, description, created_at, updated_at)
       VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         updated_at = CURRENT_TIMESTAMP`,
      ['audit', 'Audit Trail dan laporan audit (Superadmin)'],
    );

    const resourceRows = await queryRunner.query(
      `SELECT id FROM rbac_resource WHERE name = ? LIMIT 1`,
      ['audit'],
    );
    const resourceId = resourceRows[0]?.id;
    if (!resourceId) return;

    for (const item of this.permissions) {
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
          `audit.${item.action}`,
          item.description,
          item.action,
          resourceId,
        ],
      );

      if (!superadminId) continue;

      const permissionRows = await queryRunner.query(
        `SELECT id FROM rbac_permission WHERE name = ? LIMIT 1`,
        [`audit.${item.action}`],
      );
      const permissionId = permissionRows[0]?.id;
      if (!permissionId) continue;

      await queryRunner.query(
        `INSERT IGNORE INTO rbac_role_permission
           (id, role_id, permission_id, created_at)
         VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
        [superadminId, permissionId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const item of this.permissions) {
      const name = `audit.${item.action}`;
      await queryRunner.query(
        `DELETE FROM rbac_role_permission
         WHERE permission_id IN (
           SELECT id FROM rbac_permission WHERE name = ?
         )`,
        [name],
      );
      await queryRunner.query(`DELETE FROM rbac_permission WHERE name = ?`, [name]);
    }
  }
}
