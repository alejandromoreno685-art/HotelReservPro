# Reporte de ejecución RTF4

Ambiente: Windows 11, Node.js v22.16.0, SQL Server 2022 Express local, base
exclusiva `HotelReservePro_Test`, Chrome (Playwright) y Newman 6.2.1.
Versión probada: commit `4b58c29` más los cambios locales que se versionan a
continuación (huella `8c3670dc481c` en la ejecución final).

| Capa | Ejecución 1 (línea base) | Ejecución 2 | Ejecución 3 (final, 14/11/2026) |
|---|---|---|---|
| API + SQL Server real (`npm run test:sqlserver`) | 95 variantes: 86 aprobadas, 5 fallidas, 4 bloqueadas | 95/95 aprobadas | 95/95 aprobadas |
| Interfaz (`npm run test:ui`) | 13: 7 aprobadas, 6 fallidas | 12/13 | 13/13 |
| Postman / Newman | — | — | 30 solicitudes, 37 aserciones, 0 fallas |
| `npm test` (memoria y mocks) | — | — | 29 aprobadas, 1 omitida (integración) |

- Casos diseñados: 32. Variantes registradas: 108 (95 API + 13 interfaz).
- Criterios A01–A16 verificados: 16/16.
- Defectos: DEF-01 a DEF-10, todos corregidos y repetidos (ver [PENDIENTES.md](./PENDIENTES.md)).
- Los porcentajes son de cobertura funcional, no de cobertura de código.

`npm test` usa memoria y mocks: no acredita persistencia, restricciones ni
concurrencia de SQL Server. Esas verificaciones provienen de la capa API + SQL.

Las evidencias (resultados por variante, capturas, PDF, salidas de Newman y SQL)
y el documento RTF4 corregido se entregan fuera del repositorio, en la carpeta
`entregables/RTF4`, que está excluida de Git por su tamaño.
