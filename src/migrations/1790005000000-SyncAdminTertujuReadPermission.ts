import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin hanya memiliki akses baca untuk halaman Tertuju.
 * Permission master-data lain tetap tersedia untuk SUPERADMIN, tetapi tidak
 * boleh ikut terpasang pada role ADMIN.
 */
export class SyncAdminTertujuReadPermission1790005000000
  implements MigrationInterface
{
  name = 'SyncAdminTertujuReadPermission1790005000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const roles = await queryRunner.query(
      `SELECT id FROM rbac_role WHERE name = 'ADMIN' LIMIT 1`,
    );
    const roleId = roles[0]?.id as string | undefined;
    if (!roleId) return;

    const permissions = await queryRunner.query(
      `SELECT p.id, p.name
       FROM rbac_permission p
       INNER JOIN rbac_resource r ON r.id = p.resource_id
       WHERE r.name = 'master-data'`,
    );
    if (!permissions.length) return;

    await queryRunner.query(
      `DELETE rp FROM rbac_role_permission rp
       INNER JOIN rbac_permission p ON p.id = rp.permission_id
       INNER JOIN rbac_resource r ON r.id = p.resource_id
       WHERE rp.role_id = ? AND r.name = 'master-data'`,
      [roleId],
    );

    const readPermission = permissions.find(
      (permission: { id: string; name: string }) =>
        permission.name === 'master-data.read-tertuju',
    );
    if (!readPermission) return;

    await queryRunner.query(
      `INSERT IGNORE INTO rbac_role_permission
         (id, role_id, permission_id, created_at)
       VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
      [roleId, readPermission.id],
    );
  }

  async down(): Promise<void> {
    // Assignment manual tidak dipulihkan otomatis.
  }
}
