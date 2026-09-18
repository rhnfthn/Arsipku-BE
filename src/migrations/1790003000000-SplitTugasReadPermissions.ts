import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Memisahkan permission Read Papan dan Read Tugas Saya.
 *
 * Sebelumnya keduanya memakai `tugas.read`, sehingga satu checkbox RBAC
 * mengontrol dua fitur sekaligus. Permission lama dibiarkan di katalog untuk
 * menghindari masalah foreign key, tetapi tidak lagi dipakai oleh endpoint.
 */
export class SplitTugasReadPermissions1790003000000
  implements MigrationInterface
{
  name = 'SplitTugasReadPermissions1790003000000';

  private readonly readPermissions = [
    {
      action: 'read-board',
      description: 'Melihat papan dan task',
    },
    {
      action: 'read-my-tasks',
      description: 'Melihat tugas yang ditugaskan kepada saya',
    },
  ];

  private readonly allTaskPermissions = [
    'read-board',
    'read-my-tasks',
    'create-board',
    'update-board',
    'delete-board',
    'manage-members',
    'create-task',
    'update-task',
    'move-task',
    'delete-task',
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    const resourceRows = await queryRunner.query(
      `SELECT id FROM rbac_resource WHERE name = 'tugas' LIMIT 1`,
    );
    const resourceId = resourceRows[0]?.id as string | undefined;
    if (!resourceId) return;

    for (const permission of this.readPermissions) {
      const name = `tugas.${permission.action}`;
      const existing = await queryRunner.query(
        `SELECT id FROM rbac_permission WHERE name = ? LIMIT 1`,
        [name],
      );
      if (existing.length > 0) continue;

      await queryRunner.query(
        `INSERT INTO rbac_permission
           (id, name, action, description, resource_id, created_at)
         VALUES (UUID(), ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [name, permission.action, permission.description, resourceId],
      );
    }

    const permissionRows = await queryRunner.query(
      `SELECT id, name FROM rbac_permission
       WHERE resource_id = ? AND action IN (${this.allTaskPermissions.map(() => '?').join(', ')})`,
      [resourceId, ...this.allTaskPermissions],
    );
    const permissionIds = new Map<string, string>(
      permissionRows.map((permission: { id: string; name: string }) => [
        permission.name,
        permission.id,
      ]),
    );

    const roles = await queryRunner.query(
      `SELECT id, name FROM rbac_role WHERE name IN ('SUPERADMIN', 'ADMIN', 'USER')`,
    );

    for (const role of roles as { id: string; name: string }[]) {
      await queryRunner.query(
        `DELETE rp FROM rbac_role_permission rp
         INNER JOIN rbac_permission p ON p.id = rp.permission_id
         WHERE rp.role_id = ? AND p.resource_id = ?`,
        [role.id, resourceId],
      );

      const actions =
        role.name === 'SUPERADMIN'
          ? this.allTaskPermissions
          : ['read-board', 'read-my-tasks'];
      for (const action of actions) {
        const permissionId = permissionIds.get(`tugas.${action}`);
        if (!permissionId) continue;
        await queryRunner.query(
          `INSERT IGNORE INTO rbac_role_permission
             (id, role_id, permission_id, created_at)
           VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
          [role.id, permissionId],
        );
      }
    }

    // Role custom yang sebelumnya memakai tugas.read mempertahankan akses
    // baca di kedua fitur setelah pemisahan permission.
    const legacyRows = await queryRunner.query(
      `SELECT DISTINCT rp.role_id
       FROM rbac_role_permission rp
       INNER JOIN rbac_permission p ON p.id = rp.permission_id
       WHERE p.name = 'tugas.read'`,
    );
    for (const row of legacyRows as { role_id: string }[]) {
      for (const action of ['read-board', 'read-my-tasks']) {
        const permissionId = permissionIds.get(`tugas.${action}`);
        if (!permissionId) continue;
        await queryRunner.query(
          `INSERT IGNORE INTO rbac_role_permission
             (id, role_id, permission_id, created_at)
           VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
          [row.role_id, permissionId],
        );
      }
    }

    await queryRunner.query(
      `DELETE rp FROM rbac_role_permission rp
       INNER JOIN rbac_permission p ON p.id = rp.permission_id
       WHERE p.name = 'tugas.read'`,
    );
  }

  async down(): Promise<void> {
    // Permission lama sengaja tidak dipulihkan otomatis agar assignment
    // manual setelah migrasi tidak tertimpa.
  }
}
