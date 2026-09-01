import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rename kolom camelCase → snake_case di 4 tabel usulan akses berkas.
 *
 * Full migration: kolom fisik di DB di-rename ke snake_case, dan property
 * entity juga di-rename ke snake_case (TypeORM auto-map property snake_case
 * ke kolom snake_case tanpa `name:`). API contract (key JSON) ikut berubah
 * ke snake_case → FE & mobile sudah disesuaikan.
 *
 * Catatan: migration ini hanya me-rename NAMA KOLOM. Key JSON di dalam kolom
 * `verifikator_pengusul`/`verifikator_pemberi` (mis. `levelJabatan`) di-fix
 * terpisah oleh migration 1721800900000-FixVerifikatorJsonKeys.
 *
 * Tabel yang diubah:
 *   - usulan_akses_berkas
 *   - usulan_akses_berkas_item
 *   - usulan_akses_entitlement
 *   - usulan_akses_verification_step
 */
export class RenameUsulanAksesColumnsToSnakeCase1721800800000
  implements MigrationInterface
{
  name = 'RenameUsulanAksesColumnsToSnakeCase1721800800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. usulan_akses_berkas ───────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE \`usulan_akses_berkas\`
        RENAME COLUMN \`nomorUsulan\` TO \`nomor_usulan\`,
        RENAME COLUMN \`jenisBerkas\` TO \`jenis_berkas\`,
        RENAME COLUMN \`pengusulPersnum\` TO \`pengusul_persnum\`,
        RENAME COLUMN \`divisiPengusulId\` TO \`divisi_pengusul_id\`,
        RENAME COLUMN \`divisiPemberiId\` TO \`divisi_pemberi_id\`,
        RENAME COLUMN \`judulUsulan\` TO \`judul_usulan\`,
        RENAME COLUMN \`tujuanAkses\` TO \`tujuan_akses\`,
        RENAME COLUMN \`durasiAkses\` TO \`durasi_akses\`,
        RENAME COLUMN \`durasiAksesDisetujui\` TO \`durasi_akses_disetujui\`,
        RENAME COLUMN \`catatanPerubahanDurasi\` TO \`catatan_perubahan_durasi\`,
        RENAME COLUMN \`tanggalMulai\` TO \`tanggal_mulai\`,
        RENAME COLUMN \`tanggalSelesai\` TO \`tanggal_selesai\`,
        RENAME COLUMN \`customTanggalSelesai\` TO \`custom_tanggal_selesai\`,
        RENAME COLUMN \`jenisAkses\` TO \`jenis_akses\`,
        RENAME COLUMN \`penerimaAksesTambahan\` TO \`penerima_akses_tambahan\`,
        RENAME COLUMN \`suratUsulanFileId\` TO \`surat_usulan_file_id\`,
        RENAME COLUMN \`verifikatorPengusul\` TO \`verifikator_pengusul\`,
        RENAME COLUMN \`verifikatorPemberi\` TO \`verifikator_pemberi\`,
        RENAME COLUMN \`catatanRevisiPengusul\` TO \`catatan_revisi_pengusul\`,
        RENAME COLUMN \`catatanRevisiPemberi\` TO \`catatan_revisi_pemberi\`,
        RENAME COLUMN \`viewedBy\` TO \`viewed_by\`,
        RENAME COLUMN \`createdAt\` TO \`created_at\`,
        RENAME COLUMN \`updatedAt\` TO \`updated_at\``,
    );

    // ── 2. usulan_akses_berkas_item ──────────────────────────────
    await queryRunner.query(
      `ALTER TABLE \`usulan_akses_berkas_item\`
        RENAME COLUMN \`usulanId\` TO \`usulan_id\`,
        RENAME COLUMN \`berkasId\` TO \`berkas_id\`,
        RENAME COLUMN \`jenisAksesGranted\` TO \`jenis_akses_granted\`,
        RENAME COLUMN \`berlakuHingga\` TO \`berlaku_hingga\`,
        RENAME COLUMN \`createdAt\` TO \`created_at\``,
    );

    // ── 3. usulan_akses_entitlement ──────────────────────────────
    await queryRunner.query(
      `ALTER TABLE \`usulan_akses_entitlement\`
        RENAME COLUMN \`usulanId\` TO \`usulan_id\`,
        RENAME COLUMN \`userPersnum\` TO \`user_persnum\`,
        RENAME COLUMN \`berkasId\` TO \`berkas_id\`,
        RENAME COLUMN \`tanggalMulai\` TO \`tanggal_mulai\`,
        RENAME COLUMN \`tanggalSelesai\` TO \`tanggal_selesai\`,
        RENAME COLUMN \`isRevoked\` TO \`is_revoked\`,
        RENAME COLUMN \`isPenerimaTambahan\` TO \`is_penerima_tambahan\`,
        RENAME COLUMN \`isRead\` TO \`is_read\`,
        RENAME COLUMN \`createdAt\` TO \`created_at\``,
    );

    // ── 4. usulan_akses_verification_step ─────────────────────────
    await queryRunner.query(
      `ALTER TABLE \`usulan_akses_verification_step\`
        RENAME COLUMN \`usulanId\` TO \`usulan_id\`,
        RENAME COLUMN \`verifierPersnum\` TO \`verifier_persnum\`,
        RENAME COLUMN \`roleTahap\` TO \`role_tahap\`,
        RENAME COLUMN \`urutanJenjang\` TO \`urutan_jenjang\`,
        RENAME COLUMN \`catatanRevisi\` TO \`catatan_revisi\`,
        RENAME COLUMN \`catatanKeSE\` TO \`catatan_ke_se\`,
        RENAME COLUMN \`verifiedAt\` TO \`verified_at\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── 1. usulan_akses_berkas ───────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE \`usulan_akses_berkas\`
        RENAME COLUMN \`nomor_usulan\` TO \`nomorUsulan\`,
        RENAME COLUMN \`jenis_berkas\` TO \`jenisBerkas\`,
        RENAME COLUMN \`pengusul_persnum\` TO \`pengusulPersnum\`,
        RENAME COLUMN \`divisi_pengusul_id\` TO \`divisiPengusulId\`,
        RENAME COLUMN \`divisi_pemberi_id\` TO \`divisiPemberiId\`,
        RENAME COLUMN \`judul_usulan\` TO \`judulUsulan\`,
        RENAME COLUMN \`tujuan_akses\` TO \`tujuanAkses\`,
        RENAME COLUMN \`durasi_akses\` TO \`durasiAkses\`,
        RENAME COLUMN \`durasi_akses_disetujui\` TO \`durasiAksesDisetujui\`,
        RENAME COLUMN \`catatan_perubahan_durasi\` TO \`catatanPerubahanDurasi\`,
        RENAME COLUMN \`tanggal_mulai\` TO \`tanggalMulai\`,
        RENAME COLUMN \`tanggal_selesai\` TO \`tanggalSelesai\`,
        RENAME COLUMN \`custom_tanggal_selesai\` TO \`customTanggalSelesai\`,
        RENAME COLUMN \`jenis_akses\` TO \`jenisAkses\`,
        RENAME COLUMN \`penerima_akses_tambahan\` TO \`penerimaAksesTambahan\`,
        RENAME COLUMN \`surat_usulan_file_id\` TO \`suratUsulanFileId\`,
        RENAME COLUMN \`verifikator_pengusul\` TO \`verifikatorPengusul\`,
        RENAME COLUMN \`verifikator_pemberi\` TO \`verifikatorPemberi\`,
        RENAME COLUMN \`catatan_revisi_pengusul\` TO \`catatanRevisiPengusul\`,
        RENAME COLUMN \`catatan_revisi_pemberi\` TO \`catatanRevisiPemberi\`,
        RENAME COLUMN \`viewed_by\` TO \`viewedBy\`,
        RENAME COLUMN \`created_at\` TO \`createdAt\`,
        RENAME COLUMN \`updated_at\` TO \`updatedAt\``,
    );

    // ── 2. usulan_akses_berkas_item ──────────────────────────────
    await queryRunner.query(
      `ALTER TABLE \`usulan_akses_berkas_item\`
        RENAME COLUMN \`usulan_id\` TO \`usulanId\`,
        RENAME COLUMN \`berkas_id\` TO \`berkasId\`,
        RENAME COLUMN \`jenis_akses_granted\` TO \`jenisAksesGranted\`,
        RENAME COLUMN \`berlaku_hingga\` TO \`berlakuHingga\`,
        RENAME COLUMN \`created_at\` TO \`createdAt\``,
    );

    // ── 3. usulan_akses_entitlement ──────────────────────────────
    await queryRunner.query(
      `ALTER TABLE \`usulan_akses_entitlement\`
        RENAME COLUMN \`usulan_id\` TO \`usulanId\`,
        RENAME COLUMN \`user_persnum\` TO \`userPersnum\`,
        RENAME COLUMN \`berkas_id\` TO \`berkasId\`,
        RENAME COLUMN \`tanggal_mulai\` TO \`tanggalMulai\`,
        RENAME COLUMN \`tanggal_selesai\` TO \`tanggalSelesai\`,
        RENAME COLUMN \`is_revoked\` TO \`isRevoked\`,
        RENAME COLUMN \`is_penerima_tambahan\` TO \`isPenerimaTambahan\`,
        RENAME COLUMN \`is_read\` TO \`isRead\`,
        RENAME COLUMN \`created_at\` TO \`createdAt\``,
    );

    // ── 4. usulan_akses_verification_step ─────────────────────────
    await queryRunner.query(
      `ALTER TABLE \`usulan_akses_verification_step\`
        RENAME COLUMN \`usulan_id\` TO \`usulanId\`,
        RENAME COLUMN \`verifier_persnum\` TO \`verifierPersnum\`,
        RENAME COLUMN \`role_tahap\` TO \`roleTahap\`,
        RENAME COLUMN \`urutan_jenjang\` TO \`urutanJenjang\`,
        RENAME COLUMN \`catatan_revisi\` TO \`catatanRevisi\`,
        RENAME COLUMN \`catatan_ke_se\` TO \`catatanKeSE\`,
        RENAME COLUMN \`verified_at\` TO \`verifiedAt\``,
    );
  }
}
