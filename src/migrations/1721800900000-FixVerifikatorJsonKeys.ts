import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix JSON key di dalam kolom verifikator_pengusul & verifikator_pemberi.
 *
 * Migration rename kolom sebelumnya (1721800800000) hanya mengubah NAMA KOLOM,
 * bukan KEY JSON di dalam data. Data lama masih menyimpan `levelJabatan`
 * (camelCase) sedangkan entity & FE/mobile sekarang membaca `level_jabatan`.
 *
 * Migration ini me-rename key JSON `"levelJabatan"` → `"level_jabatan"` di
 * dalam data yang sudah ada, supaya konsisten dengan kontrak API baru.
 */
export class FixVerifikatorJsonKeys1721800900000
  implements MigrationInterface
{
  name = 'FixVerifikatorJsonKeys1721800900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`usulan_akses_berkas\`
       SET verifikator_pengusul = REPLACE(verifikator_pengusul, '"levelJabatan"', '"level_jabatan"'),
           verifikator_pemberi = REPLACE(verifikator_pemberi, '"levelJabatan"', '"level_jabatan"')
       WHERE verifikator_pengusul LIKE '%levelJabatan%'
          OR verifikator_pemberi LIKE '%levelJabatan%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`usulan_akses_berkas\`
       SET verifikator_pengusul = REPLACE(verifikator_pengusul, '"level_jabatan"', '"levelJabatan"'),
           verifikator_pemberi = REPLACE(verifikator_pemberi, '"level_jabatan"', '"levelJabatan"')
       WHERE verifikator_pengusul LIKE '%level_jabatan%'
          OR verifikator_pemberi LIKE '%level_jabatan%'`,
    );
  }
}
