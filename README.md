# HotelReserve Pro

Aplicación web para la administración hotelera. Esta primera entrega contiene la
arquitectura modular, inicio de sesión con JWT y un panel inicial. Todavía no se
conecta a SQL Server, MySQL ni a otro motor de base de datos: los datos actuales
son temporales y viven únicamente mientras el proceso Node.js está activo.

## Requisitos

- Node.js 20 o superior.
- npm.

## Instalación y ejecución

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`.

Acceso inicial:

- Usuario: `admin`
- Contraseña: `admin123`

En `.env` puedes configurar `ADMIN_USER` y `ADMIN_PASSWORD`. La contraseña del
administrador se deriva y verifica con `scrypt`; no se conserva como texto plano
en el almacén temporal. Cambia la contraseña inicial antes de exponer el servicio.

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
public/
  css/       # Hoja de estilos independiente por módulo
  js/        # JavaScript del frontend
```

- `models`: almacén temporal y acceso a datos.
- `services`: autenticación y reglas de negocio.
- `controllers`: reciben solicitudes y construyen respuestas.
- `routes`: declaran endpoints y los enlazan con controladores.
- `main.js`: configura Express, middleware y monta las rutas de cada módulo.
- `public/css` y `public/js`: recursos frontend por módulo.

La API de autenticación está en `/api/auth` (`POST /login`, `POST /logout` y
`GET /me`). El dashboard protegido está en `/dashboard` y su resumen se entrega
por `GET /api/dashboard/summary`. El JWT se firma con HS256 y se guarda en una
cookie `HttpOnly` con `SameSite=Strict`.

## Pruebas

```powershell
npm test
```

Las pruebas ejercitan autenticación, cookies JWT, protección del dashboard,
cierre de sesión y respuesta del resumen temporal.
