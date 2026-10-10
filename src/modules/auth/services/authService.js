const jwt = require('jsonwebtoken');
const userStore = require('../models/userStore');
const { jwtSecret, tokenIssuer, tokenLifetimeSeconds } = require('../../../security');

function authenticate(username, password) {
  const user = userStore.findByUsername(username);
  if (!user || !user.active || !userStore.verifyPassword(user, password)) {
    return null;
  }

  const publicUser = userStore.toPublicUser(user);
  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: tokenLifetimeSeconds, issuer: tokenIssuer }
  );

  return { token, user: publicUser };
}

module.exports = { authenticate };
