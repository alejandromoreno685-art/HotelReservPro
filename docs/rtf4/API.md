# Contrato HTTP real

Base local: `http://localhost:3000`. Las rutas de página y API usan cookie `HttpOnly` de sesión. También se admite `Authorization: Bearer <JWT>`.

## Autenticación

| Método | Ruta | Entrada | Respuesta | Permiso |
|---|---|---|---|---|
| POST | `/api/auth/login` | JSON `{username,password}` | 200 `{user}` y cookie; 400 campos vacíos; 401 mensaje genérico | Público |
| POST | `/api/auth/logout` | Cookie/token | 204 | Cualquier usuario autenticado |
| GET | `/api/auth/me` | Cookie/token | 200 `{user}` | Cualquier usuario autenticado |

La API devuelve 401 cuando falta, venció o fue alterado el token. Las páginas redirigen al login. Una sesión válida sin autorización devuelve 403 (JSON en API, página de error en vistas).

## Habitaciones, huéspedes y disponibilidad

| Método y ruta | Parámetros / cuerpo | Respuesta | Permiso |
|---|---|---|---|
| GET `/api/rooms` | `search`, `type`, `status` opcionales | 200 `{rooms}` | ADMIN, RECEPCION, CONSULTA |
| GET `/api/rooms/:id` | ID de habitación | 200 `{room}`, 404 | ADMIN, RECEPCION, CONSULTA |
| POST `/api/rooms` | JSON de habitación | 201 `{room}` | ADMIN |
| PUT `/api/rooms/:id` | Campos de habitación | 200 `{room}` | ADMIN |
| DELETE `/api/rooms/:id` | ID | 204; 409 si tiene reservas | ADMIN |
| GET `/api/guests` | `search` opcional | 200 `{guests}` | ADMIN, RECEPCION |
| GET `/api/guests/:id` | ID de huésped | 200 `{guest}`, 404 | ADMIN, RECEPCION |
| POST `/api/guests` | JSON del huésped | 201 `{guest}`, 400/409 | ADMIN, RECEPCION |
| PUT `/api/guests/:id` | Campos de huésped | 200 `{guest}`, 400/404/409 | ADMIN, RECEPCION |
| DELETE `/api/guests/:id` | ID | 204; 409 si tiene reservas | ADMIN, RECEPCION |
| GET `/api/availability` | `checkIn`, `checkOut`, `guestCount`, `roomType` opcional | 200 `{criteria,rooms}`; lista vacía es resultado válido; 400 fechas/huéspedes inválidos | ADMIN, RECEPCION, CONSULTA |

## Reservas

| Método y ruta | Parámetros / cuerpo | Respuesta | Permiso |
|---|---|---|---|
| GET `/api/reservations` | `status` opcional | 200 `{reservations}` | ADMIN, RECEPCION |
| GET `/api/reservations/options` | — | 200 `{guests,rooms}` | ADMIN, RECEPCION |
| GET `/api/reservations/available-rooms` | `checkIn`, `checkOut`, `guestCount` | 200 `{criteria,rooms}` | ADMIN, RECEPCION |
| POST `/api/reservations` | JSON `{guestId,roomId,checkIn,checkOut,guestCount}` y header `Idempotency-Key` obligatorio (1–100 caracteres seguros) | 201 `{reservation}`; 400 validación; 404 huésped/habitación; 409 solapamiento, clave reutilizada con otra entrada o conflicto | ADMIN, RECEPCION |
| GET `/api/reservations/idempotency/:key` | Clave de solicitud | 200 `{reservation}`; 404 aún no persistida | ADMIN, RECEPCION |
| GET `/api/reservations/:id` | ID | 200 `{reservation}`, 404 | ADMIN, RECEPCION |
| PATCH `/api/reservations/:id/status` | JSON `{status}` | 200 `{reservation}`; 400 estado inválido; 409 transición no permitida/concurrencia | ADMIN, RECEPCION |
| POST `/api/reservations/:id/cancel` | ID | 200 `{reservation}`; 404/409 | ADMIN, RECEPCION |

La entrada debe ser una fecha real `YYYY-MM-DD` no anterior al día actual de `America/Bogota`; la salida es posterior. Las noches son `[checkIn, checkOut)`. El número de huéspedes es entero 1–12 y no excede la capacidad. Los errores SQL 2601/2627 se traducen en conflicto; una FK 547 de alta no recibe un mensaje de eliminación.

## Comprobantes

| Método y ruta | Parámetros / cuerpo | Respuesta | Permiso |
|---|---|---|---|
| GET `/api/receipts/:reservationId` | ID de reserva | 200 `{receipt}`; 404 | ADMIN, RECEPCION |
| GET `/api/receipts/:reservationId/pdf` | ID; `?download=1` descarga, si no vista en línea | `application/pdf`; 404 reserva inexistente; 500 genérico si falla generación | ADMIN, RECEPCION |
| POST `/api/receipts/:reservationId/charges` | JSON `{description,amount}`; importe entero positivo <= 999999999999 | 201 `{receipt}`; 400/404/409 | ADMIN, RECEPCION |
| POST `/api/receipts/:reservationId/payments` | JSON `{description,amount}`; concepto predeterminado “Anticipo” | 201 `{receipt}`; 400/404/409 | ADMIN, RECEPCION |
| GET `/receipts` | Página con reservas enlazadas | HTML | ADMIN, RECEPCION |
| GET `/receipts/:reservationId` | Página de detalle, movimientos y vista previa | HTML; 404 | ADMIN, RECEPCION |

Campos de `receipt`: `receiptId`, `reservationId`, huésped/documento, habitación, fechas, noches, `ratePerNight`, `accommodation`, `charges`, `chargeTotal`, `payments`, `paymentTotal`, `total`, `balance`, `currency` y etiqueta de comprobante interno. Los valores monetarios calculados se devuelven como strings enteros para evitar pérdida de precisión.

El PDF puede abrirse en línea o descargarse. Ambos usan el mismo dato persistido; generar/reimprimir no escribe cargos ni anticipos.

## Páginas

`/login`, `/dashboard`, `/rooms`, `/guests`, `/availability`, `/reservations`, `/reservations/:id`, `/receipts` y `/receipts/:reservationId`. Las rutas protegidas requieren JWT. CONSULTA solo puede abrir `/rooms` y `/availability`.

Errores no controlados responden con texto genérico y no incluyen SQL, stack traces ni credenciales. Los detalles de errores internos solo se registran en el servidor.
