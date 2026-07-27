import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShareAccessTypeColumns1721800000000
  implements MigrationInterface
{
  name = 'AddShareAccessTypeColumns1721800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Helper: check if a column exists
    const columnExists = async (table: string, column: string): Promise<boolean> => {
      const rows: any[] = await queryRunner.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = '${table}'
           AND COLUMN_NAME = '${column}'`,
      );
      return rows[0]?.cnt > 0;
    };

    // 1. Add access_type column (skip if already exists)
    if (!(await columnExists('naskah_share', 'access_type'))) {
      await queryRunner.query(`
        ALTER TABLE \`naskah_share\`
          ADD COLUMN \`access_type\` ENUM('SEKALI_LIHAT', 'RENTANG_WAKTU')
            NOT NULL DEFAULT 'RENTANG_WAKTU'
            AFTER \`catatan\`
      `);
    }

    // 2. Add duration_days column (skip if already exists)
    if (!(await columnExists('naskah_share', 'duration_days'))) {
      await queryRunner.query(`
        ALTER TABLE \`naskah_share\`
          ADD COLUMN \`duration_days\` INT NULL
            AFTER \`access_type\`
      `);
    }

    // 3. Add expires_at column (skip if already exists)
    if (!(await columnExists('naskah_share', 'expires_at'))) {
      await queryRunner.query(`
        ALTER TABLE \`naskah_share\`
          ADD COLUMN \`expires_at\` TIMESTAMP NULL
            AFTER \`duration_days\`
      `);
    }

    // 4. Align naskah_share_recipient.status enum with new RecipientStatus values
    //    (TERKIRIM, DIBACA, BERAKHIR) — idempotent
    await queryRunner.query(`
      ALTER TABLE \`naskah_share_recipient\`
        MODIFY COLUMN \`status\`
          ENUM('TERKIRIM', 'DIBACA', 'BERAKHIR')
          NOT NULL DEFAULT 'TERKIRIM'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Remove added columns
    await queryRunner.query(`
      ALTER TABLE \`naskah_share\`
        DROP COLUMN \`expires_at\`,
        DROP COLUMN \`duration_days\`,
        DROP COLUMN \`access_type\`
    `);

    // 2. Revert recipient status enum to pre-share values
    await queryRunner.query(`
      ALTER TABLE \`naskah_share_recipient\`
        MODIFY COLUMN \`status\`
          ENUM('BELUM_DIBACA', 'DIBACA', 'DIBUKA')
          NOT NULL DEFAULT 'BELUM_DIBACA'
    `);
  }
}
