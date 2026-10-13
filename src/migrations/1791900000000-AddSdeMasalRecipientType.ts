import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSdeMasalRecipientType1791900000000
  implements MigrationInterface
{
  name = 'AddSdeMasalRecipientType1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('sde_masal_folder', 'recipient_type'))) {
      await queryRunner.query(
        "ALTER TABLE `sde_masal_folder` ADD COLUMN `recipient_type` varchar(20) NOT NULL DEFAULT 'EXTERNAL' AFTER `sifat`",
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('sde_masal_folder', 'recipient_type')) {
      await queryRunner.query(
        'ALTER TABLE `sde_masal_folder` DROP COLUMN `recipient_type`',
      );
    }
  }
}
