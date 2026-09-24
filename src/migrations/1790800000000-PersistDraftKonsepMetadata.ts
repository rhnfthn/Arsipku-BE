import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class PersistDraftKonsepMetadata1790800000000
  implements MigrationInterface
{
  name = 'PersistDraftKonsepMetadata1790800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasColumn('naskah', 'draft_konsep_to_position_id'))
    ) {
      await queryRunner.addColumn(
        'naskah',
        new TableColumn({
          name: 'draft_konsep_to_position_id',
          type: 'varchar',
          length: '50',
          isNullable: true,
          comment:
            'Target pemeriksa yang dipilih saat konsep masih berstatus draft',
        }),
      );
    }

    if (!(await queryRunner.hasColumn('naskah', 'catatan_konsep'))) {
      await queryRunner.addColumn(
        'naskah',
        new TableColumn({
          name: 'catatan_konsep',
          type: 'text',
          isNullable: true,
          comment: 'Pesan konsep yang disimpan selama masih berstatus draft',
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('naskah', 'catatan_konsep')) {
      await queryRunner.dropColumn('naskah', 'catatan_konsep');
    }
    if (await queryRunner.hasColumn('naskah', 'draft_konsep_to_position_id')) {
      await queryRunner.dropColumn('naskah', 'draft_konsep_to_position_id');
    }
  }
}
