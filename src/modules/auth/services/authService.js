const jwt = require('jsonwebtoken');
const userStore = require('../models/userStore');
const { jwtSecret, tokenIssuer, tokenLifetimeSeconds } = require('../../../security');

async function authenticate(username, password) {
  const user = await userStore.findByUsername(username);
  if (!user) return null;
  if (userStore.isLocked(user)) return null;
  if (!user.active || !userStore.verifyPassword(user, password)) {
    await userStore.recordFailedLogin(user);
    return null;
  }

  await userStore.recordSuccessfulLogin(user);
  const publicUser = userStore.toPublicUser(user);
  const token = jwt.sign(
    { sub: user.id, username: user.username, role: publicUser.role },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: tokenLifetimeSeconds, issuer: tokenIssuer }
  );

  return { token, user: publicUser };
}

module.exports = { authenticate };
