import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Perbesar berkas.klasifikasi_text dari varchar(100) ke varchar(500).
 * Master klasifikasi (tabel klasifikasi.klasifikasi_text bertipe TEXT) bisa
 * berisi teks panjang (hingga 263+ karakter, mis. OPS.18), sehingga insert
 * berkas dengan klasifikasi tersebut gagal: "Data too long for column
 * 'klasifikasi_text'". Samakan dengan naskah.klasifikasi_text (varchar(500)).
 */
export class WidenBerkasKlasifikasiText1791200000000
  implements MigrationInterface
{
  name = 'WidenBerkasKlasifikasiText1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `berkas` MODIFY `klasifikasi_text` varchar(500) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `berkas` MODIFY `klasifikasi_text` varchar(100) NULL',
    );
  }
}
