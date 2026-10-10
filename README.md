# HotelReserve Pro

Aplicación web para la administración hotelera. El primer incremento funcional
incluye autenticación, gestión de huéspedes, gestión de habitaciones, consulta de
disponibilidad y gestión de reservas. Los datos de la app se guardan en SQL
Server; las pruebas automatizadas usan datos temporales en memoria.

## Requisitos

- Node.js 20 o superior.
- npm.
- SQL Server 2019 o superior con autenticación de SQL Server habilitada.

## Instalación y ejecución

```powershell
npm install
Copy-Item .env.example .env
```

Antes de iniciar la app:

1. Abre `database/HotelReservePro.sql` en SQL Server Management Studio (SSMS).
2. Cambia `REPLACE_WITH_A_STRONG_PASSWORD` por una contraseña segura y ejecuta
   todo el script conectado a tu instancia de SQL Server. El script crea la base
   `HotelReservePro`, las tablas y el login de aplicación `hotelreserve_app`.
   Si ya habías creado la base con una versión anterior del script, ejecútalo
   nuevamente: es idempotente y agrega `guest_count` a reservas si falta.
3. Copia esa misma contraseña a `DB_PASSWORD` en `.env` y configura
   `DB_SERVER` con el host, deja `DB_PORT=1433` para la instancia por defecto, o
   configura `DB_INSTANCE=SQLEXPRESS` y deja `DB_PORT` vacío para una instancia
   nombrada. SQL Server debe permitir conexiones TCP/IP y autenticación SQL
   (modo mixto); en instancias locales puede ser necesario habilitarlas en SQL
   Server Configuration Manager y reiniciar el servicio.
4. Cambia `JWT_SECRET` por un secreto aleatorio de al menos 32 bytes.

Después inicia el servidor:

```powershell
npm run dev
```

Al arrancar, la app valida la conexión y crea el administrador si aún no existe.
Queda disponible en `http://localhost:3000`. Si ya tienes un login SQL Server,
reemplaza `hotelreserve_app` por el nombre de tu login en las instrucciones del
script, omite su bloque `CREATE LOGIN` y asigna a ese login el usuario de la base
con permisos `db_datareader` y `db_datawriter`; actualiza entonces `DB_USER` y
`DB_PASSWORD` con sus credenciales.

Acceso inicial:

- Usuario: `admin`
- Contraseña: `admin123`

Puedes definir `ADMIN_USER` y `ADMIN_PASSWORD` en `.env`. La cuenta inicial se
guarda en SQL Server y se crea con un hash `scrypt`; si ya existe, su contraseña
no se reemplaza automáticamente. Cambia la clave antes de exponer la app.

Para producción configura `NODE_ENV=production` y un `JWT_SECRET` aleatorio de
al menos 32 bytes. En ese entorno las cookies JWT se envían con el atributo
`Secure`. Para SQL Server de producción configura `DB_ENCRYPT=true` y
`DB_TRUST_SERVER_CERTIFICATE=false` con un certificado TLS confiable; el valor
`true` de desarrollo solo es apropiado para un SQL Server local.

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
    reservations/
      controllers/
      models/
      routes/
      services/
      views/
public/
  css/       # Hoja de estilos independiente por módulo
  js/        # JavaScript del frontend
```

- `models`: acceso parametrizado a SQL Server (con almacenes en memoria aislados
  para pruebas).
- `services`: autenticación y reglas de negocio.
- `controllers`: reciben solicitudes y construyen respuestas.
- `routes`: declaran endpoints y los enlazan con controladores.
- `main.js`: configura Express, middleware y monta las rutas de cada módulo.
- `public/css` y `public/js`: recursos frontend por módulo.

La API de autenticación está en `/api/auth` (`POST /login`, `POST /logout` y
`GET /me`). El dashboard está en `/dashboard`; huéspedes en `/guests` y
`/api/guests`; habitaciones en `/rooms` y `/api/rooms`; consulta de disponibilidad
en `/availability` y `GET /api/availability`; reservas en `/reservations` y
`/api/reservations`. Las rutas están protegidas por JWT. El módulo de reservas
permite crear y consultar estadías, confirmar las pendientes y cancelar
reservas pendientes o confirmadas. Valida las fechas, la capacidad y los
solapamientos de habitación. La consulta de disponibilidad excluye reservas
activas; crear una reserva valida de nuevo el intervalo dentro de una
transacción serializable para evitar sobreventas concurrentes. Los estados
`IN_PROGRESS` y `COMPLETED` quedan para el futuro módulo de check-in/check-out.

El JWT se firma con HS256 y se guarda en una cookie `HttpOnly` con
`SameSite=Strict`. Las contraseñas incorrectas bloquean la cuenta durante 15
minutos al alcanzar cinco intentos fallidos.

## Pruebas

```powershell
npm test
```

Las pruebas ejercitan autenticación, bloqueo de cuenta, rutas protegidas,
huéspedes, habitaciones, reservas, transiciones de estado, validación de fechas,
límites de intervalos y disponibilidad con almacenes en memoria y mocks SQL.
