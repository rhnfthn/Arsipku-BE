import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFaqLampirans1719300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add fileUrl column
    const table = await queryRunner.getTable('faq');
    if (table) {
      const hasFileUrl = table.findColumnByName('fileUrl');
      if (!hasFileUrl) {
        await queryRunner.query(
          `ALTER TABLE \`faq\` ADD COLUMN \`fileUrl\` varchar(255) NULL`,
        );
      }

      const hasLampirans = table.findColumnByName('lampirans');
      if (!hasLampirans) {
        await queryRunner.query(
          `ALTER TABLE \`faq\` ADD COLUMN \`lampirans\` json NULL`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('faq');
    if (table) {
      const hasLampirans = table.findColumnByName('lampirans');
      if (hasLampirans) {
        await queryRunner.query(`ALTER TABLE \`faq\` DROP COLUMN \`lampirans\``);
      }

      const hasFileUrl = table.findColumnByName('fileUrl');
      if (hasFileUrl) {
        await queryRunner.query(`ALTER TABLE \`faq\` DROP COLUMN \`fileUrl\``);
      }
    }
  }
}