require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const database = require('./src/database');
const userStore = require('./src/modules/auth/models/userStore');
const { requireJwt, requirePageJwt, requireRoles } = require('./src/middlewares/jwt');
const authRoutes = require('./src/modules/auth/routes/authRoutes');
const dashboardRoutes = require('./src/modules/dashboard/routes/dashboardRoutes');
const dashboardPageRoutes = require('./src/modules/dashboard/routes/dashboardPageRoutes');
const roomRoutes = require('./src/modules/rooms/routes/roomRoutes');
const roomPageRoutes = require('./src/modules/rooms/routes/roomPageRoutes');
const guestRoutes = require('./src/modules/guests/routes/guestRoutes');
const guestPageRoutes = require('./src/modules/guests/routes/guestPageRoutes');
const availabilityRoutes = require('./src/modules/availability/routes/availabilityRoutes');
const availabilityPageRoutes = require('./src/modules/availability/routes/availabilityPageRoutes');
const reservationRoutes = require('./src/modules/reservations/routes/reservationRoutes');
const reservationPageRoutes = require('./src/modules/reservations/routes/reservationPageRoutes');
const receiptRoutes = require('./src/modules/receipts/routes/receiptRoutes');
const receiptPageRoutes = require('./src/modules/receipts/routes/receiptPageRoutes');

const app = express();
const modulesPath = path.join(__dirname, 'src', 'modules');
const publicPath = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', modulesPath);
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(cookieParser());
app.use(express.static(publicPath));

app.get('/', (req, res) => res.redirect('/dashboard'));
app.get('/login', (req, res) => res.render('auth/views/login'));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', requireJwt, requireRoles('admin', 'recepcion'), dashboardRoutes);
app.use('/api/rooms', requireJwt, requireRoles('admin', 'recepcion', 'consulta'), roomRoutes);
app.use('/api/guests', requireJwt, requireRoles('admin', 'recepcion'), guestRoutes);
app.use('/api/availability', requireJwt, requireRoles('admin', 'recepcion', 'consulta'), availabilityRoutes);
app.use('/api/reservations', requireJwt, requireRoles('admin', 'recepcion'), reservationRoutes);
app.use('/api/receipts', requireJwt, requireRoles('admin', 'recepcion'), receiptRoutes);
app.use('/dashboard', requirePageJwt, requireRoles('admin', 'recepcion'), dashboardPageRoutes);
app.use('/rooms', requirePageJwt, requireRoles('admin', 'recepcion', 'consulta'), roomPageRoutes);
app.use('/guests', requirePageJwt, requireRoles('admin', 'recepcion'), guestPageRoutes);
app.use('/availability', requirePageJwt, requireRoles('admin', 'recepcion', 'consulta'), availabilityPageRoutes);
app.use('/reservations', requirePageJwt, requireRoles('admin', 'recepcion'), reservationPageRoutes);
app.use('/receipts', requirePageJwt, requireRoles('admin', 'recepcion'), receiptPageRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Endpoint no encontrado.' });
});

app.use((req, res) => {
  res.status(404).send('Página no encontrada.');
});

const connectionErrorCodes = new Set(['ESOCKET', 'ETIMEOUT', 'ELOGIN', 'ECONNCLOSED', 'ENOTOPEN', 'ECONNRESET']);

function describeError(err) {
  if (Number.isInteger(err.statusCode)) {
    return { statusCode: err.statusCode, message: err.statusCode < 500 ? err.message : (err.publicMessage || 'Ocurrió un error interno.') };
  }
  if (err.type === 'entity.parse.failed') {
    return { statusCode: 400, message: 'El cuerpo de la solicitud no es un JSON válido.' };
  }
  if ([2601, 2627].includes(err.number)) {
    return { statusCode: 409, message: 'La operación entra en conflicto con información que ya existe.' };
  }
  if (err.number === 547) {
    return { statusCode: 409, message: 'La operación no se completó porque el registro está relacionado con otra información o la referencia ya no existe.' };
  }
  if (err.number === 1205) {
    return { statusCode: 409, message: 'Otra operación usaba la misma información. Consulta de nuevo e inténtalo otra vez.' };
  }
  if (err.name === 'ConnectionError' || connectionErrorCodes.has(err.code)) {
    return { statusCode: 500, message: 'No fue posible conectar con la base de datos. No se guardaron cambios; intenta más tarde.' };
  }
  return { statusCode: 500, message: 'Ocurrió un error interno.' };
}

app.use((err, req, res, next) => {
  const { statusCode, message } = describeError(err);
  // El detalle técnico queda solo en el registro del servidor, nunca en la respuesta.
  if (statusCode >= 500) console.error(err);

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(statusCode).json({ message });
  }

  return res.status(statusCode).send(message);
});

const port = Number(process.env.PORT) || 3000;

if (require.main === module) {
  async function start() {
    try {
      await database.checkConnection();
      await userStore.ensureAdmin();
      app.listen(port, () => {
        console.log(`HotelReserve Pro disponible en http://localhost:${port}`);
      });
    } catch (error) {
      console.error('No fue posible iniciar la app. Verifica SQL Server, el esquema y las credenciales DB_*.', error);
      await database.closePool();
      process.exitCode = 1;
    }
  }

  start();
}

module.exports = app;