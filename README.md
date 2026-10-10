# HotelReserve Pro

Aplicación web para la administración hotelera. El primer incremento funcional
incluye autenticación, gestión de huéspedes, gestión de habitaciones y consulta
de disponibilidad. Por ahora los datos se guardan temporalmente en memoria y se
eliminan cuando se detiene o reinicia el servidor; todavía no se conecta a una
base de datos.

## Requisitos

- Node.js 20 o superior.
- npm.

## Instalación y ejecución

```powershell
npm install
npm run dev
```

La aplicación estará en `http://localhost:3000`. `npm run dev` no ejecuta
migraciones ni necesita Docker o un servidor MySQL.

Acceso inicial:

- Usuario: `admin`
- Contraseña: `admin123`

Para desarrollo local, puedes definir `ADMIN_USER` y `ADMIN_PASSWORD` en `.env`.
La cuenta inicial se crea en memoria al iniciar el servidor. Cambia la clave
antes de exponer la aplicación a otras personas.

Para producción configura `NODE_ENV=production` y un `JWT_SECRET` aleatorio de
al menos 32 bytes. En ese entorno las cookies JWT se envían con el atributo
`Secure`.

## Arquitectura

Cada módulo funcional separa responsabilidades en `models`, `services`,
`controllers`, `routes` y `views`:

```text
src/
  middlewares/
  modules/
    auth/
      controllers/
      models/
      routes/
      services/
      views/
    dashboard/
      controllers/
      models/
      routes/
      services/
      views/
    rooms/
      controllers/
      models/
      routes/
      services/
      views/
    guests/
      controllers/
      models/
      routes/
      services/
      views/
    availability/
      controllers/
      models/
      routes/
      services/
      views/
public/
  css/       # Hoja de estilos independiente por módulo
  js/        # JavaScript del frontend
```

- `models`: almacenes temporales en memoria para los datos de la aplicación.
- `services`: autenticación y reglas de negocio.
- `controllers`: reciben solicitudes y construyen respuestas.
- `routes`: declaran endpoints y los enlazan con controladores.
- `main.js`: configura Express, middleware y monta las rutas de cada módulo.
- `public/css` y `public/js`: recursos frontend por módulo.

La API de autenticación está en `/api/auth` (`POST /login`, `POST /logout` y
`GET /me`). El dashboard está en `/dashboard`; huéspedes en `/guests` y
`/api/guests`; habitaciones en `/rooms` y `/api/rooms`; consulta de disponibilidad
en `/availability` y `GET /api/availability`. Las rutas de escritura están
protegidas por JWT. La disponibilidad valida los intervalos `[entrada, salida)` y excluye
habitaciones físicamente no disponibles. La gestión de reservas todavía no está
implementada; por ahora no se guardan reservas ni se detectan cruces contra
reservas existentes. Todos los datos de huéspedes y habitaciones también se
pierden al reiniciar el servidor.

El JWT se firma con HS256 y se guarda en una cookie `HttpOnly` con
`SameSite=Strict`. Las contraseñas incorrectas bloquean la cuenta durante 15
minutos al alcanzar cinco intentos fallidos.

## Pruebas

```powershell
npm test
```

Las pruebas ejercitan autenticación, bloqueo de cuenta, rutas protegidas,
huéspedes, habitaciones, validación de fechas, límites de intervalos y
disponibilidad con almacenes en memoria.
