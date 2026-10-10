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

module.exports = { cookieName, requireJwt, requirePageJwt };