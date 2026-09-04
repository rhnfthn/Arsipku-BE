import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom hak_akses pada tabel klasifikasi.
 * Nilai: 'Pejabat satu tingkat di bawah Direksi', 'Pejabat dua tingkat di bawah Direksi',
 * 'Karyawan', 'Karyawan, Publik', 'Pengawas Internal', dst, atau NULL.
 */
export class AddHakAksesToKlasifikasi1721801300000
  implements MigrationInterface
{
  name = 'AddHakAksesToKlasifikasi1721801300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`klasifikasi\`
        ADD COLUMN \`hak_akses\` VARCHAR(100) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`klasifikasi\` DROP COLUMN \`hak_akses\`
    `);
  }
}
