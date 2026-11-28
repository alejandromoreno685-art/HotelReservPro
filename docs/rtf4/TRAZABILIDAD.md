# Matriz de trazabilidad CP → HU → criterio → prueba → evidencia

Las evidencias nombradas son resultados reproducibles del repositorio, no capturas. `test` usa memoria para los módulos HTTP; `sqlserver-models.test.js` usa mocks. Las filas de SQL Server real se mantienen separadas.

| CP / variante | HU | Criterio | Prueba / evidencia | Estado |
|---|---|---|---|---|
| CP-01 | HU-004 | A01 | `test/auth.test.js`: login válido y acceso protegido | Aprobado |
| CP-02a contraseña incorrecta | HU-004 | A02 | `test/auth.test.js`: credenciales inválidas | Aprobado |
| CP-02b usuario inexistente | HU-004 | A02 | Mismo status y mensaje genérico que contraseña incorrecta | Aprobado |
| CP-03a usuario vacío | HU-004 | A02 | `test/auth.test.js`: campo obligatorio | Aprobado |
| CP-03b contraseña vacía | HU-004 | A02 | `test/auth.test.js`: campo obligatorio | Aprobado |
| CP-03c ambos vacíos | HU-004 | A02 | `test/auth.test.js`: campo obligatorio y sin cookie | Aprobado |
| CP-04a sin token | HU-004 | A03/A15 | `test/receipts.test.js`: API de reservas y comprobantes | Aprobado |
| CP-04b token vencido | HU-004 | A03 | `test/auth.test.js`, `test/receipts.test.js` | Aprobado |
| CP-04c token alterado | HU-004 | A03 | `test/auth.test.js`, `test/receipts.test.js` | Aprobado |
| CP-05 | HU-002 | A04 | `test/availability.test.js`: filtro por capacidad y estado físico | Aprobado |
| CP-06a intervalos adyacentes | HU-002 | A05 | `test/reservations.test.js`: salida/entrada el mismo día | Aprobado |
| CP-06b cruce de una noche | HU-002 | A05 | `test/reservations.test.js`: rechazo 409 | Aprobado |
| CP-07a PENDING_DEPOSIT / CONFIRMED | HU-002 | A05 | API temporal: estados activos excluyen habitación | Aprobado |
| CP-07b CANCELLED | HU-002 | A05 | API temporal: cancelación libera habitación | Aprobado |
| CP-07c IN_PROGRESS / COMPLETED | HU-002 | A05 | API + SQL Server real (ejecución 3): IN_PROGRESS excluye la habitación; CANCELLED y COMPLETED la liberan (estados preparados por SQL) | Aprobado |
| CP-08a capacidad e intervalo inválido | HU-001/002 | A04/A06 | `test/reservations.test.js`, `test/availability.test.js` | Aprobado |
| CP-08b sin resultados | HU-002 | A04 | `test/availability.test.js`: 200 con `rooms: []` | Aprobado |
| CP-09a alta, ID y consulta posterior | HU-001 | A07 | `test/reservations.test.js`: creación/listado/detalle en memoria | Aprobado |
| CP-09b persistencia en SQL Server | HU-001 | A07 | API + SQL Server real: 201, UUID, PENDING_DEPOSIT y consulta posterior con los mismos datos | Aprobado |
| CP-10 entrada hoy, salida posterior | HU-001 | A06 | `test/reservations.test.js`: fecha de Bogotá y estancia válida | Aprobado |
| CP-10 salida igual/anterior | HU-001 | A06 | `test/reservations.test.js`: validación 400 | Aprobado |
| CP-11 fecha imposible, texto y campos omitidos | HU-001 | A06 | `test/reservations.test.js`: rechazos sin alta | Aprobado |
| CP-12 límites 0/1/2/3/12/13 y fracción | HU-001 | A06 | `test/reservations.test.js`: límites y capacidad 12 | Aprobado |
| CP-13 huésped/habitación inexistentes y habitación no operativa | HU-001 | A08 | `test/reservations.test.js`: 404/409 diferenciados | Aprobado |
| CP-14 igualdad, cruce inicial/final y contención | HU-001 | A08 | `test/reservations.test.js` y `test/availability.test.js` | Aprobado |
| CP-15a entrada adyacente | HU-001 | A08 | `test/reservations.test.js`: nueva reserva al checkout | Aprobado |
| CP-15b disponibilidad desactualizada | HU-001 | A08/A10 | API + SQL Server real: otra sesión ocupa la habitación y el alta tardía responde 409 | Aprobado |
| CP-16a confirmar PENDING_DEPOSIT | HU-001 | A09 | `test/reservations.test.js`: respuesta 200 y CONFIRMED | Aprobado |
| CP-16b CONFIRMED → IN_PROGRESS | HU-001 | A09 | `test/reservations.test.js`: respuesta 409; conserva CONFIRMED | Aprobado |
| CP-17a competencia en memoria | HU-001 | A10 | `test/reservations.test.js`: una 201 y una 409 | Aprobado |
| CP-17b diez pares concurrentes con SQL Server | HU-001 | A10 | API + SQL Server real: 10 pares simultáneos, cada uno con una 201 y una 409 | Aprobado |
| CP-18 caída de conexión SQL | HU-001 | A11 | API con puerto de base de datos inaccesible: 500 con mensaje controlado y cero altas | Aprobado |
| CP-19 fallo de begin SQL | HU-001 | A11 | Punto de fallo de laboratorio + SQL Server real: 500 y cero altas; luego una solicitud normal funciona | Aprobado |
| CP-20 escritura/rollback y fallo de rollback | HU-001 | A11 | Puntos de fallo + SQL Server real: sin éxito y cero altas en ambas variantes | Aprobado |
| CP-21 commit confirmado y respuesta reconciliada | HU-001 | A11 | Punto de fallo + SQL Server real: la API reconcilia por Idempotency-Key, mismo ID y una sola alta | Aprobado |
| CP-22 errores SQL 2601 y 2627 reales | HU-001 | A12 | Errores reales del motor provocados en laboratorio: 409 con mensaje controlado | Aprobado |
| CP-23 error SQL 547 real durante alta | HU-001 | A12 | Error 547 real en alta y al eliminar huésped o habitación con reservas: 409 sin borrar datos | Aprobado |
| CP-24a reenvío con igual clave/entrada | HU-001 | A13 | `test/reservations.test.js`: mismo ID, distinta entrada 409 | Aprobado |
| CP-24b doble clic en navegador | HU-001 | A13 | Playwright + Chrome y API: doble envío deja una sola reserva activa en SQL | Aprobado |
| CP-25a cálculo base 2 × COP 200.000 | HU-005 | A14 | `test/receipts.test.js`: total/saldo COP 400.000 | Aprobado |
| CP-25b comprobante con persistencia SQL | HU-005 | A14 | SQL Server real: cambiar la tarifa actual no altera el comprobante (tarifa histórica) | Aprobado |
| CP-26a consumo COP 50.000 y anticipo COP 100.000 | HU-005 | A14 | `test/receipts.test.js`: total COP 450.000/saldo COP 350.000 | Aprobado |
| CP-26b movimientos persistidos SQL | HU-005 | A14 | SQL Server real: reenvío con la misma clave no duplica (1 fila); anticipo mayor al saldo y reserva cancelada responden 409 | Aprobado |
| CP-27 reserva inexistente | HU-005 | A14 | `test/receipts.test.js`: 404 | Aprobado |
| CP-27b sin reserva seleccionada | HU-005 | A14 | Listado no emite comprobante hasta abrir reserva | Aprobado |
| CP-28 URL/PDF directo por CONSULTA | HU-005 | A15 | `test/receipts.test.js`: GET/PDF/página responden 403 | Aprobado |
| CP-29 dos reimpresiones | HU-005 | A14 | `test/receipts.test.js`: mismo ID y valores, PDF idéntico | Aprobado |
| CP-30 fallo de generación PDF controlado | HU-005 | A11/A14 | `test/receipts.test.js`: failpoint solo en `NODE_ENV=test`, responde 500 genérico y no altera importes | Aprobado |
| CP-31 recorrido integral en navegador | Todas | A13/A16 | Playwright + Chrome y API: búsqueda, corrección de campo, alta y comprobante con el mismo ID | Aprobado |
| CP-32 operación de reserva directa por CONSULTA | HU-004/001 | A15 | `test/receipts.test.js`: 403 en ruta protegida | Aprobado |

## Evidencia reproducida

- Ejecución final del 14/11/2026 sobre `HotelReservePro_Test` (SQL Server 2022): **95/95 variantes de API y 13/13 de interfaz aprobadas**; Newman 30 solicitudes y 37 aserciones sin fallas. Detalle en [REPORTE_EJECUCION.md](./REPORTE_EJECUCION.md).
- La misma batería se repite en cada push en GitHub Actions con SQL Server en contenedor (`.github/workflows/harness.yml`).
- Pruebas unitarias y de rutas con memoria y mocks: `npm test`; cobertura de código: `npm run test:coverage`.
- Los estados `IN_PROGRESS` y `COMPLETED` se preparan por SQL porque no existe check-in/check-out en la aplicación (ver [PENDIENTES.md](./PENDIENTES.md)).
- CP-19 a CP-21 y CP-30 usan puntos de fallo de laboratorio, activos solo en el perfil de pruebas; los errores 2601, 2627 y 547 son reales del motor.
