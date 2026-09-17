import { MigrationInterface, QueryRunner } from 'typeorm';

/** Konfigurasi jenis Naskah Lainnya yang boleh disebarluaskan setelah final. */
export class AddShareEnabledToConfigNaskahLainnya1789700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE config_naskah_lainnya
      ADD COLUMN share_enabled TINYINT NOT NULL DEFAULT 0
      COMMENT 'Naskah final jenis ini boleh disebarluaskan'
      AFTER butuh_legal
    `);
    await queryRunner.query(`
      UPDATE config_naskah_lainnya
      SET share_enabled = 1
      WHERE jenis_naskah IN ('EDR', 'KEP')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE config_naskah_lainnya DROP COLUMN share_enabled
    `);
  }
}
