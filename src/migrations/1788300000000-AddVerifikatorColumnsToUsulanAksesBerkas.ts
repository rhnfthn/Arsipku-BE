import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom verifikatorPengusul & verifikatorPemberi (json) di tabel
 * usulan_akses_berkas. Kolom sudah dipakai entity & service (getCounts,
 * findAll scope verify-me, create usulan) tapi belum pernah ditambahkan
 * ke DB — menyebabkan "Unknown column 'u.verifikatorPengusul'".
 * Idempotent (cek SHOW COLUMNS) agar aman dijalankan saat BE boot
 * (migrationsRun: true) meski kolom sudah ada.
 */
export class AddVerifikatorColumnsToUsulanAksesBerkas1788300000000
  implements MigrationInterface
{
  name = 'AddVerifikatorColumnsToUsulanAksesBerkas1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols = await queryRunner.query(
      `SHOW COLUMNS FROM usulan_akses_berkas LIKE 'verifikatorPengusul'`,
    );
    if (!cols || cols.length === 0) {
      await queryRunner.query(
        `ALTER TABLE usulan_akses_berkas
         ADD COLUMN verifikatorPengusul JSON NULL COMMENT 'Konfigurasi verifikator pengusul (JSON array, auto-sort bottom-to-top)'`,
      );
    }
    const colsPemberi = await queryRunner.query(
      `SHOW COLUMNS FROM usulan_akses_berkas LIKE 'verifikatorPemberi'`,
    );
    if (!colsPemberi || colsPemberi.length === 0) {
      await queryRunner.query(
        `ALTER TABLE usulan_akses_berkas
         ADD COLUMN verifikatorPemberi JSON NULL COMMENT 'Konfigurasi verifikator pemberi (JSON array)'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE usulan_akses_berkas DROP COLUMN verifikatorPemberi`,
    );
    await queryRunner.query(
      `ALTER TABLE usulan_akses_berkas DROP COLUMN verifikatorPengusul`,
    );
  }
}
