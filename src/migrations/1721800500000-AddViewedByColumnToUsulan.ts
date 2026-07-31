import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom viewedBy (json, nullable) di tabel usulan_akses_berkas.
 * Digunakan untuk tracking usulan yang sudah dibuka/dilihat oleh user
 * (SE pengusul, SE pemberi, atau managerial). Counts badge notifikasi
 * akan exclude usulan yang ada di viewedBy[userPersnum] (pola sama
 * dengan send_read_time di naskah_sirkulasi untuk kotak masuk).
 */
export class AddViewedByColumnToUsulan1721800500000 implements MigrationInterface {
  name = 'AddViewedByColumnToUsulan1721800500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Cek dulu apakah kolom sudah ada (idempotent)
    const cols = await queryRunner.query(
      `SHOW COLUMNS FROM usulan_akses_berkas LIKE 'viewedBy'`,
    );
    if (!cols || cols.length === 0) {
      await queryRunner.query(
        `ALTER TABLE usulan_akses_berkas
         ADD COLUMN viewedBy JSON NULL COMMENT 'Map persnum → ISO timestamp viewed. Dipakai untuk filter badge notifikasi (exclude yang sudah dibuka user).'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE usulan_akses_berkas DROP COLUMN viewedBy`,
    );
  }
}