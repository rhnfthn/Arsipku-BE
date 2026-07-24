/**
 * Script: sync-schema
 * Jalankan: npx ts-node src/scripts/sync-schema.script.ts
 *
 * Membuat tabel yang belum ada di DB berdasarkan entity TypeORM.
 * Menggunakan synchronize: true untuk entity yang terdaftar saja.
 */
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TitelaturEnEntity } from '../modules/titelatur-en/entities/titelatur-en.entity';
import { TemplateEntity } from '../modules/template/entities/template.entity';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'arsipku',
  entities: [TitelaturEnEntity, TemplateEntity],
  synchronize: true,
  timezone: '+07:00',
});

async function main() {
  console.log('🔌 Connecting to database...');
  await dataSource.initialize();
  console.log('✅ Connected. Syncing schema (create missing tables)...');
  console.log(
    '   Entities:',
    dataSource.entityMetadatas.map((m) => m.tableName).join(', '),
  );
  console.log('🎉 Schema sync complete — missing tables created');
  await dataSource.destroy();
  console.log('🔌 Disconnected');
}

main().catch((e) => {
  console.error('❌ Schema sync failed:', e);
  process.exit(1);
});
