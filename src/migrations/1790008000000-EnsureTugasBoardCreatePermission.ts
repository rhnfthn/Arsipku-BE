import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureTugasBoardCreatePermission1790008000000
  implements MigrationInterface
{
  name = 'EnsureTugasBoardCreatePermission1790008000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT role.id AS role_id, permission.id AS permission_id
       FROM rbac_role role
       INNER JOIN rbac_resource resource ON resource.name = 'tugas'
       INNER JOIN rbac_permission permission
         ON permission.resource_id = resource.id
        AND permission.name IN ('tugas.read-board', 'tugas.create-board')
       WHERE role.name IN ('USER', 'ADMIN', 'SUPERADMIN')`,
    );

    for (const row of rows as { role_id: string; permission_id: string }[]) {
      await queryRunner.query(
        `INSERT IGNORE INTO rbac_role_permission
           (id, role_id, permission_id, created_at)
         VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
        [row.role_id, row.permission_id],
      );
    }
  }

  async down(): Promise<void> {}
}
