# Defectos, limitaciones y pendientes

## Defectos encontrados y corregidos

| ID | Caso | Defecto | Estado |
|---|---|---|---|
| DEF-01 | CP-13d/e | ID mal formado llegaba a SQL (8169) y respondía 500 | Corregido y repetido |
| DEF-02 | CP-26b | Reenviar un consumo lo duplicaba | Corregido y repetido |
| DEF-03 | CP-26c | Anticipo mayor al saldo dejaba saldo negativo | Corregido y repetido |
| DEF-04 | CP-26d | Movimientos en reservas canceladas | Corregido y repetido |
| DEF-05 | CP-09/16/24 UI | Elegir habitación vaciaba el selector; no se podían crear reservas desde la interfaz (crítico) | Corregido y repetido |
| DEF-06 | CP-11 UI | Errores sin mostrar junto al campo | Corregido y repetido |
| DEF-07 | CP-08 UI | Falla del servidor mostrada como "sin habitaciones" | Corregido y repetido |
| DEF-08 | UI-RESP | Desbordamiento horizontal de 156 px en móvil | Corregido y repetido |
| DEF-09 | CP-25/26 | Título del PDF invisible | Corregido y verificado |
| DEF-10 | Migración | El script agregaba y llenaba `rate_per_night` en el mismo lote (error 207 en bases existentes) | Corregido; base `HotelReservePro` respaldada y migrada el 14/11/2026 |

## Limitaciones y decisiones pendientes de aprobación

- Reglas implementadas pero no aprobadas por el docente: matriz de roles,
  409 para `CONFIRMED → IN_PROGRESS`, fórmula del comprobante, anticipo ≤ saldo
  y rechazo de movimientos en reservas canceladas.
- No hay check-in ni check-out; en CP-07 los estados `IN_PROGRESS` y
  `COMPLETED` se preparan por SQL.
- CP-19 a CP-23a y CP-30 usan puntos de fallo de laboratorio, activos solo con
  el perfil de pruebas; los errores 2601, 2627 y 547 son reales del motor.
- A las reservas anteriores a la migración se les asignó la tarifa actual de
  su habitación porque no existía un valor histórico.
- Pruebas en un solo equipo, una instancia de la aplicación y Chrome; sin
  pruebas de carga, accesibilidad formal ni cobertura de código.
