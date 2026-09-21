import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Menyamakan baseline permission Tugas dengan menu yang benar-benar tersedia.
 *
 * ADMIN/USER hanya memperoleh akses baca untuk Papan dan Tugas Saya.
 * Aksi create/update/delete/manage-members tetap dapat diberikan secara
 * eksplisit melalui editor RBAC oleh Super Admin.
 */
export class SyncTugasRolePermissions1790002000000
  implements MigrationInterface
{
  name = 'SyncTugasRolePermissions1790002000000';

  private readonly rolePermissions: Record<'SUPERADMIN' | 'ADMIN' | 'USER', string[]> = {
    SUPERADMIN: [
      'tugas.read-board',
      'tugas.read-my-tasks',
      'tugas.create-board',
      'tugas.update-board',
      'tugas.delete-board',
      'tugas.manage-members',
      'tugas.create-task',
      'tugas.update-task',
      'tugas.move-task',
      'tugas.delete-task',
    ],
    ADMIN: ['tugas.read-board', 'tugas.read-my-tasks'],
    USER: ['tugas.read-board', 'tugas.read-my-tasks'],
  };

  async up(queryRunner: QueryRunner): Promise<void> {
    const roles = await queryRunner.query(
      `SELECT id, name FROM rbac_role WHERE name IN ('SUPERADMIN', 'ADMIN', 'USER')`,
    );
    const roleIds = new Map<string, string>(
      roles.map((role: { id: string; name: string }) => [role.name, role.id]),
    );

    const permissions = await queryRunner.query(
      `SELECT p.id, p.name
       FROM rbac_permission p
       INNER JOIN rbac_resource r ON r.id = p.resource_id
       WHERE r.name = 'tugas'`,
    );
    const permissionIds = new Map<string, string>(
      permissions.map((permission: { id: string; name: string }) => [
        permission.name,
        permission.id,
      ]),
    );

    for (const roleName of ['SUPERADMIN', 'ADMIN', 'USER'] as const) {
      const roleId = roleIds.get(roleName);
      if (!roleId) continue;

      await queryRunner.query(
        `DELETE rp FROM rbac_role_permission rp
         INNER JOIN rbac_permission p ON p.id = rp.permission_id
         INNER JOIN rbac_resource r ON r.id = p.resource_id
         WHERE rp.role_id = ? AND r.name = 'tugas'`,
        [roleId],
      );

      for (const permissionName of this.rolePermissions[roleName]) {
        const permissionId = permissionIds.get(permissionName);
        if (!permissionId) continue;
        await queryRunner.query(
          `INSERT IGNORE INTO rbac_role_permission
             (id, role_id, permission_id, created_at)
           VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
          [roleId, permissionId],
        );
      }
    }

  }

  async down(): Promise<void> {
    // Assignment matrix bersifat konfigurasi; rollback tidak menghapus
    // katalog permission maupun assignment manual lainnya.
  }
}
