import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsulanTertujuEksternal1791900000000
  implements MigrationInterface
{
  name = 'CreateUsulanTertujuEksternal1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('usulan_tertuju_eksternal');
    if (!exists) {
      await queryRunner.query(`
        CREATE TABLE \`usulan_tertuju_eksternal\` (
          \`id\` char(36) NOT NULL,
          \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          \`nama\` varchar(150) NOT NULL,
          \`kode\` varchar(10) NULL,
          \`alamat\` text NULL,
          \`telepon\` varchar(50) NULL,
          \`email\` varchar(150) NULL,
          \`area\` varchar(50) NOT NULL,
          \`company\` varchar(50) NOT NULL,
          \`status\` varchar(20) NOT NULL DEFAULT 'pending',
          \`usulan_persnum\` int NOT NULL,
          \`usulan_nama\` varchar(150) NOT NULL,
          \`usulan_position\` varchar(50) NULL,
          \`verified_persnum\` int NULL,
          \`verified_nama\` varchar(150) NULL,
          \`verified_at\` datetime NULL,
          \`catatan\` text NULL,
          \`eksternal_id\` char(36) NULL,
          PRIMARY KEY (\`id\`),
          KEY \`idx_ute_status\` (\`status\`),
          KEY \`idx_ute_area_status\` (\`area\`, \`status\`),
          KEY \`idx_ute_usulan_persnum\` (\`usulan_persnum\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('usulan_tertuju_eksternal');
    if (exists) {
      await queryRunner.query('DROP TABLE `usulan_tertuju_eksternal`');
    }
  }
}