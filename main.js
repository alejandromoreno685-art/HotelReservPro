require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const database = require('./src/database');
const userStore = require('./src/modules/auth/models/userStore');
const { requireJwt, requirePageJwt } = require('./src/middlewares/jwt');
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
app.use('/api/dashboard', requireJwt, dashboardRoutes);
app.use('/api/rooms', requireJwt, roomRoutes);
app.use('/api/guests', requireJwt, guestRoutes);
app.use('/api/availability', requireJwt, availabilityRoutes);
app.use('/api/reservations', requireJwt, reservationRoutes);
app.use('/dashboard', requirePageJwt, dashboardPageRoutes);
app.use('/rooms', requirePageJwt, roomPageRoutes);
app.use('/guests', requirePageJwt, guestPageRoutes);
app.use('/availability', requirePageJwt, availabilityPageRoutes);
app.use('/reservations', requirePageJwt, reservationPageRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Endpoint no encontrado.' });
});

app.use((req, res) => {
  res.status(404).send('Página no encontrada.');
});

app.use((err, req, res, next) => {
  const statusCode = Number.isInteger(err.statusCode)
    ? err.statusCode
    : ([2601, 2627, 547].includes(err.number) ? 409 : 500);
  const message = statusCode < 500
    ? (err.number === 547
      ? 'No se puede eliminar el registro porque tiene información relacionada.'
      : (err.number ? 'El registro ya existe.' : err.message))
    : 'Ocurrió un error interno.';
  if (statusCode >= 500) console.error(err);

  if (req.path.startsWith('/api/')) {
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