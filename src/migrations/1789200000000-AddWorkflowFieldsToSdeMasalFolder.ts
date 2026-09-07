import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowFieldsToSdeMasalFolder1789200000000 implements MigrationInterface {
  name = 'AddWorkflowFieldsToSdeMasalFolder1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('sde_masal_folder', 'rejection_reason'))) {
      await queryRunner.query(
        'ALTER TABLE `sde_masal_folder` ADD COLUMN `rejection_reason` text NULL AFTER `status`',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('sde_masal_folder', 'rejection_reason')) {
      await queryRunner.query(
        'ALTER TABLE `sde_masal_folder` DROP COLUMN `rejection_reason`',
      );
    }
  }
}
