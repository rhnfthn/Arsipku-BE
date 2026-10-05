import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: kolom TTE BAC (tanda tangan elektronik Berita Acara).
 * - bac_signed_at : timestamp TTE BAC oleh pejabat pihak pertama (BSrE)
 * - bac_signed_by : persnum pejabat yang menandatangani
 */
export class AddBacSignedColumns1791400000000 implements MigrationInterface {
  name = 'AddBacSignedColumns1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tambah nilai 'BAC' ke enum jenis_naskah (config_digsig)
    await queryRunner.query(
      `ALTER TABLE config_digsig
       MODIFY COLUMN jenis_naskah ENUM('ND','SDI','SDE','DI','KA','NL','BAC') NOT NULL`,
    );
    // 2. Tambah kolom TTE BAC
    await queryRunner.query(
      `ALTER TABLE transfer_active_to_inactive
       ADD COLUMN bac_signed_at DATETIME NULL,
       ADD COLUMN bac_signed_by INT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE transfer_active_to_inactive
       DROP COLUMN bac_signed_at,
       DROP COLUMN bac_signed_by`,
    );
    await queryRunner.query(
      `ALTER TABLE config_digsig
       MODIFY COLUMN jenis_naskah ENUM('ND','SDI','SDE','DI','KA','NL') NOT NULL`,
    );
  }
}