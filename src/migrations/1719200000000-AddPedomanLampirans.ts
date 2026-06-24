import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPedomanLampirans1719200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('pedoman');
    if (!table) {
      throw new Error('Tabel pedoman tidak ditemukan');
    }

    const hasColumn = table.findColumnByName('lampirans');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE pedoman ADD COLUMN lampirans JSON NULL AFTER fileUrl`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('pedoman');
    if (table && table.findColumnByName('lampirans')) {
      await queryRunner.query(`ALTER TABLE pedoman DROP COLUMN lampirans`);
    }
  }
}
