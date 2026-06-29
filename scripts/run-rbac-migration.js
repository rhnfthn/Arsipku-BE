/**
 * Runner migration RBAC — jalankan SQL migration manual via mysql2.
 * Pakai koneksi dari .env (DB_HOST/DB_USER/...).
 *
 * Usage:
 *   node scripts/run-rbac-migration.js           # jalankan migration 1 (create tables)
 *   node scripts/run-rbac-migration.js 1         # migration 1 (create tables)
 *   node scripts/run-rbac-migration.js 2         # migration 2 (migrate user_role lama)
 *   node scripts/run-rbac-migration.js --dry-run # tampilkan SQL tanpa eksekusi
 *   node scripts/run-rbac-migration.js --rollback # drop semua tabel rbac_*
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  multipleStatements: true, // penting untuk multi-statement SQL
  timezone: '+07:00',
};

const MIGRATIONS = {
  1: 'db/migrations/20260629000001_create_rbac_tables.sql',
  2: 'db/migrations/20260629000002_migrate_existing_user_roles.sql',
};

const ROLLBACK_SQL = `
DROP TABLE IF EXISTS rbac_user_role;
DROP TABLE IF EXISTS rbac_role_permission;
DROP TABLE IF EXISTS rbac_permission;
DROP TABLE IF EXISTS rbac_resource;
DROP TABLE IF EXISTS rbac_role;
`;

async function readSql(relPath) {
  const full = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(full)) throw new Error(`File tidak ditemukan: ${full}`);
  return fs.readFileSync(full, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isRollback = args.includes('--rollback');

  // Tentukan migration step
  const stepArg = args.find((a) => !a.startsWith('--'));
  const step = stepArg ? Number(stepArg) : 1;

  if (isRollback) {
    console.log('⚠️  ROLLBACK: akan DROP semua tabel rbac_*');
    if (isDryRun) {
      console.log('--- SQL (dry-run) ---');
      console.log(ROLLBACK_SQL);
      return;
    }
    const conn = await mysql.createConnection(DB_CONFIG);
    try {
      await conn.query(ROLLBACK_SQL);
      console.log('✅ Rollback selesai — tabel rbac_* di-drop');
    } finally {
      await conn.end();
    }
    return;
  }

  if (!MIGRATIONS[step]) {
    console.error(`❌ Step tidak valid: ${step}. Gunakan 1 atau 2.`);
    process.exit(1);
  }

  const sqlFile = MIGRATIONS[step];
  const sql = await readSql(sqlFile);

  console.log(`=== Migration step ${step}: ${sqlFile} ===`);
  console.log(`DB target: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  console.log('');

  if (isDryRun) {
    console.log('--- SQL (dry-run, TIDAK dieksekusi) ---');
    console.log(sql);
    return;
  }

  console.log('Menghubungkan ke database...');
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    console.log('✅ Terhubung. Mengeksekusi SQL...');
    await conn.query(sql);
    console.log(`✅ Migration step ${step} berhasil dieksekusi.`);

    // Verifikasi
    if (step === 1) {
      const [rows] = await conn.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'rbac\\_%'`,
        [DB_CONFIG.database],
      );
      console.log(`\nVerifikasi — tabel rbac_* yang ada di DB:`);
      rows.forEach((r) => console.log(`  - ${r.TABLE_NAME}`));
      if (rows.length !== 5) {
        console.warn(`⚠️  Diharapkan 5 tabel, ditemukan ${rows.length}. Cek error SQL.`);
      }
    } else if (step === 2) {
      const [r1] = await conn.query('SELECT COUNT(*) AS cnt FROM user_role');
      const [r2] = await conn.query('SELECT COUNT(*) AS cnt FROM rbac_user_role');
      console.log(`\nVerifikasi:`);
      console.log(`  user_role (lama): ${r1[0].cnt} baris`);
      console.log(`  rbac_user_role (baru): ${r2[0].cnt} baris`);
      console.log(`  (harusnya rbac_user_role >= user_role jika semua role ADMIN/SUPERADMIN)`);
    }
  } catch (err) {
    console.error(`\n❌ Migration step ${step} GAGAL:`);
    console.error(`   Error: ${err.message}`);
    if (err.code === 'ER_TABLE_EXISTS_ERROR') {
      console.error('   Tabel sudah ada. Jalankan dengan --rollback untuk reset, lalu re-run.');
    } else if (err.code === 'ER_DUP_ENTRY') {
      console.error('   Data duplikat. Migration 2 pakai NOT EXISTS — aman di-rerun.');
    }
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('❌ Fatal error:', e.message);
  process.exit(1);
});