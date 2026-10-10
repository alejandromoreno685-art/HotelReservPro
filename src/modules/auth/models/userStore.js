const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');

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

async function findByUsername(username) {
  return users.get(username) || null;
}

function verifyPassword(user, password) {
  if (!user || typeof password !== 'string') return false;
  const candidateHash = scryptSync(password, user.passwordSalt, 64);
  return timingSafeEqual(candidateHash, user.passwordHash);
}

async function recordFailedLogin(user) {
  user.failedAttempts += 1;
  if (user.failedAttempts >= 5) {
    user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
}

async function recordSuccessfulLogin(user) {
  user.failedAttempts = 0;
  user.lockedUntil = null;
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
  isLocked,
  toPublicUser
};
