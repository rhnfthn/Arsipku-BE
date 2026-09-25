import { MigrationInterface, QueryRunner } from 'typeorm';

export class WidenNaskahKlasifikasiText1790900000000
  implements MigrationInterface
{
  name = 'WidenNaskahKlasifikasiText1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `naskah` MODIFY `klasifikasi_text` varchar(500) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `naskah` MODIFY `klasifikasi_text` varchar(100) NULL',
    );
  }
}
