/*
 * Recorridos de interfaz RTF4 con Playwright (playwright-core) y el Chrome
 * instalado en el equipo. Usa la aplicación real contra HotelReservePro_Test.
 * Mismas protecciones de ambiente que scripts/rtf4-evidence.js.
 */
const path = require('node:path');
const fs = require('node:fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.rtf4.local'), quiet: true });
require('dotenv').config({ quiet: true });

const root = path.join(__dirname, '..');
const ids = {
  g1: '11111111-1111-4111-8111-111111111101',
  h1: '22222222-2222-4222-8222-222222222201',
  h2: '22222222-2222-4222-8222-222222222202',
  h4: '22222222-2222-4222-8222-222222222204'
};

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function run(runLabel = process.env.RTF4_RUN_LABEL || 'ui') {
  if (process.env.NODE_ENV !== 'rtf4-integration' || process.env.RTF4_SQLSERVER_TEST !== '1' ||
      process.env.DB_NAME !== 'HotelReservePro_Test') {
    throw new Error('Ejecución bloqueada: requiere el perfil HotelReservePro_Test.');
  }
  const { chromium } = require('playwright-core');
  const app = require('../main');
  const database = require('../src/database');
  const { hotelToday } = require('../src/hotelDate');
  const [{ dbName }] = (await database.query('SELECT DB_NAME() AS dbName')).recordset;
  if (dbName !== 'HotelReservePro_Test') throw new Error(`Base inesperada: ${dbName}`);

  await database.query(
    `UPDATE dbo.Reservations SET status = 'CANCELLED'
     WHERE room_id IN (@h1, @h2, @h4) AND status <> 'CANCELLED'`,
    { h1: ids.h1, h2: ids.h2, h4: ids.h4 }
  );
  await database.query("UPDATE dbo.Users SET failed_login_attempts = 0, locked_until = NULL WHERE username LIKE 'rtf4-%'");

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const outDir = path.join(root, 'entregables', 'RTF4', 'evidencias', 'ui', runLabel);
  fs.mkdirSync(outDir, { recursive: true });
  const T = hotelToday();
  const results = [];
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });

  async function shot(page, name) {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return path.relative(path.join(root, 'entregables', 'RTF4'), file).replaceAll('\\', '/');
  }

  async function step(cp, variante, meta, fn) {
    const entry = { cp, variante, hu: meta.hu, criterio: meta.criterio, esperado: meta.esperado, fecha: new Date().toISOString() };
    try {
      const outcome = await fn();
      Object.assign(entry, { observado: outcome.observado, estado: outcome.ok ? 'Aprobado' : 'Fallido', evidencia: outcome.evidencia || [] });
    } catch (error) {
      Object.assign(entry, { observado: `Excepción: ${error.message.split('\n')[0]}`, estado: 'Fallido', evidencia: entry.evidencia || [] });
    }
    entry.ambiente = 'Chrome headless (Playwright) + app local + SQL Server HotelReservePro_Test';
    results.push(entry);
    console.log(`[${entry.estado}] ${cp} ${variante}: ${entry.observado}`);
  }

  async function newSession(username, password, viewport = { width: 1366, height: 900 }) {
    const context = await browser.newContext({ viewport, acceptDownloads: true, locale: 'es-CO' });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/login`);
    await page.fill('#username', username);
    await page.fill('#password', password);
    await Promise.all([page.waitForURL(/\/(dashboard|availability)/), page.click('#login-button')]);
    return { context, page };
  }

  const activeCount = async (roomId, checkIn, checkOut) => (await database.query(
    `SELECT COUNT(*) AS total FROM dbo.Reservations WHERE room_id = @roomId AND check_in = @checkIn
     AND check_out = @checkOut AND status IN ('PENDING_DEPOSIT','CONFIRMED','IN_PROGRESS')`,
    { roomId, checkIn, checkOut }
  )).recordset[0].total;

  async function fillReservationDialog(page, checkIn, checkOut, guests) {
    await page.click('#new-reservation-button');
    await page.waitForSelector('#reservation-dialog[open]');
    await page.waitForFunction(() => document.querySelector('#guest-id').options.length > 1);
    await page.fill('#check-in', checkIn);
    await page.fill('#check-out', checkOut);
    await page.fill('#guest-count', String(guests));
    await page.selectOption('#guest-id', ids.g1);
    await page.click('#search-rooms-button');
    await page.waitForFunction(() => !document.querySelector('#room-id').disabled);
  }

  try {
    await step('CP-01', 'ui', { hu: 'HU-004', criterio: 'A01', esperado: 'Login válido abre el panel; la contraseña no aparece en la URL ni en la página.' }, async () => {
      const { context, page } = await newSession('rtf4-admin', process.env.RTF4_ADMIN_PASSWORD);
      await page.waitForFunction(() => document.querySelector('[data-metric="totalRooms"]').textContent.trim() !== '—');
      const html = await page.content();
      const evidence = await shot(page, 'CP-01_panel');
      await context.close();
      return {
        ok: page.url().endsWith('/dashboard') && !html.includes(process.env.RTF4_ADMIN_PASSWORD),
        observado: `URL ${new URL(page.url()).pathname}; contraseña visible=${html.includes(process.env.RTF4_ADMIN_PASSWORD)}`,
        evidencia: [evidence]
      };
    });

    await step('CP-03', 'ui', { hu: 'HU-004', criterio: 'A02', esperado: 'Enviar vacío muestra mensaje de campos obligatorios y no entra.' }, async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${baseUrl}/login`);
      await page.click('#login-button');
      await page.waitForFunction(() => document.querySelector('#login-error').textContent.trim().length > 0);
      const message = await page.textContent('#login-error');
      const evidence = await shot(page, 'CP-03_login_vacio');
      await context.close();
      return { ok: page.url().endsWith('/login') && /usuario y la contraseña/i.test(message), observado: `"${message.trim()}"`, evidencia: [evidence] };
    });

    const admin = await newSession('rtf4-admin', process.env.RTF4_ADMIN_PASSWORD);
    const page = admin.page;

    await step('CP-05', 'ui', { hu: 'HU-002', criterio: 'A04', esperado: 'Búsqueda T+15..T+17 muestra habitaciones elegibles; búsqueda SUITE muestra estado “sin resultados”, distinto de un error.' }, async () => {
      await page.goto(`${baseUrl}/availability`);
      await page.fill('#check-in', addDays(T, 15));
      await page.fill('#check-out', addDays(T, 17));
      await page.fill('#guest-count', '2');
      await page.click('#search-button');
      await page.waitForFunction(() => document.querySelectorAll('.room-result').length > 0);
      const count = await page.locator('.room-result').count();
      const e1 = await shot(page, 'CP-05_disponibilidad_resultados');
      await page.selectOption('#room-type', 'SUITE');
      await page.click('#search-button');
      await page.waitForFunction(() => document.querySelector('#result-count').textContent.startsWith('0'));
      const emptyTitle = await page.textContent('#empty-title');
      const e2 = await shot(page, 'CP-08_disponibilidad_sin_resultados');
      return { ok: count >= 2 && /No hay habitaciones/i.test(emptyTitle), observado: `${count} resultados; sin resultados: "${emptyTitle.trim()}"`, evidencia: [e1, e2] };
    });

    await step('CP-08', 'ui-error', { hu: 'HU-002', criterio: 'A04', esperado: 'Falla del servidor (respuesta 500 simulada en el navegador) se muestra como error, no como “sin resultados”.' }, async () => {
      await page.route('**/api/availability?**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Ocurrió un error interno.' }) }));
      await page.click('#search-button');
      await page.waitForFunction(() => document.querySelector('#page-message').textContent.trim().length > 0);
      const message = await page.textContent('#page-message');
      const emptyTitle = await page.textContent('#empty-title');
      const evidence = await shot(page, 'CP-08_disponibilidad_error_servidor');
      await page.unroute('**/api/availability?**');
      return {
        ok: !/No hay habitaciones/i.test(emptyTitle) && message.trim().length > 0,
        observado: `mensaje "${message.trim()}"; título del área de resultados "${emptyTitle.trim()}"`,
        evidencia: [evidence, 'Respuesta 500 simulada con page.route (solo interfaz)']
      };
    });

    await step('CP-11', 'ui', { hu: 'HU-001', criterio: 'A06 A13', esperado: 'Salida anterior a la entrada: error junto al campo de salida; los demás datos se conservan.' }, async () => {
      await page.goto(`${baseUrl}/reservations`);
      await page.click('#new-reservation-button');
      await page.waitForSelector('#reservation-dialog[open]');
      await page.fill('#check-in', addDays(T, 20));
      await page.fill('#check-out', addDays(T, 18));
      await page.fill('#guest-count', '2');
      await page.click('#search-rooms-button');
      await page.waitForTimeout(500);
      const fieldError = await page.locator('#check-out-error').textContent().catch(() => null);
      const kept = await page.inputValue('#guest-count');
      const evidence = await shot(page, 'CP-11_error_junto_al_campo');
      await page.click('#cancel-dialog-button');
      return {
        ok: Boolean(fieldError && fieldError.trim()) && kept === '2',
        observado: `error junto al campo de salida: ${fieldError ? `"${fieldError.trim()}"` : 'no existe'}; huéspedes conservados=${kept}`,
        evidencia: [evidence]
      };
    });

    const from = addDays(T, 15);
    const to = addDays(T, 17);
    let createdId;
    await step('CP-09', 'ui', { hu: 'HU-001', criterio: 'A07', esperado: 'Crear B desde la interfaz: mensaje de éxito; tras recargar la reserva aparece una sola vez como Pendiente.' }, async () => {
      await page.goto(`${baseUrl}/reservations`);
      await fillReservationDialog(page, from, to, 2);
      await page.selectOption('#room-id', ids.h1);
      const roomStillSelected = await page.inputValue('#room-id');
      await page.click('#save-reservation-button');
      await page.waitForTimeout(1500);
      const message = await page.textContent('#page-message');
      const formError = await page.textContent('#form-error');
      const e1 = await shot(page, 'CP-09_reserva_creada');
      await page.reload();
      await page.waitForTimeout(800);
      const count = await activeCount(ids.h1, from, to);
      const e2 = await shot(page, 'CP-09_tras_recargar');
      createdId = (await database.query(
        "SELECT TOP 1 id FROM dbo.Reservations WHERE room_id=@r AND check_in=@c AND status='PENDING_DEPOSIT'",
        { r: ids.h1, c: from }
      )).recordset[0]?.id;
      return {
        ok: count === 1 && /creó/i.test(message),
        observado: `habitación seleccionada tras elegirla="${roomStillSelected}"; mensaje "${message.trim()}"; error del formulario "${formError.trim()}"; activas SQL=${count}`,
        evidencia: [e1, e2]
      };
    });

    await step('CP-24', 'ui', { hu: 'HU-001', criterio: 'A13', esperado: 'Doble clic en “Crear reserva”: una sola reserva persistida.' }, async () => {
      const a = addDays(T, 60);
      const b = addDays(T, 62);
      await page.goto(`${baseUrl}/reservations`);
      await fillReservationDialog(page, a, b, 2);
      await page.selectOption('#room-id', ids.h2);
      await page.dblclick('#save-reservation-button');
      await page.waitForTimeout(2000);
      const count = await activeCount(ids.h2, a, b);
      const evidence = await shot(page, 'CP-24_doble_clic');
      return { ok: count === 1, observado: `activas SQL tras doble clic=${count}`, evidencia: [evidence] };
    });

    await step('CP-16', 'ui', { hu: 'HU-001', criterio: 'A09', esperado: 'Cancelar pide confirmación; al aceptar la reserva queda Cancelada.' }, async () => {
      const a = addDays(T, 60);
      await page.goto(`${baseUrl}/reservations`);
      await page.waitForSelector('#reservations-table-body tr');
      let dialogText = '';
      page.once('dialog', async (dialog) => { dialogText = dialog.message(); await dialog.accept(); });
      const row = page.locator('#reservations-table-body tr', { hasText: a.split('-').reverse().join('/') }).first();
      await row.locator('button.cancel').click();
      await page.waitForTimeout(1200);
      const status = (await database.query(
        'SELECT TOP 1 status FROM dbo.Reservations WHERE room_id=@r AND check_in=@c ORDER BY created_at DESC',
        { r: ids.h2, c: a }
      )).recordset[0]?.status;
      const evidence = await shot(page, 'CP-16_cancelacion_confirmada');
      return { ok: /Cancelar/i.test(dialogText) && status === 'CANCELLED', observado: `confirmación "${dialogText}"; estado SQL ${status}`, evidencia: [evidence] };
    });

    await step('CP-26', 'ui', { hu: 'HU-005', criterio: 'A14', esperado: 'Comprobante muestra $400.000; tras consumo $50.000 y anticipo $100.000 muestra total $450.000 y saldo $350.000; descarga un PDF.' }, async () => {
      if (!createdId) {
        const fallback = (await database.query(
          "SELECT TOP 1 id FROM dbo.Reservations WHERE room_id=@r AND check_in=@c AND status<>'CANCELLED'",
          { r: ids.h1, c: from }
        )).recordset[0]?.id;
        createdId = fallback;
      }
      if (!createdId) {
        const response = await page.request.post(`${baseUrl}/api/reservations`, {
          headers: { 'Idempotency-Key': `ui-${Date.now()}` },
          data: { guestId: ids.g1, roomId: ids.h1, checkIn: from, checkOut: to, guestCount: 2 }
        });
        createdId = (await response.json()).reservation?.id;
      }
      await page.goto(`${baseUrl}/receipts/${createdId}`);
      const initialTotal = (await page.textContent('#total')).trim();
      const e1 = await shot(page, 'CP-25_comprobante_inicial');
      await page.fill('#charge-description', 'Restaurante');
      await page.fill('#charge-amount', '50000');
      await Promise.all([page.waitForLoadState('load'), page.click('#charge-form button[type="submit"]')]);
      await page.waitForTimeout(800);
      await page.fill('#payment-description', 'Anticipo');
      await page.fill('#payment-amount', '100000');
      await Promise.all([page.waitForLoadState('load'), page.click('#payment-form button[type="submit"]')]);
      await page.waitForTimeout(800);
      const total = (await page.textContent('#total')).trim();
      const balance = (await page.textContent('#balance')).trim();
      const e2 = await shot(page, 'CP-26_comprobante_con_movimientos');
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('a[href*="download=1"]')]);
      const pdfFile = path.join(outDir, 'CP-26_descarga_interfaz.pdf');
      await download.saveAs(pdfFile);
      const pdfStart = fs.readFileSync(pdfFile).subarray(0, 5).toString();
      return {
        ok: /400\.000/.test(initialTotal) && /450\.000/.test(total) && /350\.000/.test(balance) && pdfStart === '%PDF-',
        observado: `total inicial ${initialTotal}; total ${total}; saldo ${balance}; PDF descargado ${pdfStart}`,
        evidencia: [e1, e2, path.relative(path.join(root, 'entregables', 'RTF4'), pdfFile).replaceAll('\\', '/')]
      };
    });

    await step('CP-31', 'ui', { hu: 'Todas', criterio: 'A16', esperado: 'El ID de la reserva coincide entre listado, detalle y comprobante.' }, async () => {
      await page.goto(`${baseUrl}/reservations/${createdId}`);
      const detail = await page.textContent('.page-heading');
      await page.click('text=Abrir comprobante');
      await page.waitForURL(/\/receipts\//);
      const receipt = await page.textContent('.page-heading');
      const evidence = await shot(page, 'CP-31_detalle_a_comprobante');
      const same = detail.toLowerCase().includes(String(createdId).toLowerCase()) && receipt.toLowerCase().includes(String(createdId).toLowerCase());
      return { ok: same, observado: `ID en detalle y comprobante coincide=${same}`, evidencia: [evidence] };
    });

    await step('UI-DASH', 'coherencia', { hu: 'HU-001 HU-002', criterio: 'A16', esperado: 'El panel muestra el mismo número de reservas pendientes que SQL Server.' }, async () => {
      await page.goto(`${baseUrl}/dashboard`);
      await page.waitForFunction(() => document.querySelector('[data-metric="pendingReservations"]').textContent.trim() !== '—');
      const shown = (await page.textContent('[data-metric="pendingReservations"]')).trim();
      const sql = (await database.query("SELECT COUNT(*) AS total FROM dbo.Reservations WHERE status='PENDING_DEPOSIT'")).recordset[0].total;
      const evidence = await shot(page, 'UI_panel_coherencia');
      return { ok: shown === String(sql), observado: `panel ${shown}; SQL ${sql}`, evidencia: [evidence] };
    });
    await admin.context.close();

    await step('CP-32', 'ui', { hu: 'HU-004 HU-001', criterio: 'A15', esperado: 'CONSULTA entra a disponibilidad, el menú no ofrece reservas ni comprobantes y la URL directa /reservations responde 403.' }, async () => {
      const { context, page: p } = await newSession('rtf4-consulta', process.env.RTF4_CONSULTA_PASSWORD);
      const landing = new URL(p.url()).pathname;
      const menu = await p.locator('nav').textContent();
      const roleLabel = await p.locator('.user-details small').textContent();
      const e1 = await shot(p, 'CP-32_menu_consulta');
      const response = await p.goto(`${baseUrl}/reservations`);
      const e2 = await shot(p, 'CP-32_url_directa_403');
      const receipt = await p.goto(`${baseUrl}/receipts/${createdId}`);
      const body = await p.content();
      await context.close();
      return {
        ok: landing === '/availability' && !/Reservas|Comprobantes/.test(menu) && response.status() === 403 &&
          receipt.status() === 403 && !body.includes('RTF4 Uno') && /Consulta/i.test(roleLabel),
        observado: `inicio ${landing}; menú "${menu.replace(/\s+/g, ' ').trim()}"; etiqueta de rol "${roleLabel.trim()}"; /reservations ${response.status()}; comprobante ${receipt.status()}`,
        evidencia: [e1, e2]
      };
    });

    await step('UI-RESP', 'móvil', { hu: 'Todas', criterio: 'A13', esperado: 'Con 390 px de ancho, reservas y comprobante no generan desplazamiento horizontal.' }, async () => {
      const { context, page: p } = await newSession('rtf4-recepcion', process.env.RTF4_RECEPTION_PASSWORD, { width: 390, height: 844 });
      const overflow = [];
      const evidence = [];
      for (const [name, url] of [['reservas', '/reservations'], ['comprobante', `/receipts/${createdId}`], ['disponibilidad', '/availability']]) {
        await p.goto(`${baseUrl}${url}`);
        await p.waitForTimeout(600);
        const width = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        overflow.push(`${name}:${width}px`);
        evidence.push(await shot(p, `UI_movil_${name}`));
      }
      await context.close();
      return { ok: overflow.every((item) => Number(item.split(':')[1].replace('px', '')) <= 1), observado: `exceso horizontal ${overflow.join(', ')}`, evidencia: evidence };
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await database.query(
      "UPDATE dbo.Reservations SET status='CANCELLED' WHERE room_id IN (@h1,@h2,@h4) AND status<>'CANCELLED'",
      { h1: ids.h1, h2: ids.h2, h4: ids.h4 }
    ).catch(() => {});
    await database.closePool().catch(() => {});
  }

  const summary = results.reduce((acc, item) => ({ ...acc, [item.estado]: (acc[item.estado] || 0) + 1 }), {});
  fs.writeFileSync(path.join(outDir, 'resultados.json'), JSON.stringify({ ejecucion: runLabel, fechaReferenciaT: T, resumen: { variantes: results.length, ...summary }, resultados: results }, null, 2));
  const lines = [`# Resultados de interfaz — ${runLabel}`, '', `Resumen: ${results.length} variantes · ${Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join(' · ')}`, '',
    '| CP | Var. | Esperado | Observado | Estado | Evidencia |', '|---|---|---|---|---|---|',
    ...results.map((r) => `| ${r.cp} | ${r.variante} | ${r.esperado} | ${String(r.observado).replaceAll('|', '/')} | ${r.estado} | ${(r.evidencia || []).join('<br>')} |`)];
  fs.writeFileSync(path.join(outDir, 'resultados.md'), `${lines.join('\n')}\n`);
  console.log(`Resumen ${runLabel}: ${JSON.stringify(summary)}`);
  return results;
}

module.exports = { run };
if (require.main === module) {
  run().then((results) => {
    // Compuerta de calidad: cualquier variante no aprobada hace fallar el proceso (CI).
    if (results.some((item) => item.estado !== 'Aprobado')) process.exitCode = 1;
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
