const isProduction = process.env.NODE_ENV === 'production';
const configuredSecret = process.env.JWT_SECRET;

if (isProduction && !configuredSecret) {
  throw new Error('JWT_SECRET es obligatorio cuando NODE_ENV=production.');
}

if (configuredSecret && Buffer.byteLength(configuredSecret) < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 bytes.');
}

module.exports = {
  jwtSecret: configuredSecret || 'hotelreserve-development-secret-change-before-production',
  tokenIssuer: 'hotelreserve-pro',
  tokenLifetimeSeconds: 60 * 60 * 2,
  isProduction
};
