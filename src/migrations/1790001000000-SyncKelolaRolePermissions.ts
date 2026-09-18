import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline permission Kelola per role.
 *
 * SUPERADMIN: seluruh aksi.
 * ADMIN: monitoring dan verifikasi/approval managerial.
 * USER: operasi pemberkasan serta alur usulan akses berkas.
 *
 * Validasi actor (SE/PS/PT/PH/managerial) tetap dilakukan oleh service dan
 * PemeliharaanAccessGuard; migration ini hanya menyamakan permission matrix.
 */
export class SyncKelolaRolePermissions1790001000000
  implements MigrationInterface
{
  name = 'SyncKelolaRolePermissions1790001000000';

  private readonly allPermissions = [
    'pemeliharaan.pemberkasan.create',
    'pemeliharaan.pemberkasan.read',
    'pemeliharaan.pemberkasan.update',
    'pemeliharaan.pemberkasan.delete',
    'pemeliharaan.pemberkasan.add-naskah',
    'pemeliharaan.pemberkasan.ajukan-tutup',
    'pemeliharaan.verifikasi.read',
    'pemeliharaan.verifikasi.approve',
    'pemeliharaan.verifikasi.reject',
    'usulan-akses-berkas.create',
    'usulan-akses-berkas.read',
    'usulan-akses-berkas.read-usulan',
    'usulan-akses-berkas.read-verifikasi',
    'usulan-akses-berkas.read-pemberian',
    'usulan-akses-berkas.verify-pengusul',
    'usulan-akses-berkas.verify-pemberi',
    'usulan-akses-berkas.select-files',
    'usulan-akses-berkas.approve-pemberi',
  ];

  private readonly rolePermissions: Record<'ADMIN' | 'USER', string[]> = {
    ADMIN: [
      'pemeliharaan.pemberkasan.read',
      'pemeliharaan.verifikasi.read',
      'pemeliharaan.verifikasi.approve',
      'pemeliharaan.verifikasi.reject',
      'usulan-akses-berkas.read',
      'usulan-akses-berkas.read-usulan',
      'usulan-akses-berkas.read-verifikasi',
      'usulan-akses-berkas.verify-pengusul',
    ],
    USER: [
      'pemeliharaan.pemberkasan.create',
      'pemeliharaan.pemberkasan.read',
      'pemeliharaan.pemberkasan.update',
      'pemeliharaan.pemberkasan.delete',
      'pemeliharaan.pemberkasan.add-naskah',
      'pemeliharaan.pemberkasan.ajukan-tutup',
      'usulan-akses-berkas.create',
      'usulan-akses-berkas.read',
      'usulan-akses-berkas.read-usulan',
      'usulan-akses-berkas.read-verifikasi',
      'usulan-akses-berkas.read-pemberian',
      'usulan-akses-berkas.verify-pengusul',
      'usulan-akses-berkas.verify-pemberi',
      'usulan-akses-berkas.select-files',
      'usulan-akses-berkas.approve-pemberi',
    ],
  };

  async up(queryRunner: QueryRunner): Promise<void> {
    const roles = await queryRunner.query(
      `SELECT id, name FROM rbac_role WHERE name IN ('SUPERADMIN', 'ADMIN', 'USER')`,
    );
    const roleIds = new Map<string, string>(
      roles.map((role: { id: string; name: string }) => [role.name, role.id]),
    );

    const permissionRows = await queryRunner.query(
      `SELECT p.id, p.name
       FROM rbac_permission p
       INNER JOIN rbac_resource r ON r.id = p.resource_id
       WHERE r.name IN ('pemeliharaan.pemberkasan', 'pemeliharaan.verifikasi', 'usulan-akses-berkas')`,
    );
    const permissionIds = new Map<string, string>(
      permissionRows.map((permission: { id: string; name: string }) => [
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
         WHERE rp.role_id = ?
           AND r.name IN ('pemeliharaan.pemberkasan', 'pemeliharaan.verifikasi', 'usulan-akses-berkas')`,
        [roleId],
      );

      const names =
        roleName === 'SUPERADMIN'
          ? this.allPermissions
          : this.rolePermissions[roleName];
      for (const name of names) {
        const permissionId = permissionIds.get(name);
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
    // Assignment matrix bersifat konfigurasi; rollback migration tidak
    // menghapus permission katalog maupun assignment manual lainnya.
  }
}
