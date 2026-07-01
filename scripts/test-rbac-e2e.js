/**
 * Test RBAC end-to-end:
 * 1. Ambil RBAC context (activeRole + activePermissions) untuk persnum superadmin dari DB
 * 2. Generate JWT valid pakai JWT_SECRET dari .env
 * 3. Hit /rbac/me & /rbac/roles → harus 200 (SUPERADMIN bypass)
 * 4. Hit /rbac/roles pakai JWT user USER → /rbac/roles harus 403 (USER tidak punya role.read)
 *
 * Usage: node scripts/test-rbac-e2e.js [persnum]
 *   default persnum = superadmin pertama yang ditemukan di rbac_user_role
 */
const axios = require('axios');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BE_URL = `http://localhost:${process.env.PORT || 3001}`;
const JWT_SECRET = process.env.JWT_SECRET;

async function buildRbacContext(persnum) {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  try {
    const [userRoles] = await c.query(
      `SELECT ur.role_id, r.name AS role_name, r.id AS role_id
       FROM rbac_user_role ur JOIN rbac_role r ON ur.role_id = r.id
       WHERE ur.persnum = ? AND ur.active = 1`,
      [persnum],
    );
    if (userRoles.length === 0) {
      await c.end();
      return { activeRole: null, activePermissions: [], roles: [], role: 'user' };
    }
    // Ambil permissions dari semua role user
    const roleIds = userRoles.map((u) => u.role_id);
    const [perms] = await c.query(
      `SELECT rp.role_id, p.action, res.name AS resource
       FROM rbac_role_permission rp
       JOIN rbac_permission p ON rp.permission_id = p.id
       JOIN rbac_resource res ON p.resource_id = res.id
       WHERE rp.role_id IN (?)`,
      [roleIds],
    );
    const map = new Map();
    for (const p of perms) {
      if (!map.has(p.resource)) map.set(p.resource, new Set());
      map.get(p.resource).add(p.action);
    }
    const activePermissions = Array.from(map.entries()).map(([resource, actions]) => ({
      resource,
      actions: Array.from(actions),
    }));
    const roles = userRoles.map((u) => ({ id: u.role_id, name: u.role_name }));
    const activeRole = { id: userRoles[0].role_id, name: userRoles[0].role_name };
    return {
      activeRole,
      activePermissions,
      roles,
      role: userRoles[0].role_name.toLowerCase(),
    };
  } finally {
    await c.end();
  }
}

function makeJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

async function hit(method, urlPath, token) {
  try {
    const res = await axios({ method, url: `${BE_URL}${urlPath}`, headers: token ? { Authorization: `Bearer ${token}` } : {}, validateStatus: () => true });
    return { status: res.status, body: res.data };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

async function main() {
  const targetPersnum = process.argv[2] ? Number(process.argv[2]) : null;

  console.log('=== RBAC E2E Test ===');
  console.log(`BE: ${BE_URL} | DB: ${process.env.DB_HOST}/${process.env.DB_NAME}\n`);

  // 1. Cari persnum superadmin
  let persnum = targetPersnum;
  if (!persnum) {
    const c = await mysql.createConnection({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [rows] = await c.query(
      `SELECT ur.persnum FROM rbac_user_role ur JOIN rbac_role r ON ur.role_id=r.id WHERE r.name='SUPERADMIN' LIMIT 1`,
    );
    await c.end();
    if (rows.length === 0) {
      console.error('❌ Tidak ada user SUPERADMIN di rbac_user_role. Assign dulu via /rbac/users atau jalankan migration 2.');
      process.exit(1);
    }
    persnum = rows[0].persnum;
  }
  console.log(`Test persnum: ${persnum} (SUPERADMIN)\n`);

  // 2. Build RBAC context
  const ctx = await buildRbacContext(persnum);
  console.log('RBAC context dari DB:');
  console.log(`  role: ${ctx.role}`);
  console.log(`  activeRole:`, ctx.activeRole);
  console.log(`  roles:`, ctx.roles.map((r) => r.name));
  console.log(`  activePermissions count: ${ctx.activePermissions.length}`);
  if (ctx.activePermissions.length > 0) {
    console.log(`  sample permission:`, ctx.activePermissions[0]);
  }

  // 3. Buat JWT
  const payload = {
    persnum,
    nama: 'Test Superadmin',
    role: ctx.role,
    activeRole: ctx.activeRole,
    activePermissions: ctx.activePermissions,
    roles: ctx.roles,
    company: '1', companyText: 'Test', area: '1', areaText: 'Test',
    subArea: '1', subAreaText: 'Test', organization: '1', organizationText: 'Test',
    position: '1', positionText: 'Test', bodTag: '', abbreviation: '',
  };
  const token = makeJwt(payload);
  console.log(`\nJWT generated (first 30 chars): ${token.substring(0, 30)}...\n`);

  // 4. Hit /rbac/me
  console.log('--- GET /rbac/me (harus 200) ---');
  const me = await hit('get', '/rbac/me', token);
  console.log(`  status: ${me.status}`);
  console.log(`  body:`, JSON.stringify(me.body, null, 2).substring(0, 500));

  // 5. Hit /rbac/roles (harus 200 via SUPERADMIN bypass)
  console.log('\n--- GET /rbac/roles (harus 200, SUPERADMIN bypass) ---');
  const roles = await hit('get', '/rbac/roles', token);
  console.log(`  status: ${roles.status}`);
  if (roles.status === 200) {
    const list = roles.body?.data ?? [];
    console.log(`  roles returned: ${list.length}`);
    list.forEach((r) => console.log(`    - ${r.name} (${r.permissionCount} perms)`));
  } else {
    console.log(`  body:`, JSON.stringify(roles.body));
  }

  // 6. Hit /rbac/roles dengan token USER (harus 403)
  console.log('\n--- GET /rbac/roles pakai USER token (harus 403) ---');
  const userPayload = { ...payload, role: 'user', activeRole: { id: 'user-test', name: 'USER' }, activePermissions: [{ resource: 'naskah-dinas', actions: ['create'] }] };
  const userToken = makeJwt(userPayload);
  const rolesUser = await hit('get', '/rbac/roles', userToken);
  console.log(`  status: ${rolesUser.status} ${rolesUser.status === 403 ? '✅' : '❌ (harusnya 403)'}`);
  if (rolesUser.status !== 403) console.log(`  body:`, JSON.stringify(rolesUser.body).substring(0, 200));

  // 7. Hit endpoint publik tanpa permission (harus allow)
  console.log('\n--- GET /auth/profile (harus 200, terproteksi JwtAuthGuard) ---');
  const prof = await hit('get', '/auth/profile', token);
  console.log(`  status: ${prof.status} ${prof.status === 200 ? '✅' : '(mungkin 404/500, tidak masalah)'}`);

  console.log('\n=== Test selesai ===');
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });