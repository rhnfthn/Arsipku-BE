import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'local_db_arsipku',
    synchronize: false,
  });

  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();

  console.log('🔄 Migrating share status enum values...');

  // Step 1: Widen enum columns to include BOTH old and new values
  await qr.query(
    `ALTER TABLE \`naskah_share\` MODIFY COLUMN \`status\` ENUM('AKTIF', 'DICABUT', 'BERAKHIR') NOT NULL DEFAULT 'AKTIF'`,
  );
  console.log('  ✅ naskah_share.status: widened enum');

  await qr.query(
    `ALTER TABLE \`naskah_share_recipient\` MODIFY COLUMN \`status\` ENUM('BELUM_DIBACA', 'DIBACA', 'DIBUKA', 'DICABUT', 'TERKIRIM', 'BERAKHIR') NOT NULL DEFAULT 'TERKIRIM'`,
  );
  console.log('  ✅ naskah_share_recipient.status: widened enum');

  // Step 2: Migrate data from old values to new values
  await qr.query(
    `UPDATE \`naskah_share\` SET \`status\` = 'BERAKHIR' WHERE \`status\` = 'DICABUT'`,
  );
  console.log('  ✅ naskah_share: DICABUT → BERAKHIR');

  await qr.query(
    `UPDATE \`naskah_share_recipient\` SET \`status\` = 'BERAKHIR' WHERE \`status\` = 'DICABUT'`,
  );
  console.log('  ✅ naskah_share_recipient: DICABUT → BERAKHIR');

  await qr.query(
    `UPDATE \`naskah_share_recipient\` SET \`status\` = 'TERKIRIM' WHERE \`status\` = 'BELUM_DIBACA'`,
  );
  console.log('  ✅ naskah_share_recipient: BELUM_DIBACA → TERKIRIM');

  await qr.query(
    `UPDATE \`naskah_share_recipient\` SET \`status\` = 'DIBACA' WHERE \`status\` = 'DIBUKA'`,
  );
  console.log('  ✅ naskah_share_recipient: DIBUKA → DIBACA');

  // Step 3: Narrow enum columns to only new values
  await qr.query(
    `ALTER TABLE \`naskah_share\` MODIFY COLUMN \`status\` ENUM('AKTIF', 'BERAKHIR') NOT NULL DEFAULT 'AKTIF'`,
  );
  console.log('  ✅ naskah_share.status: narrowed to new enum');

  await qr.query(
    `ALTER TABLE \`naskah_share_recipient\` MODIFY COLUMN \`status\` ENUM('TERKIRIM', 'DIBACA', 'BERAKHIR') NOT NULL DEFAULT 'TERKIRIM'`,
  );
  console.log('  ✅ naskah_share_recipient.status: narrowed to new enum');

  console.log('✅ Migration complete!');
  await dataSource.destroy();
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
