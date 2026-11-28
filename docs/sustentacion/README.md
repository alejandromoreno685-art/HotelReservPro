# Entrega final y sustentación — HotelReserve Pro

[![Arnés de pruebas](https://github.com/alejandromoreno685-art/HotelReservPro/actions/workflows/harness.yml/badge.svg)](https://github.com/alejandromoreno685-art/HotelReservPro/actions/workflows/harness.yml)

**Ingeniería de Software II** · Docente: Juan Camilo Palacio Alcaraz
**Autor:** Alejandro Moreno Jiménez
**Caso:** Hostería y Hotel El Turista — reservas, disponibilidad y comprobantes de estadía.

Este documento reúne el balance del semestre: cómo verificar las pruebas, qué
resultados dieron, qué se entregó frente a lo planeado, los retos del testing y
el trabajo futuro. Todos los números salen de ejecuciones reales del repositorio.

---

## 1. Cómo verificar las pruebas

**Sin instalar nada:** abrir la pestaña
[Actions](https://github.com/alejandromoreno685-art/HotelReservPro/actions/workflows/harness.yml)
y entrar a la ejecución más reciente de *Arnes de pruebas*. Cada push ejecuta tres
trabajos y publica un resumen con la cobertura, los resultados de API e interfaz y
los archivos de evidencia (`cobertura-N`, `evidencias-N`, `ia-casos-N`).

**En un equipo local** (Node.js 22):

| Comando | Tipo | Qué ejecuta | Necesita |
|---|---|---|---|
| `npm test` | Estructural | 36 pruebas unitarias y de rutas con memoria y mocks | Solo Node.js |
| `npm run test:coverage` | Estructural | Las mismas pruebas con cobertura de código y umbral mínimo | Solo Node.js |
| `npm run test:sqlserver` | Funcional | 95 variantes de API (CP-01 a CP-32) contra SQL Server real | Base `HotelReservePro_Test` ([guía](../rtf4/README.md)) |
| `npm run test:ui` | Funcional | 13 recorridos de interfaz con Playwright y Chrome | La app en ejecución y Chrome |
| `npx newman run docs/rtf4/postman/...` | Funcional | Contrato de API: 30 solicitudes y 37 aserciones | La app en ejecución |
| `npm run ia:generar -- --hu HU-001` | Apoyo | La IA propone casos de borde (Ollama, gratuito) | [Ollama](https://ollama.com/download) |

---

## 2. Resultados de las pruebas

### 2.1 Pruebas estructurales (unitarias y cobertura)

Herramientas: `node:test` como test runner, almacenes en memoria (`NODE_ENV=test`)
como stubs de la base de datos, mocks de `mssql` para los modelos SQL y un `fetch`
simulado para el módulo de IA.

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `test/auth.test.js` | 8 | Login, bloqueo tras 5 intentos, token vencido o alterado, roles |
| `test/reservations.test.js` | 7 | Fechas de Bogotá, valores límite, cruces, transiciones, concurrencia, idempotencia |
| `test/ai-test-assistant.test.js` | 7 | Módulo de IA: esquema, validación, errores del modelo |
| `test/receipts.test.js` | 6 | Cálculo del comprobante, PDF, reimpresión, permisos 403 |
| `test/sqlserver-models.test.js` | 3 | Consultas parametrizadas y mapeo de errores SQL con mocks |
| `test/availability.test.js` | 2 | Filtro por capacidad, estado e intervalo |
| `test/guests`, `rooms`, `hotel-date` | 3 | CRUD de huéspedes (documento único) y habitaciones; día del hotel en Bogotá |
| `test/sqlserver-rtf4.integration.test.js` | 1 | Integración real; se omite si no hay base de pruebas |

**Resultado (27/11/2026, Node.js 22.16):** 37 pruebas, **36 aprobadas, 0 fallidas,
1 omitida** (la de integración, que corre en el pipeline).

**Cobertura del código de la aplicación** (`src/`, `main.js`, `scripts/ai/`):

| Líneas | Ramas | Funciones | Umbral exigido |
|---|---|---|---|
| **74.6 %** | **77.2 %** | **87.0 %** | 70 % líneas y ramas, 80 % funciones |

Si la cobertura baja del umbral, `npm run test:coverage` termina con error y el
pipeline falla. Los archivos con menor cobertura son `reservationModel.js` (34 %) y
`database.js` (27 %): contienen el acceso real a SQL Server, que las pruebas
unitarias reemplazan por memoria y que se verifica en las pruebas funcionales
contra SQL Server (sección 2.2). Esta medición no suma esa ejecución.

### 2.2 Pruebas funcionales (API, interfaz y criterios de aceptación)

| Capa | Ejecución 1 (línea base) | Ejecución final (14/11/2026) | En GitHub Actions |
|---|---|---|---|
| API + SQL Server real | 95 variantes: 86 aprobadas, 5 fallidas, 4 bloqueadas | **95/95 aprobadas** | Se repite en cada push con SQL Server en contenedor |
| Interfaz (Playwright + Chrome) | 13: 7 aprobadas, 6 fallidas | **13/13 aprobadas** | Se repite en cada push |
| Postman / Newman | — | **30 solicitudes, 37 aserciones, 0 fallas** | Se repite en cada push |

- 32 casos de prueba diseñados, 108 variantes ejecutadas, criterios de aceptación
  **A01–A16: 16/16 verificados**.
- Técnicas: partición de equivalencia, valores límite, tablas de decisión,
  transición de estados, concurrencia y fallos inyectados.
- **10 defectos encontrados y corregidos** (DEF-01 a DEF-10), uno de ellos crítico:
  no se podían crear reservas desde la interfaz (DEF-05).
- Trazabilidad completa caso → HU → criterio → evidencia:
  [docs/rtf4/TRAZABILIDAD.md](../rtf4/TRAZABILIDAD.md).

### 2.3 Arnés con IA (Trabajo 9)

En el pipeline, un modelo local y gratuito (Ollama + llama3.2) propone casos de
borde. En la primera ejecución propuso **4 casos para HU-001 en 59 s**, sin
descartes por validación; quedan pendientes de revisión humana. Detalle en
[docs/harness/README.md](../harness/README.md).

---

## 3. Alcance logrado frente a la planeación

### 3.1 Backlog inicial (RTF2) frente a lo entregado

| ID | Necesidad del backlog | Prioridad | HU en Jira | Estado al cierre | Evidencia |
|---|---|---|---|---|---|
| RU-01 | Registrar reserva con datos del huésped | Alta | HU-001 | ✅ Entregado | CP-09 a CP-24 |
| RU-02 | Consultar disponibilidad | Alta | HU-002 | ✅ Entregado | CP-05 a CP-08 |
| RU-03 | CRUD de habitaciones | Alta | HU-003 | ✅ Entregado (solo ADMIN) | `test/rooms.test.js`, CP-23c |
| RU-04 | Cancelar reserva y liberar disponibilidad | Media | HU-001 | ✅ Entregado | CP-07d, CP-16 |
| RU-05 | Reportes de ocupación | Alta | — | ⚠️ Parcial: el panel muestra conteos de reservas y habitaciones; no hay reportes por fechas ni exportación | `test/reservations.test.js`, `test/rooms.test.js` (panel) |
| RU-06 | Confirmación de la reserva al cliente | Alta | — | ⚠️ Parcial: confirmación en pantalla y estado CONFIRMED; sin envío por correo | CP-16 |
| RU-07 | Registrar pagos | Media | HU-005 | ⚠️ Parcial: anticipos asociados a la reserva con saldo actualizado; no se guarda el medio de pago | CP-26 |
| RU-08 | Acceso con usuario y contraseña | Alta | HU-004 | ✅ Entregado | CP-01 a CP-04 |
| RU-09 | Consultar clientes | Media | — | ✅ Entregado: listado y búsqueda por nombre, documento, correo o teléfono | `test/guests.test.js`, CP-31 |
| RU-10 | Validar disponibilidad antes de guardar | Alta | HU-001 | ✅ Entregado: transacción serializable con revalidación | CP-14, CP-15, CP-17 |
| RU-11 | Comprobantes de pago | Media | HU-005 | ✅ Entregado: vista, PDF y reimpresión | CP-25 a CP-30 |

**Balance:** de 11 necesidades del backlog, **8 entregadas y 3 parciales**. Las
5 historias comprometidas en Jira (HU-001 a HU-005) se entregaron y se probaron.

Se agregó trabajo que no estaba en el backlog inicial: rol CONSULTA de solo
lectura, idempotencia de reservas (evita duplicados por doble clic o reintento),
tarifa histórica en el comprobante, pipeline de CI con SQL Server y el arnés con IA.

### 3.2 Requisitos no funcionales

| ID | Requisito | Estado |
|---|---|---|
| RNF-01 | Disponibilidad en máximo 3 s | Sin medir: no hay pruebas de carga (trabajo futuro) |
| RNF-02 | Comprobante en menos de 5 s | Sin medir formalmente |
| RNF-03 / 04 | Curva de aprendizaje y flujo natural | Sin evaluar con usuarios |
| RNF-05 | Mensajes de error comprensibles | Cumple: errores junto al campo y mensajes sin detalles técnicos (DEF-06, DEF-07, CP-18) |
| RNF-06 | Contraseñas con hash seguro | Cumple: scrypt con sal |
| RNF-07 | Cierre de sesión por 30 min de inactividad | No cumple: la sesión dura 2 h fijas |
| RNF-08 | Separación de roles en el backend | Cumple: 401/403 en API y URL directa (CP-28, CP-32) |
| RNF-09 | Registro de auditoría | No implementado |

### 3.3 Historial de entregas

| Fecha | Incremento |
|---|---|
| 10/10/2026 | Base modular, habitaciones, disponibilidad, huéspedes y reservas |
| 14/11/2026 | RTF4: esquema con tarifa histórica e idempotencia, roles, comprobantes, correcciones de interfaz y 95 variantes de prueba |
| 20/11/2026 | Trabajo 9: módulo de IA, pipeline de GitHub Actions y arquitectura del arnés |
| 27/11/2026 | Cierre: cobertura de código con umbral en el pipeline y este balance |

---

## 4. Retos y dificultades del testing

1. **Aislar la base de datos.** Las pruebas unitarias no podían depender de SQL
   Server. Se usaron almacenes en memoria y mocks de `mssql`, pero esos dobles no
   prueban restricciones, transacciones ni concurrencia reales. Por eso hizo falta
   una segunda capa contra SQL Server, y por eso la cobertura unitaria de los
   modelos SQL es baja.
2. **Probar sin poner en riesgo los datos reales.** Se creó una base exclusiva
   (`HotelReservePro_Test`), un seed repetible que no borra nada y una doble
   verificación (`DB_NAME` + `RTF4_SQLSERVER_TEST=1`) antes de escribir. Una
   migración falló en una base existente (DEF-10) y obligó a respaldar y separar
   los lotes del script.
3. **Fechas y valores límite.** Las reservas dependen del día en Bogotá y de
   intervalos semiabiertos (salida y entrada el mismo día no se cruzan). Las
   pruebas usan fechas relativas al día del hotel (T+10, T+15…) para no cambiar de
   resultado según el día en que se ejecutan.
4. **Concurrencia e idempotencia.** Reproducir una carrera real (dos recepcionistas
   reservando la misma habitación) requirió 10 pares de solicitudes simultáneas
   contra SQL Server y claves de idempotencia para el doble clic.
5. **Fallos difíciles de provocar.** La caída de la base, un rollback fallido o una
   respuesta perdida después del commit no ocurren a voluntad. Se agregaron puntos
   de fallo que solo se activan en el perfil de pruebas; los errores 2601, 2627 y
   547 sí son reales del motor.
6. **La interfaz encontró lo que la API no.** El defecto crítico DEF-05 (no se
   podía reservar desde el formulario) pasó todas las pruebas de API. Solo lo
   detectó el recorrido con Playwright.
7. **Automatizar en CI.** Llevar todo a GitHub Actions exigió SQL Server en
   contenedor, contraseñas generadas en cada ejecución y que los scripts
   terminaran con error ante un fallo: antes reportaban "fallido" pero el pipeline
   seguía en verde.
8. **La cobertura no mide la calidad de las aserciones.** Un 75 % de líneas dice
   qué se ejecutó, no si una prueba detectaría un cambio en la lógica. Por eso las
   pruebas de mutación están en el trabajo futuro.
9. **IA sin licencias pagas.** Se cambió a un modelo local gratuito. Sus salidas
   pueden inventar reglas, así que se validan contra el catálogo de requisitos y
   requieren revisión humana.

---

## 5. Trabajo futuro y deuda técnica

### 5.1 Funcionalidades pendientes

- **Check-in y check-out**: los estados `IN_PROGRESS` y `COMPLETED` existen pero no
  tienen transición; hoy se preparan por SQL en las pruebas. Mientras no exista,
  el indicador de habitaciones ocupadas del panel queda en cero.
- **Reportes de ocupación** por rango de fechas con exportación (RU-05).
- **Confirmación por correo** al huésped (RU-06) y **medio de pago** en anticipos (RU-07).
- **Cierre de sesión por inactividad** de 30 minutos (RNF-07) y **auditoría** de
  acciones críticas (RNF-09).
- **Administración de usuarios** desde la aplicación.
- Aprobar con el docente las reglas implementadas sin aprobación formal (matriz de
  roles, fórmula del comprobante, anticipo ≤ saldo).

### 5.2 Pruebas no funcionales por implementar

| Tipo | Herramienta propuesta | Objetivo |
|---|---|---|
| Carga y rendimiento | k6 o Artillery | Verificar RNF-01 (≤ 3 s) y RNF-02 (≤ 5 s) con varios recepcionistas simultáneos |
| Seguridad | OWASP ZAP (escaneo base en el pipeline) y `npm audit` | Cabeceras, cookies, inyección y dependencias vulnerables |
| Mutación | StrykerJS | Medir si las pruebas detectan cambios en la lógica de reservas y comprobantes |
| Accesibilidad | axe-core con Playwright | Contraste, etiquetas y navegación por teclado |
| Compatibilidad | Playwright con Firefox y WebKit | Hoy solo se prueba en Chrome |

### 5.3 Evolución de la arquitectura

- Sumar la cobertura de las pruebas de integración a la de las unitarias.
- Contenedor Docker de la aplicación y un ambiente de staging desplegado desde el pipeline.
- Migraciones versionadas con una herramienta dedicada en lugar de scripts manuales.
- Registros estructurados y monitoreo de errores en producción.

### 5.4 Deuda técnica conocida

- Las reservas anteriores a la migración RTF4 recibieron la tarifa actual de su
  habitación porque no existía un valor histórico.
- La revisión humana de los casos propuestos por la IA todavía es manual.

---

## 6. Guion de la sustentación (8 a 10 minutos)

Sustentación individual: el autor aparece en cámara durante todo el video y
explica cada bloque.

| Tiempo | Bloque | Qué mostrar en pantalla | Qué explicar |
|---|---|---|---|
| 0:00–0:45 | Presentación | Este documento y la página principal del repositorio | Problema del hotel y tecnología (Node.js, Express, SQL Server) |
| 0:45–2:45 | Pruebas estructurales | Terminal: `npm run test:coverage`; abrir `test/reservations.test.js` | Mocks y memoria, valores límite, cobertura del 74.6 % y umbral |
| 2:45–5:00 | Pruebas funcionales | GitHub Actions: última ejecución con los tres trabajos en verde y su resumen; una captura de `evidencias-N` | 95/95 API, 13/13 interfaz, Newman; criterios A01–A16 |
| 5:00–6:45 | Alcance frente a Jira | Jira: lista o tablero con las HU y tareas finalizadas; tabla 3.1 de este documento | Planeado frente a entregado: 8 de 11 entregadas, 3 parciales |
| 6:45–8:15 | Retos del testing | Sección 4 de este documento | Aislar la base, concurrencia, fallos inyectados, DEF-05 |
| 8:15–9:30 | Trabajo futuro | Sección 5 de este documento | Check-in, carga, seguridad, mutación; deuda técnica |
| 9:30–10:00 | Cierre | — | Principal aprendizaje del semestre |

**Antes de grabar:** ejecutar `npm run test:coverage` una vez, dejar abiertas las
pestañas de Actions y Jira, y revisar que el enlace de Jira abra sin iniciar sesión
o que el docente tenga acceso.

---

## 7. Entregables del foro

| Entregable | Enlace |
|---|---|
| Repositorio con pruebas y documentación | https://github.com/alejandromoreno685-art/HotelReservPro |
| Ejecuciones de las pruebas (CI) | https://github.com/alejandromoreno685-art/HotelReservPro/actions |
| Proyecto en Jira (4 sprints y backlog de trabajo futuro) | https://pascualbravo-team-qse9lptz.atlassian.net/jira/software/c/projects/HRP/boards/34/backlog |
| Video de sustentación | https://drive.google.com/file/d/1zNATVtZAGGo_pYSKV7zaK5UOZxkyj0BS/view?usp=sharing |
