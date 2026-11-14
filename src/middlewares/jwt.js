const jwt = require('jsonwebtoken');
const { jwtSecret, tokenIssuer } = require('../security');

const cookieName = 'hotelreserve_token';

function tokenFromRequest(req) {
  const cookieToken = req.cookies && req.cookies[cookieName];
  if (cookieToken) return cookieToken;

  const authorization = req.get('authorization');
  if (authorization && authorization.startsWith('Bearer ')) {
    return authorization.slice(7);
  }

  return null;
}

function authenticate(req) {
  const token = tokenFromRequest(req);
  if (!token) return false;

  try {
    req.auth = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
      issuer: tokenIssuer
    });
    return true;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return false;
    }
    throw error;
  }
}

function requireJwt(req, res, next) {
  if (!authenticate(req)) {
    return res.status(401).json({ message: 'Debes iniciar sesión para continuar.' });
  }
  return next();
}

function requirePageJwt(req, res, next) {
  if (!authenticate(req)) {
    return res.redirect('/login');
  }
  return next();
}

function requireRoles(...roles) {
  const allowed = new Set(roles.map((role) => role.toLowerCase()));
  return (req, res, next) => {
    const role = req.auth && req.auth.role;
    const normalizedRole = role === 'receptionist' ? 'recepcion' : role;
    if (!normalizedRole || !allowed.has(normalizedRole.toLowerCase())) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(403).json({ message: 'No tienes permiso para realizar esta operación.' });
      }
      return res.status(403).send('No tienes permiso para acceder a esta página.');
    }
    return next();
  };
}

module.exports = { cookieName, requireJwt, requirePageJwt, requireRoles };