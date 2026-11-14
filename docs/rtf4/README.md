# RTF4 — HotelReserve Pro

## Alcance implementado

- Reservas con fechas de `America/Bogota`, estancia semiabierta `[entrada, salida)`, capacidad y habitación operativa validadas.
- Transacción serializable, revalidación de cruces y `Idempotency-Key` persistida. El endpoint de reconciliación y la interfaz consultan el resultado antes de presentar un reintento como alta nueva.
- Tarifa por noche congelada en el registro de reserva. Comprobantes internos vinculados a la reserva, con vista web, PDF de vista previa/descarga, consumos, anticipos y saldo.
- Autorización server-side para ADMIN, RECEPCION/RECEPTIONIST y CONSULTA.
- Migración aditiva para tarifa histórica, idempotencia, consumos, anticipos y rol CONSULTA. No borra registros.
- Colección Postman y seed SQL ficticio, protegidos por comprobación explícita de la base `HotelReservePro_Test`.

## Decisiones de implementación y límites funcionales

- `alojamiento = noches × tarifa guardada en la reserva`; `total = alojamiento + consumos`; `saldo = total − anticipos`. COP se maneja como pesos enteros con `DECIMAL(12,0)`. No se agregan impuestos ni cargos automáticos.
- El documento se identifica como **comprobante interno; no es factura electrónica**. Su identificador estable es `CMP-{id de reserva}`. Consultarlo o descargarlo no crea movimientos económicos.
- Los movimientos económicos son renglones persistidos en `ReservationCharges` y `ReservationPayments`. El servidor calcula los totales; la API no acepta un total final del navegador.
- En las reservas anteriores a la migración no existe una tarifa histórica recuperable. La migración inicializa `rate_per_night` usando la tarifa actual de su habitación; desde la migración, las nuevas reservas conservan su propia tarifa.
- Transiciones permitidas: `PENDING_DEPOSIT → CONFIRMED`, `PENDING_DEPOSIT → CANCELLED` y `CONFIRMED → CANCELLED`. `CONFIRMED → IN_PROGRESS` devuelve 409. No hay acciones de check-in/check-out ni transiciones de entrada a `IN_PROGRESS` o `COMPLETED`; el cambio de esta regla requiere decisión funcional y actualización del RTF4.
- Los estados `PENDING_DEPOSIT`, `CONFIRMED` e `IN_PROGRESS` bloquean disponibilidad. `CANCELLED` y `COMPLETED` no la bloquean.
- `RECEPTIONIST` continúa autorizado y se normaliza al rol visible `recepcion`; `RECEPCION` también es aceptado. No existe módulo de administración de usuarios en el proyecto.

## Preparación reproducible

1. Usa una instancia/base SQL Server dedicada a pruebas. No apuntes estas pruebas a una base operacional.
2. En SSMS, abre `database/HotelReservePro.sql`, activa **SQLCMD Mode**, cambia solo la primera línea a `:setvar DatabaseName "HotelReservePro_Test"` y ejecuta el script. El script base es idempotente y no contiene `DROP TABLE`/`DELETE`.
3. Ejecuta `migrations/001_RTF4_Receipts.sql` conectado a SQL Server. La migración selecciona `HotelReservePro_Test` expresamente.
4. En el `.env` local, selecciona `DB_NAME=HotelReservePro_Test` y la conexión a la instancia de prueba. Configura localmente tres contraseñas de al menos 12 caracteres en `RTF4_ADMIN_PASSWORD`, `RTF4_RECEPTION_PASSWORD` y `RTF4_CONSULTA_PASSWORD`. No copies valores reales a esta documentación.
5. En una terminal PowerShell para el seed/integración, establece:

   ```powershell
   $env:NODE_ENV = 'rtf4-integration'
   $env:RTF4_SQLSERVER_TEST = '1'
   $env:DB_NAME = 'HotelReservePro_Test'
   node scripts/seed-rtf4.js
   ```

   El seed crea usuarios ficticios (`rtf4-admin`, `rtf4-recepcion`, `rtf4-consulta`), dos huéspedes y cuatro habitaciones de prueba. Es repetible y no elimina datos. Contraseñas deben proceder de un gestor local de secretos o de variables de entorno; no se guardan en la colección Postman.
6. Importa `postman/HotelReservePro_RTF4.postman_collection.json` y `postman/HotelReservePro_RTF4.postman_environment.json`. Completa la contraseña local y los IDs ficticios devueltos por la base. La sesión se conserva en el cookie jar de Postman.
7. Inicia la aplicación con el `.env` apuntando a la base exclusiva. Ejecuta:

   ```powershell
   npm start
   ```

8. Con las variables de entorno anteriores todavía definidas y credenciales ficticias configuradas, ejecuta la integración SQL real:

   ```powershell
   node --test test/sqlserver-rtf4.integration.test.js
   ```

   Incluye diez pares HTTP concurrentes y una verificación de los cinco estados. Los puntos `RTF4_TEST_FAILPOINT` solo se activan al cumplirse simultáneamente `NODE_ENV=rtf4-integration`, `DB_NAME=HotelReservePro_Test` y `RTF4_SQLSERVER_TEST=1`. Los puntos prueban begin, rollback y reconciliación después del commit; no simulan las restricciones 2601/2627/547.

Para validar sin SQL Server:

```powershell
npm test
```

En esa modalidad los módulos de negocio usan memoria temporal; las pruebas `sqlserver-models.test.js` son mocks. No acreditan persistencia SQL ni concurrencia del motor.

## Si aparece `Invalid column name 'rate_per_night'`

La app logró conectarse, pero la base seleccionada aún no tiene el esquema
RTF4. Detén el servidor y no ejecutes cambios en una base productiva o
compartida. Solo si confirmaste que `DB_NAME` es una base local **exclusiva de
pruebas**, abre `database/HotelReservePro.sql` en SSMS con SQLCMD Mode, cambia
`DatabaseName` para que coincida exactamente con esa base y ejecuta el script
aditivo. No compartas el `.env`. El script agrega la columna y llena el snapshot
de reservas existentes con la tarifa de su habitación, además de crear las
estructuras RTF4 que falten.

Confirma en SSMS que `COL_LENGTH('dbo.Reservations', 'rate_per_night')` no sea
`NULL` y que existan `ReservationRequests`, `ReservationCharges` y
`ReservationPayments`; luego reinicia la aplicación. La migración
`migrations/001_RTF4_Receipts.sql` selecciona expresamente
`HotelReservePro_Test` y no debe usarse con otra base. Si no puedes confirmar
que la base es exclusiva de pruebas, no ejecutes ninguno de esos scripts.
Antes de ejecutar el script base en una base existente, revisa su bloque
`CREATE LOGIN`: si `hotelreserve_app` no existe, sustituye el marcador de
contraseña por una contraseña fuerte configurada localmente, o adapta/omite
ese bloque si ya usas otro login SQL. No compartas esa contraseña.

## Archivos de soporte

- Contrato de API y permisos: [API.md](./API.md)
- Diagramas Mermaid, estados y matriz de roles: [MODELOS.md](./MODELOS.md)
- Casos CP-01–CP-32 y trazabilidad: [TRAZABILIDAD.md](./TRAZABILIDAD.md)
- Resultados y limitaciones de esta ejecución: [REPORTE_EJECUCION.md](./REPORTE_EJECUCION.md)
- Bloqueos y defectos pendientes: [PENDIENTES.md](./PENDIENTES.md)

- Colección y entorno Postman: [postman/](./postman/)

## Guion de demostración

1. Iniciar sesión con la cuenta ficticia ADMIN y abrir disponibilidad.
2. Crear una reserva de dos noches con huésped ficticio y habitación H1; guardar el ID y recargar la lista.
3. Abrir detalle y comprobante. Confirmar tarifa histórica, alojamiento y saldo.
4. Registrar consumo por COP 50.000 y anticipo por COP 100.000. Verificar total COP 450.000 y saldo COP 350.000.
5. Abrir vista previa y descargar el PDF; repetir la descarga y comprobar que los importes no cambian.
6. Repetir con usuario CONSULTA: habitaciones/disponibilidad responden; huéspedes, reservas y comprobantes responden 403. Sin sesión, la API responde 401.
7. En reservas, confirmar una pendiente; demostrar que el intento CONFIRMED → IN_PROGRESS responde 409 y conserva CONFIRMED. Cancelar para liberar el intervalo.

## Estado

Las pruebas de integración con SQL Server, Postman y la interfaz ya se ejecutaron sobre `HotelReservePro_Test`. Resultados en [REPORTE_EJECUCION.md](./REPORTE_EJECUCION.md); defectos y limitaciones en [PENDIENTES.md](./PENDIENTES.md).
