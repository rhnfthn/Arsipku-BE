/** Read-only release preflight. Never mutates application data. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createConnection } from 'mysql2/promise';

const REQUIRED = [
  'correspondence_routing_role',
  'correspondence_routing_role_member',
  'correspondence_routing_rule',
  'correspondence_routing_rule_scope',
  'naskah_routing_applied',
];

async function main() {
  assert(process.env.DB_NAME, 'DB_NAME is required');
  const db = await createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    socketPath: process.env.ROUTING_PREFLIGHT_SOCKET,
  });
  try {
    const [rows] = await db.query(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${REQUIRED.map(() => '?').join(',')})`,
      REQUIRED,
    );
    const found = new Set((rows as { name: string }[]).map((row) => row.name));
    assert.equal(
      found.size,
      REQUIRED.length,
      `Missing routing tables: ${REQUIRED.filter((name) => !found.has(name)).join(', ')}`,
    );
    const [activeRows] = await db.query(
      'SELECT COUNT(*) AS count FROM correspondence_routing_rule WHERE is_active = 1 AND deleted_at IS NULL',
    );
    const activeRules = Number((activeRows as { count: number }[])[0].count);
    const flag = process.env.CORRESPONDENCE_ROUTING_ENABLED === 'true';
    if (!flag)
      assert.equal(
        activeRules,
        0,
        'Flag is false but active routing rules exist; review before release',
      );
    console.log(
      JSON.stringify(
        {
          result: 'PASS',
          database: process.env.DB_NAME,
          routingTables: found.size,
          activeRules,
          featureFlag: flag,
          readOnly: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      result: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
