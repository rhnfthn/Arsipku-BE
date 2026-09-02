import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom created_at pada tabel eksternal (Tertuju Eksternal).
 * Dipakai untuk menampilkan tanggal pembuatan & mengurutkan list terbaru di atas.
 */
export class AddCreatedAtToEksternal1721801000000
  implements MigrationInterface
{
  name = 'AddCreatedAtToEksternal1721801000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`eksternal\`
        ADD COLUMN \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE \`eksternal\`
        ADD COLUMN \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`eksternal\` DROP COLUMN \`updated_at\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`eksternal\` DROP COLUMN \`created_at\`
    `);
  }
}
