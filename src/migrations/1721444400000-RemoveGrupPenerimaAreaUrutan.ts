import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RemoveGrupPenerimaAreaUrutan1721444400000 implements MigrationInterface {
  name = 'RemoveGrupPenerimaAreaUrutan1721444400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('grup_penerima', 'area');
    await queryRunner.dropColumn('grup_penerima', 'urutan');
    await queryRunner.dropColumn('grup_penerima', 'deskripsi_english');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'grup_penerima',
      new TableColumn({
        name: 'area',
        type: 'varchar',
        length: '50',
        isNullable: false,
        default: "'A000'",
      }),
    );
    await queryRunner.addColumn(
      'grup_penerima',
      new TableColumn({
        name: 'urutan',
        type: 'int',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      'grup_penerima',
      new TableColumn({
        name: 'deskripsi_english',
        type: 'text',
        isNullable: true,
      }),
    );
  }
}
