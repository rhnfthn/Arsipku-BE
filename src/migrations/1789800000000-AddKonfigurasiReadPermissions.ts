import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Menambahkan permission Read per fitur Konfigurasi Sistem.
 *
 * Migration ini sengaja hanya melakukan upsert resource/permission baru dan
 * menambahkan permission tersebut ke SUPERADMIN. Assignment role lain tidak
 * disentuh agar perubahan RBAC yang sudah dibuat administrator tetap aman.
 */
export class AddKonfigurasiReadPermissions1789800000000
  implements MigrationInterface
{
  name = 'AddKonfigurasiReadPermissions1789800000000';

  private readonly permissions = [
    {
      resource: 'konfigurasi',
      resourceDescription: 'Konfigurasi sistem',
      action: 'read-digsig',
      description: 'Melihat konfigurasi Digsig',
    },
    {
      resource: 'konfigurasi',
      resourceDescription: 'Konfigurasi sistem',
      action: 'read-pengumuman',
      description: 'Melihat pengumuman pemeliharaan',
    },
    {
      resource: 'konfigurasi',
      resourceDescription: 'Konfigurasi sistem',
      action: 'read-unit-tu',
      description: 'Melihat konfigurasi Unit TU',
    },
    {
      resource: 'konfigurasi',
      resourceDescription: 'Konfigurasi sistem',
      action: 'read-unit-legal',
      description: 'Melihat konfigurasi Unit Legal',
    },
    {
      resource: 'konfigurasi',
      resourceDescription: 'Konfigurasi sistem',
      action: 'read-naskah-lainnya',
      description: 'Melihat konfigurasi Naskah Lainnya',
    },
    {
      resource: 'smart-search',
      resourceDescription: 'Mesin pencarian',
      action: 'read',
      description: 'Menggunakan mesin pencarian',
    },
    {
      resource: 'correspondence-routing',
      resourceDescription: 'Routing persuratan',
      action: 'read',
      description: 'Melihat konfigurasi routing persuratan',
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const superadmin = await queryRunner.query(
      `SELECT id FROM rbac_role WHERE name = ? LIMIT 1`,
      ['SUPERADMIN'],
    );
    const superadminId = superadmin[0]?.id;

    for (const item of this.permissions) {
      await queryRunner.query(
        `INSERT INTO rbac_resource (id, name, description, created_at, updated_at)
         VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           description = VALUES(description),
           updated_at = CURRENT_TIMESTAMP`,
        [item.resource, item.resourceDescription],
      );

      const resource = await queryRunner.query(
        `SELECT id FROM rbac_resource WHERE name = ? LIMIT 1`,
        [item.resource],
      );
      const resourceId = resource[0]?.id;
      if (!resourceId) continue;

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
          `${item.resource}.${item.action}`,
          item.description,
          item.action,
          resourceId,
        ],
      );

      if (!superadminId) continue;

      const permission = await queryRunner.query(
        `SELECT id FROM rbac_permission WHERE name = ? LIMIT 1`,
        [`${item.resource}.${item.action}`],
      );
      const permissionId = permission[0]?.id;
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
      const permissionName = `${item.resource}.${item.action}`;
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
