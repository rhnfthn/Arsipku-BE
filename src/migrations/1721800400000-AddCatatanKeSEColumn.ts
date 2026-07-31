import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom catatanKeSE di tabel usulan_akses_verification_step.
 * Menyimpan catatan khusus dari verifikator ke SE-nya (saat TOLAK/REVISI).
 */
export class AddCatatanKeSEColumn1721800400000 implements MigrationInterface {
  name = 'AddCatatanKeSEColumn1721800400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Cek apakah kolom sudah ada (idempoten)
    const [rows] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usulan_akses_verification_step'
       AND COLUMN_NAME = 'catatanKeSE'`,
    );
    if (!rows || rows.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`usulan_akses_verification_step\`
         ADD COLUMN \`catatanKeSE\` TEXT NULL AFTER \`catatanRevisi\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [rows] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usulan_akses_verification_step'
       AND COLUMN_NAME = 'catatanKeSE'`,
    );
    if (rows && rows.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`usulan_akses_verification_step\` DROP COLUMN \`catatanKeSE\``,
      );
    }
  }
}