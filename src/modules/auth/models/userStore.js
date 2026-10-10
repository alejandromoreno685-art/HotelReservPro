const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');

const adminUsername = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const passwordSalt = randomBytes(16);
const passwordHash = scryptSync(adminPassword, passwordSalt, 64);

const administrator = Object.freeze({
  id: 'user-admin',
  username: adminUsername,
  name: 'Administrador',
  role: 'admin',
  active: true,
  passwordSalt,
  passwordHash
});

function findByUsername(username) {
  if (typeof username !== 'string' || username !== administrator.username) {
    return null;
  }
  return administrator;
}

function verifyPassword(user, password) {
  if (!user || typeof password !== 'string') return false;

  const candidateHash = scryptSync(password, user.passwordSalt, user.passwordHash.length);
  return timingSafeEqual(candidateHash, user.passwordHash);
}

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  };
}

module.exports = { findByUsername, verifyPassword, toPublicUser };
