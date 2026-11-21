# Arnés de pruebas con IA — HotelReserve Pro (Trabajo 9)

![Arquitectura del arnés](./arquitectura-harness-ia.png)

## Componentes

| Componente | Herramienta | Archivo | Función |
|---|---|---|---|
| Sistema bajo prueba | Node.js 22, Express, EJS, SQL Server 2022 | `main.js`, `src/` | API e interfaz de reservas, disponibilidad y comprobantes |
| Test runner | `node:test` | `npm test` | Ejecuta pruebas unitarias y de rutas con dobles de prueba |
| Drivers | Clientes HTTP, Newman, Playwright | `scripts/rtf4-evidence.js`, `docs/rtf4/postman/`, `scripts/rtf4-ui.js` | Invocan el SUT como lo haría un usuario o un cliente de la API |
| Stubs y mocks | Almacenes en memoria, mocks de SQL, `fetch` simulado para la IA | `NODE_ENV=test`, `test/sqlserver-models.test.js`, `test/ai-test-assistant.test.js` | Aíslan la base de datos y la API externa |
| Fixtures | Seed y base aislada | `scripts/seed-rtf4.js`, `HotelReservePro_Test` | Datos ficticios conocidos y restaurables |
| Inyección de fallos | Puntos de fallo de laboratorio | `src/database.js` (`supportedFailpoints`) | Provocan fallos de transacción, 2601, 2627, 547 y PDF solo en el perfil de pruebas |
| Módulo de IA | Ollama (código abierto, gratuito) con el modelo `llama3.2` | `scripts/ai/testAssistant.js` | Propone casos de borde y clasifica fallos; todo queda pendiente de revisión humana |
| Pipeline CI/CD | GitHub Actions | `.github/workflows/harness.yml` | Ejecuta todo en cada push y publica evidencias |
| Reportes | Markdown, JSON, JUnit, Jira | `entregables/`, `reports/` | Resultados por variante, métricas y defectos |

## Uso del módulo de IA

Es gratuito: el modelo corre en el equipo con [Ollama](https://ollama.com/download). Una sola vez:

```powershell
ollama pull llama3.2
```

Luego:

```powershell
npm run ia:generar -- --hu HU-001 --maximo 8
npm run ia:clasificar -- --resultados entregables/RTF4/evidencias/api/<ejecucion>/resultados.json
```

- **Generar** envía la HU, sus criterios y los casos existentes, y recibe casos nuevos en JSON.
  Ollama restringe la salida a un esquema JSON y el arnés la vuelve a validar con `zod`. El arnés descarta los que citan una HU o un criterio inexistente.
- **Clasificar** envía solo las variantes no aprobadas. Si no hay fallos, no consulta el modelo.
- Variables opcionales: `OLLAMA_URL` (por defecto `http://localhost:11434`) e `IA_MODELO` (por defecto `llama3.2`).
- Las salidas quedan en `reports/ia/` (excluida de Git) y **no se agregan solas a la matriz**:
  un integrante las revisa y aprueba.

## Pipeline

`unitarias` → `integracion` (SQL Server en contenedor, migraciones, seed, API, Newman e interfaz).
Las contraseñas se generan al azar en cada ejecución y se enmascaran en los registros. Si una
etapa falla, el pipeline instala Ollama y la IA clasifica los fallos. Un tercer trabajo, `ia`,
propone en cada push casos de borde para HU-001. Nada de esto requiere claves ni pagos.
Las evidencias y las propuestas se publican como artefactos durante 14 días.
