# HotelReserve Pro

[![Arnés de pruebas](https://github.com/alejandromoreno685-art/HotelReservPro/actions/workflows/harness.yml/badge.svg)](https://github.com/alejandromoreno685-art/HotelReservPro/actions/workflows/harness.yml)

> **Entrega final de Ingeniería de Software II:** el balance del proyecto
> (resultados de pruebas, cobertura, alcance frente a Jira, retos del testing,
> trabajo futuro y guion de sustentación) está en
> [`docs/sustentacion/README.md`](docs/sustentacion/README.md).
>
> | Documento | Contenido |
> |---|---|
> | [Entrega final](docs/sustentacion/README.md) | Balance del semestre y cómo verificar las pruebas |
> | [Trazabilidad](docs/rtf4/TRAZABILIDAD.md) | Caso de prueba → HU → criterio → evidencia |
> | [Reporte de ejecución](docs/rtf4/REPORTE_EJECUCION.md) | Resultados de API, interfaz y Postman |
> | [Arnés con IA](docs/harness/README.md) | Arquitectura del arnés y pipeline |
> | [Ejecuciones en GitHub Actions](https://github.com/alejandromoreno685-art/HotelReservPro/actions/workflows/harness.yml) | Pruebas automáticas en cada push |

Aplicación web para la administración hotelera. El primer incremento funcional
incluye autenticación, gestión de huéspedes, gestión de habitaciones, consulta de
disponibilidad y gestión de reservas. Los datos de la app se guardan en SQL
Server; las pruebas automatizadas usan datos temporales en memoria.

## Requisitos

- Node.js 22 o superior (la cobertura de código usa opciones de `node:test` de esa versión).
- npm.
- SQL Server 2019 o superior con autenticación de SQL Server habilitada.

## Instalación y ejecución

```powershell
npm install
Copy-Item .env.example .env
```

Antes de iniciar la app:

1. Abre `database/HotelReservePro.sql` en SQL Server Management Studio (SSMS).
2. Activa **SQLCMD Mode** en SSMS. Cambia `REPLACE_WITH_A_STRONG_PASSWORD` por una contraseña segura y ejecuta
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

Define `ADMIN_USER` y `ADMIN_PASSWORD` localmente en `.env`; no compartas ni
commitas ese archivo. La cuenta inicial se guarda en SQL Server y se crea con un
hash `scrypt`; si ya existe, su contraseña no se reemplaza automáticamente.

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
    receipts/
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
`/api/reservations`. Las rutas están protegidas por JWT. El módulo de reservas permite crear y consultar estadías, confirmar las
pendientes y cancelar reservas pendientes o confirmadas. Valida las fechas
según `America/Bogota`, la capacidad y los solapamientos de habitación. Las
solicitudes de creación requieren `Idempotency-Key` y conservan su resultado
para poder reconciliar reintentos. La consulta de disponibilidad excluye
reservas activas; crear una reserva valida de nuevo el intervalo dentro de una
transacción serializable. Los estados `IN_PROGRESS` y `COMPLETED` no tienen
transiciones de entrada habilitadas; en particular CONFIRMED → IN_PROGRESS
responde 409. Por tanto, check-in/check-out todavía no se pueden completar.

El módulo de comprobantes genera una vista y un PDF interno enlazado con una
reserva. Conserva la tarifa al crearla y calcula alojamiento = noches × tarifa,
total = alojamiento + consumos y saldo = total − anticipos, sin impuestos
añadidos. Cargos y anticipos se almacenan en SQL Server y no se modifican al
reimprimir.

Roles: ADMIN tiene acceso completo; RECEPCION y el rol histórico RECEPTIONIST
tienen acceso a huéspedes, disponibilidad, reservas y comprobantes; CONSULTA
solo puede leer habitaciones y disponibilidad. La gestión de habitaciones se
reserva a ADMIN. El esquema actual no incluye administración de usuarios.

## Base de datos exclusiva para RTF4

Para no utilizar la base operacional, abre `database/HotelReservePro.sql` en
SSMS con SQLCMD Mode activado y cambia la variable `DatabaseName` de la primera
línea a `HotelReservePro_Test` antes de ejecutar. El script es aditivo y no
elimina tablas ni registros. Aplica también `migrations/001_RTF4_Receipts.sql`
conectado a `HotelReservePro_Test`. Configura `DB_NAME=HotelReservePro_Test`
solo en el `.env` local. El script de seed y la integración HTTP verifican tanto
el nombre de la base como `RTF4_SQLSERVER_TEST=1` antes de operar.

Genera contraseñas locales de pruebas para ADMIN, RECEPCION y CONSULTA en las
variables `RTF4_ADMIN_PASSWORD`, `RTF4_RECEPTION_PASSWORD` y
`RTF4_CONSULTA_PASSWORD`. No se incluyen credenciales en el repositorio ni en
el entorno Postman de ejemplo. Ejecuta el seed y la integración conforme a
`docs/rtf4/README.md`.

El JWT se firma con HS256 y se guarda en una cookie `HttpOnly` con
`SameSite=Strict`. Las contraseñas incorrectas bloquean la cuenta durante 15
minutos al alcanzar cinco intentos fallidos.

## Pruebas

```powershell
npm test
npm run test:coverage   # mismas pruebas con cobertura y umbral mínimo
```

Las pruebas ejercitan autenticación, bloqueo de cuenta, rutas protegidas,
huéspedes, habitaciones, reservas, transiciones de estado, validación de fechas,
límites de intervalos, comprobantes PDF y disponibilidad con almacenes en
memoria y mocks SQL. La integración con SQL Server real y los resultados de
RTF4 están documentados en `docs/rtf4/README.md`.

## Arnés de pruebas con IA y pipeline

| Comando | Qué ejecuta |
|---|---|
| `npm test` | Pruebas unitarias y de rutas con dobles de prueba (memoria y mocks) |
| `npm run test:coverage` | Las mismas pruebas con cobertura de código (umbral: 70 % líneas y ramas, 80 % funciones) |
| `npm run seed:rtf4` | Datos ficticios en `HotelReservePro_Test` |
| `npm run test:sqlserver` | 95 variantes de API (CP-01 a CP-32) contra SQL Server real |
| `npm run test:ui` | Recorridos de interfaz con Playwright y Chrome |
| `npm run ia:generar -- --hu HU-001` | La IA propone casos de borde para una HU (gratuito con Ollama: `ollama pull llama3.2`) |
| `npm run ia:clasificar -- --resultados <ruta>` | La IA clasifica las variantes fallidas de una ejecución |

El pipeline `.github/workflows/harness.yml` ejecuta todo en GitHub Actions en
cada push. La arquitectura y el detalle de cada componente están en
[`docs/harness/README.md`](docs/harness/README.md).
