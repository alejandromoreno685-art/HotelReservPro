const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { randomUUID } = require('node:crypto');
const database = require('../../../database');

const testMode = process.env.NODE_ENV === 'test';
const users = new Map();

function createUserRecord(username, displayName, role, password, id) {
  const passwordSalt = randomBytes(16);
  return {
    id,
    username,
    displayName,
    passwordSalt,
    passwordHash: scryptSync(password, passwordSalt, 64),
    role,
    active: true,
    failedAttempts: 0,
    lockedUntil: null
  };
}

const admin = createUserRecord(
  process.env.ADMIN_USER || 'admin',
  'Administrador',
  'ADMIN',
  process.env.ADMIN_PASSWORD || 'admin123',
  'user-admin'
);
users.set(admin.username, admin);

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    role: row.role,
    active: Boolean(row.active),
    failedAttempts: Number(row.failed_login_attempts),
    lockedUntil: row.locked_until
  };
}

async function findByUsername(username) {
  if (testMode) return users.get(username) || null;
  const result = await database.query(
    `SELECT id, username, display_name, password_salt, password_hash, role, active,
            failed_login_attempts, locked_until
     FROM dbo.Users
     WHERE username = @username`,
    { username }
  );
  return mapUser(result.recordset[0]);
}

function verifyPassword(user, password) {
  if (!user || typeof password !== 'string') return false;
  const candidateHash = scryptSync(password, user.passwordSalt, 64);
  return timingSafeEqual(candidateHash, user.passwordHash);
}

async function recordFailedLogin(user) {
  if (!testMode) {
    await database.query(
      `UPDATE dbo.Users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= 5 THEN DATEADD(MINUTE, 15, SYSUTCDATETIME())
             ELSE locked_until
           END
       WHERE id = @id`,
      { id: user.id }
    );
    user.failedAttempts += 1;
    if (user.failedAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    return;
  }

  user.failedAttempts += 1;
  if (user.failedAttempts >= 5) {
    user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
}

async function recordSuccessfulLogin(user) {
  if (!testMode) {
    await database.query(
      `UPDATE dbo.Users
       SET failed_login_attempts = 0, locked_until = NULL, last_login_at = SYSUTCDATETIME()
       WHERE id = @id`,
      { id: user.id }
    );
    user.failedAttempts = 0;
    user.lockedUntil = null;
    return;
  }

  user.failedAttempts = 0;
  user.lockedUntil = null;
}

async function ensureAdmin() {
  if (testMode) return;
  const username = (process.env.ADMIN_USER || 'admin').trim();
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  if (!username || password.length < 8) {
    throw new Error('ADMIN_USER no puede estar vacío y ADMIN_PASSWORD debe tener al menos 8 caracteres.');
  }

  const existing = await findByUsername(username);
  if (existing) return;

  const newAdmin = createUserRecord(username, 'Administrador', 'ADMIN', password, randomUUID());
  await database.query(
    `INSERT INTO dbo.Users
      (id, username, display_name, password_salt, password_hash, role, active)
     VALUES (@id, @username, @displayName, @passwordSalt, @passwordHash, @role, 1)`,
    {
      id: newAdmin.id,
      username: newAdmin.username,
      displayName: newAdmin.displayName,
      passwordSalt: newAdmin.passwordSalt,
      passwordHash: newAdmin.passwordHash,
      role: newAdmin.role
    }
  );
  console.log(`Usuario administrador creado: ${username}`);
}

function isLocked(user) {
  if (!user.lockedUntil) return false;
  const lockedUntil = user.lockedUntil instanceof Date
    ? user.lockedUntil.getTime()
    : Date.parse(`${String(user.lockedUntil).replace(' ', 'T')}Z`);
  return lockedUntil > Date.now();
}

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.displayName,
    role: user.role.toLowerCase()
  };
}

module.exports = {
  findByUsername,
  verifyPassword,
  recordFailedLogin,
  recordSuccessfulLogin,
  ensureAdmin,
  isLocked,
  toPublicUser
};
