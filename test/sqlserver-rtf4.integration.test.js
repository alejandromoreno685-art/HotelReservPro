// Integración real con SQL Server. Se omite salvo que la terminal habilite el
// perfil exclusivo: RTF4_SQLSERVER_TEST=1 (las demás variables se leen de
// .env.rtf4.local). Reutiliza el ejecutor de evidencias para no duplicar casos.
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

if (process.env.RTF4_SQLSERVER_TEST === '1') {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.rtf4.local'), quiet: true });
}
const enabled = process.env.RTF4_SQLSERVER_TEST === '1' &&
  process.env.NODE_ENV === 'rtf4-integration' &&
  process.env.DB_NAME === 'HotelReservePro_Test';

test('RTF4 CP-01..CP-32 contra SQL Server real (API HTTP)', {
  skip: enabled ? false : 'requiere RTF4_SQLSERVER_TEST=1 y el perfil HotelReservePro_Test',
  timeout: 300000
}, async () => {
  const { run } = require('../scripts/rtf4-evidence');
  const report = await run({
    runLabel: 'node-test',
    outputDir: path.join(__dirname, '..', 'entregables', 'RTF4', 'tmp', 'node-test')
  });
  const failed = report.resultados.filter((item) => item.estado !== 'Aprobado');
  assert.deepEqual(failed.map((item) => `${item.cp} ${item.variante}: ${item.observado}`), []);
});
