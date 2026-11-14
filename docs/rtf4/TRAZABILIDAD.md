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
| CP-07c IN_PROGRESS / COMPLETED | HU-002 | A05 | `test/sqlserver-rtf4.integration.test.js` preparado; SQL real no habilitado | Bloqueado |
| CP-08a capacidad e intervalo inválido | HU-001/002 | A04/A06 | `test/reservations.test.js`, `test/availability.test.js` | Aprobado |
| CP-08b sin resultados | HU-002 | A04 | `test/availability.test.js`: 200 con `rooms: []` | Aprobado |
| CP-09a alta, ID y consulta posterior | HU-001 | A07 | `test/reservations.test.js`: creación/listado/detalle en memoria | Aprobado |
| CP-09b persistencia en SQL Server | HU-001 | A07 | Requiere ejecutar sobre `HotelReservePro_Test` | Bloqueado |
| CP-10 entrada hoy, salida posterior | HU-001 | A06 | `test/reservations.test.js`: fecha de Bogotá y estancia válida | Aprobado |
| CP-10 salida igual/anterior | HU-001 | A06 | `test/reservations.test.js`: validación 400 | Aprobado |
| CP-11 fecha imposible, texto y campos omitidos | HU-001 | A06 | `test/reservations.test.js`: rechazos sin alta | Aprobado |
| CP-12 límites 0/1/2/3/12/13 y fracción | HU-001 | A06 | `test/reservations.test.js`: límites y capacidad 12 | Aprobado |
| CP-13 huésped/habitación inexistentes y habitación no operativa | HU-001 | A08 | `test/reservations.test.js`: 404/409 diferenciados | Aprobado |
| CP-14 igualdad, cruce inicial/final y contención | HU-001 | A08 | `test/reservations.test.js` y `test/availability.test.js` | Aprobado |
| CP-15a entrada adyacente | HU-001 | A08 | `test/reservations.test.js`: nueva reserva al checkout | Aprobado |
| CP-15b disponibilidad desactualizada | HU-001 | A08/A10 | Concurrencia en memoria; carrera real requiere SQL Server | Bloqueado |
| CP-16a confirmar PENDING_DEPOSIT | HU-001 | A09 | `test/reservations.test.js`: respuesta 200 y CONFIRMED | Aprobado |
| CP-16b CONFIRMED → IN_PROGRESS | HU-001 | A09 | `test/reservations.test.js`: respuesta 409; conserva CONFIRMED | Aprobado |
| CP-17a competencia en memoria | HU-001 | A10 | `test/reservations.test.js`: una 201 y una 409 | Aprobado |
| CP-17b diez pares concurrentes con SQL Server | HU-001 | A10 | `test/sqlserver-rtf4.integration.test.js`, omitido por falta de perfil DB exclusivo habilitado | Bloqueado |
| CP-18 caída de conexión SQL | HU-001 | A11 | No se desconectó ningún servidor; no hay base exclusiva habilitada | Bloqueado |
| CP-19 fallo de begin SQL | HU-001 | A11 | Failpoint exclusivo listo; falta ejecutar integración SQL | Bloqueado |
| CP-20 escritura/rollback y fallo de rollback | HU-001 | A11 | Failpoints exclusivos listos; falta ejecutar integración SQL | Bloqueado |
| CP-21 commit confirmado y respuesta reconciliada | HU-001 | A11 | Idempotencia probada en memoria; failpoint SQL listo sin ejecutar | Bloqueado |
| CP-22 errores SQL 2601 y 2627 reales | HU-001 | A12 | Mapeo implementado; restricción SQL real no reproducida | Bloqueado |
| CP-23 error SQL 547 real durante alta | HU-001 | A12 | Mapeo contextual implementado; FK real no reproducida | Bloqueado |
| CP-24a reenvío con igual clave/entrada | HU-001 | A13 | `test/reservations.test.js`: mismo ID, distinta entrada 409 | Aprobado |
| CP-24b doble clic en navegador | HU-001 | A13 | Botón deshabilitado y misma clave; no hay runner de navegador | No ejecutado |
| CP-25a cálculo base 2 × COP 200.000 | HU-005 | A14 | `test/receipts.test.js`: total/saldo COP 400.000 | Aprobado |
| CP-25b comprobante con persistencia SQL | HU-005 | A14 | Requiere SQL Server real | Bloqueado |
| CP-26a consumo COP 50.000 y anticipo COP 100.000 | HU-005 | A14 | `test/receipts.test.js`: total COP 450.000/saldo COP 350.000 | Aprobado |
| CP-26b movimientos persistidos SQL | HU-005 | A14 | Requiere SQL Server real | Bloqueado |
| CP-27 reserva inexistente | HU-005 | A14 | `test/receipts.test.js`: 404 | Aprobado |
| CP-27b sin reserva seleccionada | HU-005 | A14 | Listado no emite comprobante hasta abrir reserva | Aprobado |
| CP-28 URL/PDF directo por CONSULTA | HU-005 | A15 | `test/receipts.test.js`: GET/PDF/página responden 403 | Aprobado |
| CP-29 dos reimpresiones | HU-005 | A14 | `test/receipts.test.js`: mismo ID y valores, PDF idéntico | Aprobado |
| CP-30 fallo de generación PDF controlado | HU-005 | A11/A14 | `test/receipts.test.js`: failpoint solo en `NODE_ENV=test`, responde 500 genérico y no altera importes | Aprobado |
| CP-31 recorrido integral en navegador | Todas | A13/A16 | Render HTTP y API por separado; Playwright no está instalado | No ejecutado |
| CP-32 operación de reserva directa por CONSULTA | HU-004/001 | A15 | `test/receipts.test.js`: 403 en ruta protegida | Aprobado |

## Evidencia reproducida

- Suite completa: `npm test`; resultado y fecha en [REPORTE_EJECUCION.md](./REPORTE_EJECUCION.md).
- Pruebas SQL con mocks: `test/sqlserver-models.test.js`.
- API HTTP con almacén temporal en memoria: `test/auth.test.js`, `test/availability.test.js`, `test/guests.test.js`, `test/reservations.test.js`, `test/receipts.test.js`, `test/rooms.test.js`.
- SQL Server real: `test/sqlserver-rtf4.integration.test.js` no se ejecutó; sus casos aparecen como Bloqueado, no como aprobado.
- Interfaz: pruebas de respuesta EJS/estáticos dentro de HTTP; no se guardaron capturas ni se ejecutó Playwright.

**HU-005 no se declara validada**: sus cálculos y API se comprobaron en memoria, pero falta la integración SQL Server real exigida para cargos, anticipos, tarifa histórica y reimpresión persistente.
