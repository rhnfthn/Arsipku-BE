import { MigrationInterface, QueryRunner } from 'typeorm';

/** Audit Trail hanya boleh dimiliki oleh role SUPERADMIN. */
export class RestrictAuditTrailToSuperadmin1790004000000
  implements MigrationInterface
{
  name = 'RestrictAuditTrailToSuperadmin1790004000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE rp FROM rbac_role_permission rp
       INNER JOIN rbac_role r ON r.id = rp.role_id
       INNER JOIN rbac_permission p ON p.id = rp.permission_id
       INNER JOIN rbac_resource resource ON resource.id = p.resource_id
       WHERE r.name IN ('ADMIN', 'USER') AND resource.name = 'audit'`,
    );
  }

  async down(): Promise<void> {
    // Assignment Audit Trail tidak dipulihkan ke Admin/User.
  }
}
