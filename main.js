require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { requireJwt, requirePageJwt } = require('./src/middlewares/jwt');
const authRoutes = require('./src/modules/auth/routes/authRoutes');
const dashboardRoutes = require('./src/modules/dashboard/routes/dashboardRoutes');
const dashboardPageRoutes = require('./src/modules/dashboard/routes/dashboardPageRoutes');

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
app.use('/dashboard', requirePageJwt, dashboardPageRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Endpoint no encontrado.' });
});

app.use((req, res) => {
  res.status(404).send('Página no encontrada.');
});

app.use((err, req, res, next) => {
  console.error(err);

  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ message: 'Ocurrió un error interno.' });
  }

  return res.status(500).send('Ocurrió un error interno.');
});

const port = Number(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`HotelReserve Pro disponible en http://localhost:${port}`);
  });
}

module.exports = app;