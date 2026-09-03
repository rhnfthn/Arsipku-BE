import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom keamanan pada tabel klasifikasi.
 * Nilai: 'Terbuka', 'Terbatas', 'Rahasia', 'Sangat Rahasia' (atau NULL).
 */
export class AddKeamananToKlasifikasi1721801200000
  implements MigrationInterface
{
  name = 'AddKeamananToKlasifikasi1721801200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`klasifikasi\`
        ADD COLUMN \`keamanan\` VARCHAR(50) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`klasifikasi\` DROP COLUMN \`keamanan\`
    `);
  }
}
