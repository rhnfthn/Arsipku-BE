// One-off migration runner — jalankan migration TypeORM langsung tanpa restart app.
// Pakai: npx ts-node -r tsconfig-paths/register src/scripts/run-migration.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [path.join(__dirname, '../**/*.entity.{ts,js}')],
  migrations: [path.join(__dirname, '../migrations/*{.ts,.js}')],
  migrationsRun: false,
  synchronize: false,
  timezone: '+07:00',
  extra: { maxAllowedPacket: 268435456 },
});

async function main() {
  await dataSource.initialize();
  const pending = await dataSource.showMigrations();
  console.log('Pending migrations:', pending);
  await dataSource.runMigrations();
  console.log('✅ Migrations run successfully');
  await dataSource.destroy();
}

main().catch((e) => {
  console.error('❌ Migration failed:', e);
  process.exit(1);
});