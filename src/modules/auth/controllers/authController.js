const authService = require('../services/authService');
const { cookieName } = require('../../../middlewares/jwt');
const { tokenLifetimeSeconds, isProduction } = require('../../../security');

function login(req, res) {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string' ||
      username.trim().length === 0 || password.length === 0) {
    return res.status(400).json({ message: 'Ingresa el usuario y la contraseña.' });
  }

  const session = authService.authenticate(username.trim(), password);
  if (!session) {
    return res.status(401).json({ message: 'Usuario o contraseña incorrectos.' });
  }

  res.cookie(cookieName, session.token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: tokenLifetimeSeconds * 1000,
    path: '/'
  });

  return res.json({ user: session.user });
}

function logout(req, res) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/'
  });
  return res.status(204).end();
}

function currentUser(req, res) {
  return res.json({
    user: {
      id: req.auth.sub,
      username: req.auth.username,
      role: req.auth.role
    }
  });
}

module.exports = { login, logout, currentUser };
