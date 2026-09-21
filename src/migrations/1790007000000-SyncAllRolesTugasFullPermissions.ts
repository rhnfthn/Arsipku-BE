import { MigrationInterface, QueryRunner } from 'typeorm';

/** Membuka seluruh permission modul Tugas untuk semua role RBAC. */
export class SyncAllRolesTugasFullPermissions1790007000000
  implements MigrationInterface
{
  name = 'SyncAllRolesTugasFullPermissions1790007000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const roles = await queryRunner.query(`SELECT id FROM rbac_role`);
    const permissions = await queryRunner.query(
      `SELECT p.id
       FROM rbac_permission p
       INNER JOIN rbac_resource r ON r.id = p.resource_id
       WHERE r.name = 'tugas'`,
    );

    for (const role of roles as { id: string }[]) {
      for (const permission of permissions as { id: string }[]) {
        await queryRunner.query(
          `INSERT IGNORE INTO rbac_role_permission
             (id, role_id, permission_id, created_at)
           VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
          [role.id, permission.id],
        );
      }
    }
  }

  async down(): Promise<void> {
    // Assignment permission tidak dihapus otomatis saat rollback.
  }
}
