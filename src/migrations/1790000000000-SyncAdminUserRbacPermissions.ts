import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Menyamakan permission endpoint dengan katalog RBAC tanpa memperluas akses
 * ADMIN/USER secara otomatis.
 *
 * Permission baru hanya diberikan ke SUPERADMIN. Admin/User tetap mengikuti
 * assignment yang sudah ditentukan sebelumnya atau diubah eksplisit melalui
 * halaman RBAC.
 */
export class SyncAdminUserRbacPermissions1790000000000
  implements MigrationInterface
{
  name = 'SyncAdminUserRbacPermissions1790000000000';

  private readonly permissions = [
    ['master-data', 'Membuat data master', 'create'],
    ['master-data', 'Melihat data master', 'read'],
    ['master-data', 'Mengubah data master', 'update'],
    ['master-data', 'Menghapus data master', 'delete'],
    ['konfigurasi', 'Membuat konfigurasi', 'create'],
    ['konfigurasi', 'Menghapus konfigurasi', 'delete'],
    ['sde-masal', 'Membuat pengajuan SDE Massal', 'create'],
    ['sde-masal', 'Mengubah pengajuan SDE Massal', 'update'],
    ['sde-masal', 'Memfinalisasi SDE Massal', 'finalize'],
    ['sde-masal', 'Menghapus SDE Massal', 'delete'],
    ['titelatur', 'Membuat titelatur', 'create'],
    ['titelatur', 'Mengubah titelatur', 'update'],
    ['titelatur', 'Menghapus titelatur', 'delete'],
    ['penomoran', 'Melihat laporan penomoran', 'report'],
    ['penyingkat-tautan', 'Export daftar tautan', 'export'],
    ['correspondence-routing', 'Melihat konfigurasi routing', 'read'],
    ['correspondence-routing', 'Membuat role routing', 'create-role'],
    ['correspondence-routing', 'Mengubah role routing', 'update-role'],
    ['correspondence-routing', 'Menghapus role routing', 'delete-role'],
    ['correspondence-routing', 'Mengelola anggota routing', 'manage-members'],
    ['correspondence-routing', 'Membuat rule routing', 'create-rule'],
    ['correspondence-routing', 'Mengaktifkan rule routing', 'activate-rule'],
    ['correspondence-routing', 'Mengubah rule routing', 'update-rule'],
    ['correspondence-routing', 'Menghapus rule routing', 'delete-rule'],
    ['correspondence-routing', 'Preview routing', 'preview'],
    ['correspondence-routing', 'Melihat health routing', 'read-health'],
  ] as const;

  private async upsertPermission(
    queryRunner: QueryRunner,
    resource: string,
    description: string,
    action: string,
  ): Promise<string | undefined> {
    await queryRunner.query(
      `INSERT INTO rbac_resource (id, name, description, created_at, updated_at)
       VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         description = VALUES(description),
         updated_at = CURRENT_TIMESTAMP`,
      [resource, `RBAC resource ${resource}`],
    );

    const resourceRows = await queryRunner.query(
      `SELECT id FROM rbac_resource WHERE name = ? LIMIT 1`,
      [resource],
    );
    const resourceId = resourceRows[0]?.id;
    if (!resourceId) return undefined;

    await queryRunner.query(
      `INSERT INTO rbac_permission
         (id, name, description, action, resource_id, created_at, updated_at)
       VALUES (UUID(), ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         description = VALUES(description),
         action = VALUES(action),
         resource_id = VALUES(resource_id),
         updated_at = CURRENT_TIMESTAMP`,
      [`${resource}.${action}`, description, action, resourceId],
    );

    const permissionRows = await queryRunner.query(
      `SELECT id FROM rbac_permission WHERE name = ? LIMIT 1`,
      [`${resource}.${action}`],
    );
    return permissionRows[0]?.id;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const roles = await queryRunner.query(
      `SELECT id, name FROM rbac_role WHERE name IN ('SUPERADMIN', 'ADMIN', 'USER')`,
    );
    const roleIds = new Map<string, string>(
      roles.map((role: { id: string; name: string }) => [role.name, role.id]),
    );

    for (const [resource, description, action] of this.permissions) {
      const permissionId = await this.upsertPermission(
        queryRunner,
        resource,
        description,
        action,
      );
      if (!permissionId) continue;

      const targetRoles = ['SUPERADMIN'];
      for (const roleName of targetRoles) {
        const roleId = roleIds.get(roleName);
        if (!roleId) continue;
        await queryRunner.query(
          `INSERT IGNORE INTO rbac_role_permission
             (id, role_id, permission_id, created_at)
           VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP)`,
          [roleId, permissionId],
        );
      }
    }

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [resource, , action] of this.permissions) {
      const permissionName = `${resource}.${action}`;
      await queryRunner.query(
        `DELETE FROM rbac_role_permission
         WHERE permission_id IN (
           SELECT id FROM rbac_permission WHERE name = ?
         )`,
        [permissionName],
      );
      await queryRunner.query(
        `DELETE FROM rbac_permission WHERE name = ?`,
        [permissionName],
      );
    }
  }
}
