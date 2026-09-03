import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom penyusutan pada tabel klasifikasi.
 * Nilai hanya 2: 'Musnah' atau 'Permanen'.
 */
export class AddPenyusutanToKlasifikasi1721801100000
  implements MigrationInterface
{
  name = 'AddPenyusutanToKlasifikasi1721801100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`klasifikasi\`
        ADD COLUMN \`penyusutan\` VARCHAR(50) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`klasifikasi\` DROP COLUMN \`penyusutan\`
    `);
  }
}
