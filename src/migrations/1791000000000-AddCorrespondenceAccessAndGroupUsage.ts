import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddCorrespondenceAccessAndGroupUsage1791000000000
  implements MigrationInterface
{
  name = 'AddCorrespondenceAccessAndGroupUsage1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('grup_penerima', 'tujuan'))) {
      await queryRunner.addColumn(
        'grup_penerima',
        new TableColumn({
          name: 'tujuan',
          type: 'json',
          isNullable: true,
          comment: 'PENERIMA/TEMBUSAN; NULL berarti keduanya',
        }),
      );
    }

    if (!(await queryRunner.hasColumn('grup_penerima', 'lintas_area'))) {
      await queryRunner.addColumn(
        'grup_penerima',
        new TableColumn({
          name: 'lintas_area',
          type: 'tinyint',
          width: 1,
          default: 1,
          comment: '1 lintas area; 0 hanya area pengirim',
        }),
      );
    }

    if (!(await queryRunner.hasTable('correspondence_access_policy'))) {
      await queryRunner.createTable(
        new Table({
          name: 'correspondence_access_policy',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true },
            { name: 'company', type: 'int' },
            { name: 'document_type', type: 'varchar', length: '10' },
            { name: 'bod_tags', type: 'json', isNullable: true },
            { name: 'chief_values', type: 'json', isNullable: true },
            {
              name: 'area_mode',
              type: 'varchar',
              length: '16',
              default: "'ALL'",
            },
            { name: 'area_ids', type: 'json', isNullable: true },
            { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              onUpdate: 'CURRENT_TIMESTAMP',
            },
          ],
        }),
      );
      await queryRunner.createIndex(
        'correspondence_access_policy',
        new TableIndex({
          name: 'uq_correspondence_access_company_document',
          columnNames: ['company', 'document_type'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('correspondence_access_policy')) {
      await queryRunner.dropTable('correspondence_access_policy');
    }
    if (await queryRunner.hasColumn('grup_penerima', 'lintas_area')) {
      await queryRunner.dropColumn('grup_penerima', 'lintas_area');
    }
    if (await queryRunner.hasColumn('grup_penerima', 'tujuan')) {
      await queryRunner.dropColumn('grup_penerima', 'tujuan');
    }
  }
}
