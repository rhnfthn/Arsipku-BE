import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPenataanLabel1791800000000 implements MigrationInterface {
  name = 'AddPenataanLabel1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'transfer_active_to_inactive',
      'label_penataan',
    );
    if (!hasColumn) {
      await queryRunner.query(
        'ALTER TABLE `transfer_active_to_inactive` ADD COLUMN `label_penataan` varchar(255) NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'transfer_active_to_inactive',
      'label_penataan',
    );
    if (hasColumn) {
      await queryRunner.query(
        'ALTER TABLE `transfer_active_to_inactive` DROP COLUMN `label_penataan`',
      );
    }
  }
}
