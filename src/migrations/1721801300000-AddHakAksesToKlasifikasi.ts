import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom hak_akses pada tabel klasifikasi.
 * Nilai: 'BOD-1', 'BOD-2', 'Pengawas Internal', atau NULL (non tag).
 */
export class AddHakAksesToKlasifikasi1721801300000
  implements MigrationInterface
{
  name = 'AddHakAksesToKlasifikasi1721801300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`klasifikasi\`
        ADD COLUMN \`hak_akses\` VARCHAR(50) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`klasifikasi\` DROP COLUMN \`hak_akses\`
    `);
  }
}
