import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: kolom pejabat BAC (Berita Acara) di transfer_active_to_inactive.
 * - bac_pihak_pertama_* : pejabat pihak pertama BAC (pengirim, TTD sisi pengirim)
 * - bac_tembusan        : daftar pejabat tembusan (EVP ke atas) — JSON array
 */
export class AddBacPejabatColumns1791300000000 implements MigrationInterface {
  name = 'AddBacPejabatColumns1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE transfer_active_to_inactive
       ADD COLUMN bac_pihak_pertama_persnum INT NULL,
       ADD COLUMN bac_pihak_pertama_name VARCHAR(255) NULL,
       ADD COLUMN bac_pihak_pertama_jabatan VARCHAR(255) NULL,
       ADD COLUMN bac_tembusan JSON NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE transfer_active_to_inactive
       DROP COLUMN bac_pihak_pertama_persnum,
       DROP COLUMN bac_pihak_pertama_name,
       DROP COLUMN bac_pihak_pertama_jabatan,
       DROP COLUMN bac_tembusan`,
    );
  }
}