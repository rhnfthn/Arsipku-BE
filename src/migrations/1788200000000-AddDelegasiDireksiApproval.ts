import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDelegasiDireksiApproval1788200000000
  implements MigrationInterface
{
  name = 'AddDelegasiDireksiApproval1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`naskah_lainnya_approval\`
        ADD COLUMN \`delegate_persnum\` INT NULL,
        ADD COLUMN \`delegate_name\` VARCHAR(255) NULL,
        ADD COLUMN \`delegate_position_status\` VARCHAR(8) NULL,
        ADD COLUMN \`assigned_by_persnum\` INT NULL,
        ADD COLUMN \`assigned_at\` DATETIME NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`naskah_lainnya_approval\`
        DROP COLUMN \`assigned_at\`,
        DROP COLUMN \`assigned_by_persnum\`,
        DROP COLUMN \`delegate_position_status\`,
        DROP COLUMN \`delegate_name\`,
        DROP COLUMN \`delegate_persnum\``,
    );
  }
}
