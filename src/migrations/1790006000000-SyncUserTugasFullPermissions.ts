import { MigrationInterface, QueryRunner } from 'typeorm';

/** Membuka seluruh permission modul Tugas untuk role USER. */
export class SyncUserTugasFullPermissions1790006000000
  implements MigrationInterface
{
  name = 'SyncUserTugasFullPermissions1790006000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const roles = await queryRunner.query(
      `SELECT id FROM rbac_role WHERE name = 'USER' LIMIT 1`,
    );
    const roleId = roles[0]?.id as string | undefined;
    if (!roleId) return;

    const permissions = await queryRunner.query(
      `SELECT p.id
       FROM rbac_permission p
       INNER JOIN rbac_resource r ON r.id = p.resource_id
       WHERE r.name = 'tugas'`,
    );

    for (const permission of permissions as { id: string }[]) {
      await queryRunner.query(
        `INSERT IGNORE INTO rbac_role_permission
           (id, role_id, permission_id, created_at)
         VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
        [roleId, permission.id],
      );
    }
  }

  async down(): Promise<void> {
    // Assignment permission tidak dihapus otomatis saat rollback.
  }
}
