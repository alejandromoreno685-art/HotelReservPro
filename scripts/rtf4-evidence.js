/*
 * Ejecutor de evidencias RTF4 contra SQL Server real.
 *
 * Levanta la aplicación Express en un puerto local, usa clientes HTTP
 * independientes (node:http con agentes separados) y consulta la base
 * HotelReservePro_Test para comprobar persistencia. Cada CP y variante queda
 * registrado con HU, criterio, esperado, observado, estado y evidencia.
 *
 * Solo se ejecuta si NODE_ENV=rtf4-integration, RTF4_SQLSERVER_TEST=1 y
 * DB_NAME=HotelReservePro_Test. Antes de escribir datos verifica DB_NAME()
 * en el propio motor.
 */
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { randomUUID, createHash } = require('node:crypto');
const { execSync } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.rtf4.local'), quiet: true });
require('dotenv').config({ quiet: true });

const expectedDatabase = 'HotelReservePro_Test';
const root = path.join(__dirname, '..');

const ids = {
  g1: '11111111-1111-4111-8111-111111111101',
  g2: '11111111-1111-4111-8111-111111111102',
  g0: '11111111-1111-4111-8111-111111111199',
  h1: '22222222-2222-4222-8222-222222222201',
  h2: '22222222-2222-4222-8222-222222222202',
  h3: '22222222-2222-4222-8222-222222222203',
  h4: '22222222-2222-4222-8222-222222222204',
  h0: '22222222-2222-4222-8222-222222222299'
};
const testRoomIds = [ids.h1, ids.h2, ids.h3, ids.h4];
const internalLeakPattern = /(SELECT |INSERT |UPDATE |dbo\.|RequestError|ConnectionError|mssql|tedious|at [A-Za-z]+ \(|\.js:\d+|Violation of|constraint|Conversion failed)/i;

function assertEnvironment() {
  const ok = process.env.NODE_ENV === 'rtf4-integration' &&
    process.env.RTF4_SQLSERVER_TEST === '1' &&
    process.env.DB_NAME === expectedDatabase;
  if (!ok) {
    throw new Error('Ejecución bloqueada: requiere NODE_ENV=rtf4-integration, RTF4_SQLSERVER_TEST=1 y DB_NAME=HotelReservePro_Test.');
  }
  for (const name of ['RTF4_ADMIN_PASSWORD', 'RTF4_RECEPTION_PASSWORD', 'RTF4_CONSULTA_PASSWORD']) {
    if (!process.env[name]) throw new Error(`Falta ${name} en el perfil local de pruebas.`);
  }
}

function versionInfo() {
  const run = (command) => {
    try { return execSync(command, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; }
  };
  const head = run('git rev-parse --short HEAD');
  const status = run('git status --porcelain');
  const changed = status ? status.split('\n').length : 0;
  const hash = createHash('sha256');
  hash.update(run('git diff HEAD'));
  const untracked = run('git ls-files --others --exclude-standard').split('\n').filter(Boolean)
    .filter((file) => /^(src|public\/js|public\/css|scripts|migrations|test|database)\//.test(file) || file === 'main.js')
    .sort();
  for (const file of untracked) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(root, file)));
  }
  return {
    commitBase: head,
    cambiosSinCommit: changed > 0,
    archivosModificadosOSinSeguimiento: changed,
    huellaArbolDeTrabajo: hash.digest('hex').slice(0, 12),
    versionPackage: require('../package.json').version
  };
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function redact(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => (
    /password|token|cookie/i.test(key) ? [key, '<omitido>'] : [key, redact(item)]
  )));
}

function createClient(name, baseUrl, log) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 4 });
  const client = { name, cookie: null };
  client.request = (method, url, { body, headers = {}, raw = false } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const target = new URL(url, baseUrl);
    const request = http.request(target, {
      method,
      agent,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
        ...(client.cookie ? { cookie: client.cookie } : {}),
        ...headers
      }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const type = response.headers['content-type'] || '';
        let json = null;
        if (type.includes('application/json')) {
          try { json = JSON.parse(buffer.toString('utf8')); } catch { json = null; }
        }
        const text = type.includes('pdf') ? `<PDF ${buffer.length} bytes>` : buffer.toString('utf8');
        const entry = {
          at: new Date().toISOString(),
          client: name,
          method,
          path: target.pathname + target.search,
          requestBody: redact(body),
          idempotencyKey: headers['Idempotency-Key'] || undefined,
          status: response.statusCode,
          responseBody: json ? redact(json) : text.slice(0, 300)
        };
        log.push(entry);
        resolve({ status: response.statusCode, headers: response.headers, json, text, buffer, logIndex: log.length - 1 });
      });
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
  client.close = () => agent.destroy();
  return client;
}

async function run({ runLabel = process.env.RTF4_RUN_LABEL || 'ejecucion', outputDir } = {}) {
  assertEnvironment();
  const app = require('../main');
  const database = require('../src/database');
  const { hotelToday } = require('../src/hotelDate');
  const { jwtSecret, tokenIssuer } = require('../src/security');
  const jwt = require('jsonwebtoken');

  const [{ dbName }] = (await database.query('SELECT DB_NAME() AS dbName')).recordset;
  if (dbName !== expectedDatabase) {
    throw new Error(`Ejecución bloqueada: la conexión apunta a ${dbName}.`);
  }

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const log = [];
  const results = [];
  const startedAt = new Date();
  const T = hotelToday();
  const version = versionInfo();
  const outDir = outputDir || path.join(root, 'entregables', 'RTF4', 'evidencias', 'api', runLabel);
  fs.mkdirSync(outDir, { recursive: true });
  const createdReservationIds = [];
  const pairs = [];
  // Puntos de fallo que la versión probada declara. Las versiones anteriores a
  // esta lista solo tenían los cuatro puntos de transacción/alta.
  const supportedFailpoints = new Set(database.supportedFailpoints || [
    'transaction.begin', 'transaction.after-commit', 'transaction.after-rollback', 'reservation.after-insert'
  ]);
  const unsupported = (failpoint) => failpoint.split(',').filter((name) => !supportedFailpoints.has(name));

  function record(cp, variant, meta, outcome) {
    const entry = {
      cp,
      variante: variant,
      hu: meta.hu,
      criterio: meta.criterio,
      fecha: new Date().toISOString(),
      version: `${version.commitBase}${version.cambiosSinCommit ? '+cambios-sin-commit' : ''} (${version.huellaArbolDeTrabajo})`,
      ambiente: 'API HTTP local + SQL Server 2022 Express, base HotelReservePro_Test',
      esperado: meta.esperado,
      observado: outcome.observado,
      estado: outcome.estado,
      evidencia: outcome.evidencia || []
    };
    results.push(entry);
    const mark = entry.estado === 'Aprobado' ? 'OK ' : entry.estado.toUpperCase();
    console.log(`[${mark}] ${cp}${variant ? ` ${variant}` : ''}: ${entry.observado}`);
    return entry;
  }

  async function caseRun(cp, variant, meta, fn) {
    const before = log.length;
    try {
      const outcome = await fn();
      if (outcome.blockedReason) {
        return record(cp, variant, meta, { observado: outcome.blockedReason, estado: 'Bloqueado', evidencia: [] });
      }
      const evidence = log.slice(before).map((_, offset) => `http-log.json#${before + offset}`);
      return record(cp, variant, meta, {
        observado: outcome.observado,
        estado: outcome.ok ? 'Aprobado' : (outcome.blocked ? 'Bloqueado' : 'Fallido'),
        evidencia: [...evidence, ...(outcome.evidencia || [])]
      });
    } catch (error) {
      const evidence = log.slice(before).map((_, offset) => `http-log.json#${before + offset}`);
      return record(cp, variant, meta, {
        observado: `Excepción del ejecutor: ${error.message}`,
        estado: 'Fallido',
        evidencia: evidence
      });
    }
  }

  async function sqlCount(where, params) {
    const result = await database.query(
      `SELECT COUNT(*) AS total FROM dbo.Reservations WHERE ${where}`,
      params
    );
    return result.recordset[0].total;
  }

  const activeCount = (roomId, checkIn, checkOut) => sqlCount(
    `room_id = @roomId AND check_in = @checkIn AND check_out = @checkOut
     AND status IN ('PENDING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')`,
    { roomId, checkIn, checkOut }
  );
  const totalReservations = () => sqlCount('1 = 1', {});
  const leaks = (response) => internalLeakPattern.test(JSON.stringify(response.json || response.text || ''));

  async function login(client, username, password) {
    const response = await client.request('POST', '/api/auth/login', { body: { username, password } });
    const setCookie = response.headers['set-cookie'];
    if (response.status === 200 && setCookie) client.cookie = setCookie[0].split(';')[0];
    return response;
  }

  function body(guestId, roomId, checkIn, checkOut, guestCount = 2) {
    return { guestId, roomId, checkIn, checkOut, guestCount };
  }

  async function createReservation(client, data, key = randomUUID()) {
    const response = await client.request('POST', '/api/reservations', {
      body: data,
      headers: { 'Idempotency-Key': key }
    });
    if (response.status === 201 && response.json?.reservation?.id) {
      createdReservationIds.push(response.json.reservation.id);
    }
    return response;
  }

  async function cancelBySql(id) {
    await database.query(
      "UPDATE dbo.Reservations SET status = 'CANCELLED' WHERE id = @id AND status <> 'CANCELLED'",
      { id }
    );
  }

  async function withFailpoint(name, fn) {
    process.env.RTF4_TEST_FAILPOINT = name;
    try { return await fn(); } finally { delete process.env.RTF4_TEST_FAILPOINT; }
  }

  // --- Restauración de datos ficticios antes de la ejecución -----------------
  await database.query(
    `UPDATE dbo.Reservations SET status = 'CANCELLED'
     WHERE room_id IN (@h1, @h2, @h3, @h4) AND status <> 'CANCELLED'`,
    { h1: ids.h1, h2: ids.h2, h3: ids.h3, h4: ids.h4 }
  );
  await database.query(
    `UPDATE dbo.Users SET failed_login_attempts = 0, locked_until = NULL
     WHERE username LIKE 'rtf4-%'`
  );
  await database.query(
    `UPDATE dbo.Rooms SET rate = 200000, physical_status = 'DISPONIBLE' WHERE id = @h1;
     UPDATE dbo.Rooms SET physical_status = 'MANTENIMIENTO' WHERE id = @h3;`,
    { h1: ids.h1, h3: ids.h3 }
  );

  const admin = createClient('U1-admin', baseUrl, log);
  const admin2 = createClient('U1-admin-sesion2', baseUrl, log);
  const reception = createClient('U1-recepcion', baseUrl, log);
  const consulta = createClient('U2-consulta', baseUrl, log);
  const anonymous = createClient('sin-sesion', baseUrl, log);

  try {
    // --- HU-004: acceso --------------------------------------------------------
    await caseRun('CP-01', 'a', {
      hu: 'HU-004', criterio: 'A01',
      esperado: '200, cookie httpOnly y /api/auth/me responde 200; la respuesta no incluye la contraseña.'
    }, async () => {
      const response = await login(admin, 'rtf4-admin', process.env.RTF4_ADMIN_PASSWORD);
      const cookieHeader = (response.headers['set-cookie'] || [''])[0];
      const me = await admin.request('GET', '/api/auth/me');
      const leaksPassword = response.text.includes(process.env.RTF4_ADMIN_PASSWORD);
      return {
        ok: response.status === 200 && /HttpOnly/i.test(cookieHeader) && me.status === 200 && !leaksPassword,
        observado: `login ${response.status}, rol ${response.json?.user?.role}, HttpOnly=${/HttpOnly/i.test(cookieHeader)}, /me ${me.status}, contraseña en respuesta=${leaksPassword}`
      };
    });
    await login(admin2, 'rtf4-admin', process.env.RTF4_ADMIN_PASSWORD);
    await login(reception, 'rtf4-recepcion', process.env.RTF4_RECEPTION_PASSWORD);
    await login(consulta, 'rtf4-consulta', process.env.RTF4_CONSULTA_PASSWORD);

    const loginError = async (username, password) => {
      const client = createClient('login-invalido', baseUrl, log);
      const response = await client.request('POST', '/api/auth/login', { body: { username, password } });
      client.close();
      return response;
    };
    const wrongPassword = await caseRun('CP-02', 'a', {
      hu: 'HU-004', criterio: 'A02',
      esperado: '401 con mensaje genérico; sin cookie de sesión.'
    }, async () => {
      const response = await loginError('rtf4-recepcion', 'ClaveIncorrecta-123');
      return {
        ok: response.status === 401 && !response.headers['set-cookie'],
        observado: `${response.status} "${response.json?.message}"; set-cookie=${Boolean(response.headers['set-cookie'])}`
      };
    });
    await caseRun('CP-02', 'b', {
      hu: 'HU-004', criterio: 'A02',
      esperado: '401 con el mismo mensaje que la contraseña incorrecta (no revela si la cuenta existe).'
    }, async () => {
      const response = await loginError('rtf4-no-existe', 'ClaveIncorrecta-123');
      const previous = log.find((entry) => entry.path === '/api/auth/login' && entry.status === 401);
      const same = previous && response.json?.message === previous.responseBody.message;
      return {
        ok: response.status === 401 && same && !response.headers['set-cookie'],
        observado: `${response.status} "${response.json?.message}"; mismo mensaje que CP-02a=${Boolean(same)}`
      };
    });
    void wrongPassword;
    for (const [variant, username, password] of [['a', '', 'algo'], ['b', 'rtf4-admin', ''], ['c', '', '']]) {
      await caseRun('CP-03', variant, {
        hu: 'HU-004', criterio: 'A02',
        esperado: '400 "Ingresa el usuario y la contraseña."; sin sesión.'
      }, async () => {
        const response = await loginError(username, password);
        return {
          ok: response.status === 400 && !response.headers['set-cookie'],
          observado: `${response.status} "${response.json?.message}"`
        };
      });
    }

    const reservationCountBefore = await totalReservations();
    await caseRun('CP-04', 'a', {
      hu: 'HU-004', criterio: 'A03',
      esperado: 'Sin token: 401 en lectura de reservas, comprobante y alta; no se crean registros.'
    }, async () => {
      const list = await anonymous.request('GET', '/api/reservations');
      const receipt = await anonymous.request('GET', `/api/receipts/${randomUUID()}`);
      const create = await anonymous.request('POST', '/api/reservations', {
        body: body(ids.g1, ids.h1, addDays(T, 15), addDays(T, 17)),
        headers: { 'Idempotency-Key': randomUUID() }
      });
      const after = await totalReservations();
      return {
        ok: list.status === 401 && receipt.status === 401 && create.status === 401 && after === reservationCountBefore,
        observado: `lista ${list.status}, comprobante ${receipt.status}, alta ${create.status}; reservas antes/después ${reservationCountBefore}/${after}`
      };
    });
    await caseRun('CP-04', 'b', {
      hu: 'HU-004', criterio: 'A03', esperado: 'Token vencido: 401.'
    }, async () => {
      const expired = jwt.sign({ sub: 'x', username: 'rtf4-admin', role: 'admin' }, jwtSecret,
        { algorithm: 'HS256', expiresIn: -60, issuer: tokenIssuer });
      const response = await anonymous.request('GET', '/api/reservations', { headers: { authorization: `Bearer ${expired}` } });
      return { ok: response.status === 401, observado: `${response.status} "${response.json?.message}"` };
    });
    await caseRun('CP-04', 'c', {
      hu: 'HU-004', criterio: 'A03', esperado: 'Token alterado (firma modificada): 401.'
    }, async () => {
      const valid = admin.cookie.split('=')[1];
      const tampered = `${valid.slice(0, -4)}${valid.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`;
      const response = await anonymous.request('GET', '/api/reservations', { headers: { cookie: `hotelreserve_token=${tampered}` } });
      return { ok: response.status === 401, observado: `${response.status} "${response.json?.message}"` };
    });
    await caseRun('CP-04', 'd', {
      hu: 'HU-004', criterio: 'A03', esperado: 'Página protegida sin sesión: redirección 302 a /login.'
    }, async () => {
      const response = await anonymous.request('GET', '/reservations');
      return {
        ok: response.status === 302 && response.headers.location === '/login',
        observado: `${response.status} → ${response.headers.location}`
      };
    });

    // --- HU-002: disponibilidad -----------------------------------------------
    const availability = async (client, checkIn, checkOut, guestCount, extra = {}) => {
      const query = new URLSearchParams({ checkIn, checkOut, guestCount: String(guestCount), ...extra });
      return client.request('GET', `/api/availability?${query}`);
    };
    const roomIn = (response, id) => Boolean(response.json?.rooms?.some((room) => room.id === id));

    await caseRun('CP-05', 'a', {
      hu: 'HU-002', criterio: 'A04',
      esperado: 'T+15..T+17, 2 personas: incluye H1 y H2, excluye H3 (mantenimiento); capacidades ≥ 2; detalle de H1 coherente.'
    }, async () => {
      const response = await availability(reception, addDays(T, 15), addDays(T, 17), 2);
      const detail = await reception.request('GET', `/api/rooms/${ids.h1}`);
      const capacitiesOk = (response.json?.rooms || []).every((room) => room.capacity >= 2);
      return {
        ok: response.status === 200 && roomIn(response, ids.h1) && roomIn(response, ids.h2) &&
          !roomIn(response, ids.h3) && capacitiesOk && detail.json?.room?.capacity === 2,
        observado: `${response.status}; habitaciones ${(response.json?.rooms || []).map((room) => room.number).join(', ')}; detalle H1 capacidad ${detail.json?.room?.capacity}`
      };
    });

    let r0Id;
    await caseRun('CP-06', 'prep', {
      hu: 'HU-002', criterio: 'A05',
      esperado: 'Preparar R0: H1, G1, T+10..T+12, 2 personas, confirmada.'
    }, async () => {
      const response = await createReservation(admin, body(ids.g1, ids.h1, addDays(T, 10), addDays(T, 12)));
      r0Id = response.json?.reservation?.id;
      const confirm = r0Id
        ? await admin.request('PATCH', `/api/reservations/${r0Id}/status`, { body: { status: 'CONFIRMED' } })
        : { status: 0, json: null };
      return {
        ok: response.status === 201 && confirm.status === 200 && confirm.json?.reservation?.status === 'CONFIRMED',
        observado: `alta ${response.status}, confirmación ${confirm.status} (${confirm.json?.reservation?.status}); R0=${r0Id}`
      };
    });
    for (const [variant, from, to, expected] of [['a', 9, 10, true], ['b', 12, 13, true], ['c', 11, 13, false]]) {
      await caseRun('CP-06', variant, {
        hu: 'HU-002', criterio: 'A05',
        esperado: `H1 ${expected ? 'disponible' : 'no disponible'} para T+${from}..T+${to}${expected ? ' (intervalo adyacente)' : ' (comparte una noche)'}.`
      }, async () => {
        const response = await availability(reception, addDays(T, from), addDays(T, to), 2);
        return {
          ok: response.status === 200 && roomIn(response, ids.h1) === expected,
          observado: `${response.status}; H1 incluida=${roomIn(response, ids.h1)}`
        };
      });
    }
    const stateExpectations = [
      ['a', 'PENDING_DEPOSIT', false], ['b', 'CONFIRMED', false], ['c', 'IN_PROGRESS', false],
      ['d', 'CANCELLED', true], ['e', 'COMPLETED', true]
    ];
    for (const [variant, status, expected] of stateExpectations) {
      await caseRun('CP-07', variant, {
        hu: 'HU-002', criterio: 'A05',
        esperado: `R0 en ${status}: H1 ${expected ? 'incluida' : 'excluida'} para T+10..T+12.`
      }, async () => {
        // Preparación de datos de laboratorio: el estado se fija por SQL porque
        // la aplicación no ofrece check-in/check-out.
        await database.query('UPDATE dbo.Reservations SET status = @status WHERE id = @id', { id: r0Id, status });
        const response = await availability(reception, addDays(T, 10), addDays(T, 12), 2);
        return {
          ok: response.status === 200 && roomIn(response, ids.h1) === expected,
          observado: `${response.status}; H1 incluida=${roomIn(response, ids.h1)}`,
          evidencia: [`SQL: UPDATE estado R0 → ${status} (preparación de laboratorio)`]
        };
      });
    }
    await database.query("UPDATE dbo.Reservations SET status = 'CONFIRMED' WHERE id = @id", { id: r0Id });

    await caseRun('CP-08', 'a', { hu: 'HU-002', criterio: 'A04', esperado: '2 personas: H1 incluida.' }, async () => {
      const response = await availability(reception, addDays(T, 15), addDays(T, 17), 2);
      return { ok: response.status === 200 && roomIn(response, ids.h1), observado: `${response.status}; H1=${roomIn(response, ids.h1)}` };
    });
    await caseRun('CP-08', 'b', { hu: 'HU-002', criterio: 'A04', esperado: '3 personas: H1 excluida, H2 incluida.' }, async () => {
      const response = await availability(reception, addDays(T, 15), addDays(T, 17), 3);
      return {
        ok: response.status === 200 && !roomIn(response, ids.h1) && roomIn(response, ids.h2),
        observado: `${response.status}; H1=${roomIn(response, ids.h1)}, H2=${roomIn(response, ids.h2)}`
      };
    });
    await caseRun('CP-08', 'c', { hu: 'HU-002', criterio: 'A06', esperado: 'Fechas invertidas: 400 con mensaje claro.' }, async () => {
      const response = await availability(reception, addDays(T, 17), addDays(T, 15), 2);
      return { ok: response.status === 400, observado: `${response.status} "${response.json?.message}"` };
    });
    await caseRun('CP-08', 'd', {
      hu: 'HU-002', criterio: 'A04', esperado: 'Sin habitaciones elegibles (tipo SUITE): 200 y lista vacía, no error.'
    }, async () => {
      const response = await availability(reception, addDays(T, 15), addDays(T, 17), 2, { roomType: 'SUITE' });
      return {
        ok: response.status === 200 && Array.isArray(response.json?.rooms) && response.json.rooms.length === 0,
        observado: `${response.status}; ${response.json?.rooms?.length} habitaciones`
      };
    });

    // --- HU-001: reservas -----------------------------------------------------
    const B = body(ids.g1, ids.h1, addDays(T, 15), addDays(T, 17), 2);
    let bId;
    await caseRun('CP-09', 'a', {
      hu: 'HU-001', criterio: 'A07',
      esperado: '201; ID UUID; PENDING_DEPOSIT; datos iguales a B; tarifa 200.000; una sola reserva activa tras consultar de nuevo.'
    }, async () => {
      const response = await createReservation(reception, B);
      const reservation = response.json?.reservation || {};
      bId = reservation.id;
      const again = await reception.request('GET', `/api/reservations/${bId}`);
      const count = await activeCount(ids.h1, B.checkIn, B.checkOut);
      const same = again.json?.reservation && ['guestId', 'roomId', 'checkIn', 'checkOut', 'guestCount']
        .every((key) => again.json.reservation[key] === B[key]);
      return {
        ok: response.status === 201 && /^[0-9a-f-]{36}$/i.test(bId || '') && reservation.status === 'PENDING_DEPOSIT' &&
          same && reservation.ratePerNight === 200000 && count === 1,
        observado: `${response.status}; id=${bId}; estado ${reservation.status}; tarifa ${reservation.ratePerNight}; consulta posterior ${again.status}, datos iguales=${same}; activas en SQL=${count}`,
        evidencia: [`SQL: COUNT activas H1 ${B.checkIn}..${B.checkOut} = ${count}`]
      };
    });

    const rejectCase = async (cp, variant, criterio, esperado, data, expectedStatus, client = reception) => (
      caseRun(cp, variant, { hu: 'HU-001', criterio, esperado }, async () => {
        const before = await totalReservations();
        const response = await createReservation(client, data);
        const after = await totalReservations();
        return {
          ok: response.status === expectedStatus && after === before && !leaks(response),
          observado: `${response.status} "${response.json?.message}"; reservas antes/después ${before}/${after}`
        };
      })
    );
    const acceptAndCancel = async (cp, variant, criterio, esperado, data) => (
      caseRun(cp, variant, { hu: 'HU-001', criterio, esperado }, async () => {
        const response = await createReservation(reception, data);
        const id = response.json?.reservation?.id;
        if (id) await reception.request('POST', `/api/reservations/${id}/cancel`);
        return { ok: response.status === 201, observado: `${response.status}; id=${id}; cancelada para liberar el intervalo` };
      })
    );

    await rejectCase('CP-10', 'a', 'A06', 'Entrada T−1: 400, sin alta.', body(ids.g1, ids.h2, addDays(T, -1), addDays(T, 1)), 400);
    await acceptAndCancel('CP-10', 'b', 'A06', 'Entrada T y salida T+1: 201.', body(ids.g1, ids.h2, T, addDays(T, 1)));
    await rejectCase('CP-10', 'c', 'A06', 'Salida igual a entrada: 400.', body(ids.g1, ids.h2, addDays(T, 5), addDays(T, 5)), 400);
    await rejectCase('CP-10', 'd', 'A06', 'Salida anterior a entrada: 400.', body(ids.g1, ids.h2, addDays(T, 6), addDays(T, 5)), 400);

    await rejectCase('CP-11', 'a', 'A06', 'Fecha imposible 2027-02-30: 400.', body(ids.g1, ids.h2, '2027-02-30', '2027-03-02'), 400);
    await rejectCase('CP-11', 'b', 'A06', 'Texto como fecha: 400.', body(ids.g1, ids.h2, 'mañana', addDays(T, 3)), 400);
    for (const [variant, field] of [['c', 'guestId'], ['d', 'roomId'], ['e', 'checkIn'], ['f', 'checkOut']]) {
      const data = body(ids.g1, ids.h2, addDays(T, 20), addDays(T, 21));
      delete data[field];
      await rejectCase('CP-11', variant, 'A06', `Sin ${field}: 400.`, data, 400);
    }

    await rejectCase('CP-12', 'a', 'A06', 'H1 con 0 personas: 400.', body(ids.g1, ids.h1, addDays(T, 20), addDays(T, 21), 0), 400);
    await acceptAndCancel('CP-12', 'b', 'A06', 'H1 con 1 persona: 201.', body(ids.g1, ids.h1, addDays(T, 20), addDays(T, 21), 1));
    await acceptAndCancel('CP-12', 'c', 'A06', 'H1 con 2 personas (capacidad): 201.', body(ids.g1, ids.h1, addDays(T, 20), addDays(T, 21), 2));
    await rejectCase('CP-12', 'd', 'A06', 'H1 con 3 personas (excede capacidad): 400.', body(ids.g1, ids.h1, addDays(T, 20), addDays(T, 21), 3), 400);
    await rejectCase('CP-12', 'e', 'A06', 'H1 con 1,5 personas: 400.', body(ids.g1, ids.h1, addDays(T, 20), addDays(T, 21), 1.5), 400);
    await acceptAndCancel('CP-12', 'f', 'A06', 'H4 con 12 personas: 201.', body(ids.g1, ids.h4, addDays(T, 20), addDays(T, 21), 12));
    await rejectCase('CP-12', 'g', 'A06', 'H4 con 13 personas: 400.', body(ids.g1, ids.h4, addDays(T, 20), addDays(T, 21), 13), 400);

    await rejectCase('CP-13', 'a', 'A08', 'Huésped inexistente G0: 404.', body(ids.g0, ids.h2, addDays(T, 20), addDays(T, 21)), 404);
    await rejectCase('CP-13', 'b', 'A08', 'Habitación inexistente: 404.', body(ids.g1, ids.h0, addDays(T, 20), addDays(T, 21)), 404);
    await rejectCase('CP-13', 'c', 'A08', 'H3 en mantenimiento: 409.', body(ids.g1, ids.h3, addDays(T, 20), addDays(T, 21)), 409);
    await rejectCase('CP-13', 'd', 'A08', 'Identificador de huésped con formato inválido: 400 controlado, sin error interno.', body('abc', ids.h2, addDays(T, 20), addDays(T, 21)), 400);
    await caseRun('CP-13', 'e', {
      hu: 'HU-001', criterio: 'A08', esperado: 'Consultar una reserva con identificador mal formado: 404 controlado, sin detalles internos.'
    }, async () => {
      const response = await reception.request('GET', '/api/reservations/no-es-un-id');
      return { ok: response.status === 404 && !leaks(response), observado: `${response.status} "${response.json?.message}"` };
    });

    for (const [variant, from, to, label] of [['a', 10, 12, 'igualdad'], ['b', 9, 11, 'solapamiento inicial'], ['c', 11, 13, 'solapamiento final'], ['d', 9, 13, 'contención']]) {
      await rejectCase('CP-14', variant, 'A08', `Con R0 confirmada, ${label} T+${from}..T+${to}: 409 sin alta.`,
        body(ids.g2, ids.h1, addDays(T, from), addDays(T, to)), 409);
    }

    await acceptAndCancel('CP-15', 'a', 'A05 A08', 'Entrada el mismo día de salida de R0 (T+12..T+13): 201.', body(ids.g2, ids.h1, addDays(T, 12), addDays(T, 13)));
    await caseRun('CP-15', 'b', {
      hu: 'HU-001', criterio: 'A08',
      esperado: 'Disponibilidad desactualizada: otra sesión ocupa H1 antes de guardar; el segundo alta recibe 409 y la nueva búsqueda excluye H1.'
    }, async () => {
      const from = addDays(T, 25);
      const to = addDays(T, 27);
      const first = await availability(reception, from, to, 2);
      const other = await createReservation(admin, body(ids.g2, ids.h1, from, to));
      const late = await createReservation(reception, body(ids.g1, ids.h1, from, to));
      const again = await availability(reception, from, to, 2);
      const count = await activeCount(ids.h1, from, to);
      if (other.json?.reservation?.id) await admin.request('POST', `/api/reservations/${other.json.reservation.id}/cancel`);
      return {
        ok: roomIn(first, ids.h1) && other.status === 201 && late.status === 409 && !roomIn(again, ids.h1) && count === 1,
        observado: `consulta inicial H1=${roomIn(first, ids.h1)}; otra sesión ${other.status}; alta tardía ${late.status} "${late.json?.message}"; nueva consulta H1=${roomIn(again, ids.h1)}; activas SQL=${count}`
      };
    });

    let sId;
    await caseRun('CP-16', 'a', {
      hu: 'HU-001', criterio: 'A09', esperado: 'PENDING_DEPOSIT → CONFIRMED: 200 y la consulta posterior muestra CONFIRMED.'
    }, async () => {
      const created = await createReservation(reception, body(ids.g2, ids.h2, addDays(T, 30), addDays(T, 32), 3));
      sId = created.json?.reservation?.id;
      const response = await reception.request('PATCH', `/api/reservations/${sId}/status`, { body: { status: 'CONFIRMED' } });
      const again = await reception.request('GET', `/api/reservations/${sId}`);
      return {
        ok: created.status === 201 && response.status === 200 && again.json?.reservation?.status === 'CONFIRMED',
        observado: `alta ${created.status}; cambio ${response.status}; estado consultado ${again.json?.reservation?.status}`
      };
    });
    await caseRun('CP-16', 'b', {
      hu: 'HU-001', criterio: 'A09', esperado: 'CONFIRMED → IN_PROGRESS: 409 y conserva CONFIRMED.'
    }, async () => {
      const response = await reception.request('PATCH', `/api/reservations/${sId}/status`, { body: { status: 'IN_PROGRESS' } });
      const again = await reception.request('GET', `/api/reservations/${sId}`);
      return {
        ok: response.status === 409 && again.json?.reservation?.status === 'CONFIRMED',
        observado: `${response.status} "${response.json?.message}"; estado consultado ${again.json?.reservation?.status}`
      };
    });
    await caseRun('CP-16', 'c', {
      hu: 'HU-001', criterio: 'A09', esperado: 'CONFIRMED → CANCELLED: 200 y el intervalo queda libre.'
    }, async () => {
      const response = await reception.request('POST', `/api/reservations/${sId}/cancel`);
      const free = await availability(reception, addDays(T, 30), addDays(T, 32), 3);
      return {
        ok: response.status === 200 && response.json?.reservation?.status === 'CANCELLED' && roomIn(free, ids.h2),
        observado: `${response.status} (${response.json?.reservation?.status}); H2 disponible de nuevo=${roomIn(free, ids.h2)}`
      };
    });
    await caseRun('CP-16', 'd', {
      hu: 'HU-001', criterio: 'A09', esperado: 'CANCELLED → CONFIRMED: 409 y conserva CANCELLED.'
    }, async () => {
      const response = await reception.request('PATCH', `/api/reservations/${sId}/status`, { body: { status: 'CONFIRMED' } });
      const again = await reception.request('GET', `/api/reservations/${sId}`);
      return {
        ok: response.status === 409 && again.json?.reservation?.status === 'CANCELLED',
        observado: `${response.status}; estado consultado ${again.json?.reservation?.status}`
      };
    });
    await caseRun('CP-16', 'e', {
      hu: 'HU-001', criterio: 'A09', esperado: 'PENDING_DEPOSIT → CANCELLED: 200.'
    }, async () => {
      const created = await createReservation(reception, body(ids.g2, ids.h2, addDays(T, 34), addDays(T, 35)));
      const id = created.json?.reservation?.id;
      const response = await reception.request('POST', `/api/reservations/${id}/cancel`);
      return { ok: created.status === 201 && response.status === 200, observado: `alta ${created.status}; cancelación ${response.status}` };
    });

    // --- Concurrencia ---------------------------------------------------------
    for (let pair = 0; pair < 10; pair += 1) {
      const checkIn = addDays(T, 40 + pair * 3);
      const checkOut = addDays(checkIn, 2);
      await caseRun('CP-17', `par ${pair + 1}`, {
        hu: 'HU-001', criterio: 'A10',
        esperado: 'Dos sesiones U1 envían a la vez H1 (G1 y G2): una 201 y otra 409; una sola reserva activa en SQL Server.'
      }, async () => {
        const [first, second] = await Promise.all([
          createReservation(admin, body(ids.g1, ids.h1, checkIn, checkOut)),
          createReservation(admin2, body(ids.g2, ids.h1, checkIn, checkOut))
        ]);
        const statuses = [first.status, second.status];
        const count = await activeCount(ids.h1, checkIn, checkOut);
        const winner = [first, second].find((response) => response.status === 201);
        pairs.push({ par: pair + 1, checkIn, checkOut, statuses, activasSql: count });
        if (winner) await admin.request('POST', `/api/reservations/${winner.json.reservation.id}/cancel`);
        return {
          ok: [...statuses].sort().join(',') === '201,409' && count === 1,
          observado: `estados ${statuses.join('/')}; activas en SQL=${count}; ganador cancelado para restablecer`
        };
      });
    }

    // --- Recuperación y fallos controlados -----------------------------------
    const failRecovery = (cp, variant, criterio, esperado, failpoint, offset, expected) => caseRun(cp, variant, {
      hu: 'HU-001', criterio, esperado
    }, async () => {
      const missing = unsupported(failpoint);
      if (missing.length) return { blockedReason: `No ejecutado: la versión probada no tiene el punto de fallo de laboratorio ${missing.join(', ')}.` };
      const from = addDays(T, offset);
      const to = addDays(T, offset + 2);
      const key = randomUUID();
      const response = await withFailpoint(failpoint, () => createReservation(reception, body(ids.g1, ids.h1, from, to), key));
      const count = await activeCount(ids.h1, from, to);
      const lookup = await reception.request('GET', `/api/reservations/idempotency/${key}`);
      let recovery = { status: 0 };
      if (!expected.committed) {
        recovery = await createReservation(reception, body(ids.g1, ids.h1, from, to));
        if (recovery.json?.reservation?.id) await reception.request('POST', `/api/reservations/${recovery.json.reservation.id}/cancel`);
      }
      const ok = expected.statuses.includes(response.status) && !leaks(response) && count === (expected.committed ? 1 : 0) &&
        lookup.status === (expected.committed ? 200 : 404) && (expected.committed || recovery.status === 201);
      return {
        ok,
        observado: `${response.status} "${response.json?.message}"; activas SQL tras el fallo=${count}; consulta por clave ${lookup.status}${expected.committed ? '' : `; nueva solicitud tras restablecer ${recovery.status}`}`,
        evidencia: [`Punto de fallo de laboratorio: ${failpoint}`]
      };
    });

    await caseRun('CP-18', 'a', {
      hu: 'HU-001', criterio: 'A11',
      esperado: 'Conexión a la BD cortada (puerto inaccesible): 500 sin detalles internos y sin éxito; al restaurar no existe reserva nueva y un alta válida funciona.'
    }, async () => {
      const saved = { DB_SERVER: process.env.DB_SERVER, DB_PORT: process.env.DB_PORT, DB_INSTANCE: process.env.DB_INSTANCE };
      const from = addDays(T, 80);
      const to = addDays(T, 82);
      await database.closePool();
      process.env.DB_SERVER = '127.0.0.1';
      process.env.DB_PORT = '1';
      delete process.env.DB_INSTANCE;
      let response;
      try {
        response = await createReservation(reception, body(ids.g1, ids.h1, from, to));
      } finally {
        await database.closePool().catch(() => {});
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
      }
      const count = await activeCount(ids.h1, from, to);
      const recovery = await createReservation(reception, body(ids.g1, ids.h1, from, to));
      if (recovery.json?.reservation?.id) await reception.request('POST', `/api/reservations/${recovery.json.reservation.id}/cancel`);
      return {
        ok: response.status === 500 && !leaks(response) && count === 0 && recovery.status === 201,
        observado: `${response.status} "${response.json?.message}"; activas tras restaurar=${count}; alta posterior ${recovery.status}`,
        evidencia: ['Corte real de conectividad: puerto TCP 1 en 127.0.0.1 (laboratorio)']
      };
    });
    await failRecovery('CP-19', 'a', 'A11', 'Fallo al iniciar la transacción: 500, sin alta; tras restablecer, una solicitud válida funciona.', 'transaction.begin', 84, { statuses: [500], committed: false });
    await failRecovery('CP-20', 'a', 'A11', 'Error después de escribir y antes del commit: sin éxito y cero altas.', 'reservation.after-insert', 87, { statuses: [500], committed: false });
    await failRecovery('CP-20', 'b', 'A11', 'Error antes del commit y fallo posterior al rollback: sin éxito y cero altas.', 'reservation.after-insert,transaction.after-rollback', 90, { statuses: [500, 503], committed: false });
    await failRecovery('CP-21', 'a', 'A11', 'Commit correcto y fallo al preparar la respuesta: la API reconcilia y devuelve la reserva guardada (una sola).', 'transaction.after-commit', 93, { statuses: [201], committed: true });
    await caseRun('CP-21', 'b', {
      hu: 'HU-001', criterio: 'A11', esperado: 'Reintento con la misma clave tras respuesta perdida: devuelve el mismo ID y no crea otra reserva.'
    }, async () => {
      const from = addDays(T, 96);
      const to = addDays(T, 98);
      const key = randomUUID();
      const data = body(ids.g1, ids.h1, from, to);
      const first = await createReservation(reception, data, key);
      const retry = await createReservation(reception, data, key);
      const count = await activeCount(ids.h1, from, to);
      const changed = await createReservation(reception, { ...data, guestCount: 1 }, key);
      if (first.json?.reservation?.id) await reception.request('POST', `/api/reservations/${first.json.reservation.id}/cancel`);
      return {
        ok: first.status === 201 && [200, 201].includes(retry.status) && retry.json?.reservation?.id === first.json?.reservation?.id &&
          count === 1 && changed.status === 409,
        observado: `primera ${first.status}; reintento ${retry.status} mismo id=${retry.json?.reservation?.id === first.json?.reservation?.id}; activas SQL=${count}; misma clave con otros datos ${changed.status}`
      };
    });
    await failRecovery('CP-22', 'a', 'A12', 'Error real 2627 de SQL Server (clave primaria duplicada provocada en laboratorio durante la persistencia): 409, sin SQL expuesto y sin alta.', 'reservation.duplicate-request-2627', 100, { statuses: [409], committed: false });
    await caseRun('CP-22', 'b', {
      hu: 'HU-001', criterio: 'A12',
      esperado: 'Error real 2601 de SQL Server (índice único filtrado de reservas activas; el laboratorio omite la validación previa de cruces): 409, sin duplicado y R0 conservada.'
    }, async () => {
      if (unsupported('reservation.skip-overlap-check').length) {
        return { blockedReason: 'No ejecutado: la versión probada no tiene el punto de fallo reservation.skip-overlap-check ni el índice único filtrado; la validación de la aplicación responde antes de llegar al motor.' };
      }
      const before = await activeCount(ids.h1, addDays(T, 10), addDays(T, 12));
      const response = await withFailpoint('reservation.skip-overlap-check', () => createReservation(reception, body(ids.g2, ids.h1, addDays(T, 10), addDays(T, 11))));
      const after = await activeCount(ids.h1, addDays(T, 10), addDays(T, 12));
      const duplicates = await sqlCount(
        "room_id = @roomId AND check_in = @checkIn AND status IN ('PENDING_DEPOSIT','CONFIRMED','IN_PROGRESS')",
        { roomId: ids.h1, checkIn: addDays(T, 10) }
      );
      return {
        ok: response.status === 409 && !leaks(response) && before === 1 && after === 1 && duplicates === 1,
        observado: `${response.status} "${response.json?.message}"; R0 activa antes/después ${before}/${after}; activas con la misma entrada=${duplicates}`,
        evidencia: ['Punto de fallo de laboratorio: reservation.skip-overlap-check (la restricción la aplica el motor)']
      };
    });
    await failRecovery('CP-23', 'a', 'A12', 'Error real 547 (llave foránea de huésped) provocado en laboratorio durante el alta: 409, mensaje de relación inválida, sin reserva huérfana.', 'reservation.invalid-guest-fk', 103, { statuses: [409], committed: false });
    await caseRun('CP-23', 'b', {
      hu: 'HU-001', criterio: 'A12', esperado: 'Eliminar un huésped con reservas (547 real sin punto de fallo): 409 con mensaje acorde y el huésped se conserva.'
    }, async () => {
      const response = await reception.request('DELETE', `/api/guests/${ids.g1}`);
      const still = await reception.request('GET', `/api/guests/${ids.g1}`);
      return {
        ok: response.status === 409 && still.status === 200 && !leaks(response),
        observado: `${response.status} "${response.json?.message}"; huésped consultado después ${still.status}`
      };
    });
    await caseRun('CP-23', 'c', {
      hu: 'HU-001', criterio: 'A12', esperado: 'Eliminar una habitación con reservas (547 real, ADMIN): 409 y la habitación se conserva.'
    }, async () => {
      const response = await admin.request('DELETE', `/api/rooms/${ids.h1}`);
      const still = await admin.request('GET', `/api/rooms/${ids.h1}`);
      return {
        ok: response.status === 409 && still.status === 200 && !leaks(response),
        observado: `${response.status} "${response.json?.message}"; habitación consultada después ${still.status}`
      };
    });
    await caseRun('CP-24', 'api', {
      hu: 'HU-001', criterio: 'A13',
      esperado: 'Doble envío simultáneo con la misma clave (doble clic): una sola reserva; ambas respuestas identifican el mismo ID o la segunda informa conflicto.'
    }, async () => {
      const from = addDays(T, 106);
      const to = addDays(T, 108);
      const key = randomUUID();
      const data = body(ids.g1, ids.h1, from, to);
      const [first, second] = await Promise.all([createReservation(reception, data, key), createReservation(reception, data, key)]);
      const count = await activeCount(ids.h1, from, to);
      const idsReturned = [first, second].map((response) => response.json?.reservation?.id).filter(Boolean);
      const uniqueIds = new Set(idsReturned);
      if (idsReturned[0]) await reception.request('POST', `/api/reservations/${idsReturned[0]}/cancel`);
      return {
        ok: count === 1 && uniqueIds.size === 1 && [first.status, second.status].every((status) => [200, 201, 409].includes(status)),
        observado: `estados ${first.status}/${second.status}; IDs distintos devueltos=${uniqueIds.size}; activas SQL=${count}`
      };
    });

    // --- HU-005: comprobantes -------------------------------------------------
    const receipt = (client, id) => client.request('GET', `/api/receipts/${id}`);
    const savePdf = (name, response) => {
      const file = path.join(outDir, name);
      fs.writeFileSync(file, response.buffer);
      return path.relative(path.join(root, 'entregables', 'RTF4'), file).replaceAll('\\', '/');
    };
    const pdfComplete = (response) => response.status === 200 && /application\/pdf/.test(response.headers['content-type'] || '') &&
      response.buffer.subarray(0, 5).toString() === '%PDF-' && response.buffer.subarray(-6).toString().includes('%%EOF');

    await caseRun('CP-25', 'a', {
      hu: 'HU-005', criterio: 'A14',
      esperado: 'Comprobante de B: 2 noches × $200.000; consumos $0; anticipos $0; total y saldo $400.000; vinculado a la reserva; PDF válido.'
    }, async () => {
      const response = await receipt(reception, bId);
      const pdf = await reception.request('GET', `/api/receipts/${bId}/pdf`);
      const r = response.json?.receipt || {};
      const file = pdfComplete(pdf) ? savePdf('CP-25_comprobante.pdf', pdf) : null;
      return {
        ok: response.status === 200 && r.reservationId === bId && r.nights === 2 && r.ratePerNight === '200000' &&
          r.accommodation === '400000' && r.chargeTotal === '0' && r.paymentTotal === '0' && r.total === '400000' &&
          r.balance === '400000' && pdfComplete(pdf),
        observado: `${response.status}; ${r.receiptId}; noches ${r.nights}; tarifa ${r.ratePerNight}; alojamiento ${r.accommodation}; total ${r.total}; saldo ${r.balance}; PDF ${pdf.status} ${pdf.buffer.length} bytes`,
        evidencia: file ? [file] : []
      };
    });
    await caseRun('CP-25', 'b', {
      hu: 'HU-005', criterio: 'A14',
      esperado: 'Cambiar la tarifa actual de H1 a $250.000 no altera el comprobante (tarifa histórica $200.000).'
    }, async () => {
      const room = (await admin.request('GET', `/api/rooms/${ids.h1}`)).json.room;
      const update = await admin.request('PUT', `/api/rooms/${ids.h1}`, { body: { ...room, rate: 250000 } });
      const response = await receipt(reception, bId);
      const restore = await admin.request('PUT', `/api/rooms/${ids.h1}`, { body: { ...room, rate: 200000 } });
      const r = response.json?.receipt || {};
      return {
        ok: update.status === 200 && r.ratePerNight === '200000' && r.total === '400000' && restore.status === 200,
        observado: `tarifa actualizada ${update.status} (${update.json?.room?.rate}); comprobante tarifa ${r.ratePerNight}, total ${r.total}; tarifa restaurada ${restore.status}`
      };
    });
    await caseRun('CP-26', 'a', {
      hu: 'HU-005', criterio: 'A14',
      esperado: 'Consumo $50.000 y anticipo $100.000: total $450.000, anticipos $100.000, saldo $350.000; PDF con los mismos valores.'
    }, async () => {
      const charge = await reception.request('POST', `/api/receipts/${bId}/charges`, {
        body: { description: 'Restaurante RTF4', amount: 50000 }, headers: { 'Idempotency-Key': randomUUID() }
      });
      const payment = await reception.request('POST', `/api/receipts/${bId}/payments`, {
        body: { description: 'Anticipo RTF4', amount: 100000 }, headers: { 'Idempotency-Key': randomUUID() }
      });
      const response = await receipt(reception, bId);
      const pdf = await reception.request('GET', `/api/receipts/${bId}/pdf`);
      const r = response.json?.receipt || {};
      const file = pdfComplete(pdf) ? savePdf('CP-26_comprobante.pdf', pdf) : null;
      return {
        ok: charge.status === 201 && payment.status === 201 && r.chargeTotal === '50000' && r.total === '450000' &&
          r.paymentTotal === '100000' && r.balance === '350000' && pdfComplete(pdf),
        observado: `consumo ${charge.status}; anticipo ${payment.status}; total ${r.total}; anticipos ${r.paymentTotal}; saldo ${r.balance}; PDF ${pdf.status}`,
        evidencia: file ? [file] : []
      };
    });
    await caseRun('CP-26', 'b', {
      hu: 'HU-005', criterio: 'A13 A14',
      esperado: 'Reenvío del mismo consumo con la misma clave (doble clic o reintento): no duplica el cargo.'
    }, async () => {
      const key = randomUUID();
      const payload = { body: { description: 'Minibar RTF4', amount: 10000 }, headers: { 'Idempotency-Key': key } };
      const first = await reception.request('POST', `/api/receipts/${bId}/charges`, payload);
      const second = await reception.request('POST', `/api/receipts/${bId}/charges`, payload);
      const rows = (await database.query(
        'SELECT COUNT(*) AS total FROM dbo.ReservationCharges WHERE reservation_id = @id AND description = @d',
        { id: bId, d: 'Minibar RTF4' }
      )).recordset[0].total;
      return {
        ok: first.status === 201 && [200, 201].includes(second.status) && rows === 1,
        observado: `primer envío ${first.status}; segundo ${second.status}; filas en SQL=${rows}`
      };
    });
    await caseRun('CP-26', 'c', {
      hu: 'HU-005', criterio: 'A14',
      esperado: 'Anticipo mayor que el saldo pendiente: 409 y el saldo no cambia (regla definida en esta iteración).'
    }, async () => {
      const before = (await receipt(reception, bId)).json?.receipt?.balance;
      const response = await reception.request('POST', `/api/receipts/${bId}/payments`, {
        body: { description: 'Anticipo excesivo', amount: 99999999 }, headers: { 'Idempotency-Key': randomUUID() }
      });
      const after = (await receipt(reception, bId)).json?.receipt?.balance;
      return { ok: response.status === 409 && before === after, observado: `${response.status} "${response.json?.message}"; saldo antes/después ${before}/${after}` };
    });
    await caseRun('CP-26', 'd', {
      hu: 'HU-005', criterio: 'A14',
      esperado: 'Consumo sobre una reserva cancelada: 409, sin movimiento (regla definida en esta iteración).'
    }, async () => {
      const created = await createReservation(reception, body(ids.g2, ids.h2, addDays(T, 110), addDays(T, 111)));
      const id = created.json?.reservation?.id;
      await reception.request('POST', `/api/reservations/${id}/cancel`);
      const response = await reception.request('POST', `/api/receipts/${id}/charges`, {
        body: { description: 'Consumo tardío', amount: 1000 }, headers: { 'Idempotency-Key': randomUUID() }
      });
      const rows = (await database.query('SELECT COUNT(*) AS total FROM dbo.ReservationCharges WHERE reservation_id = @id', { id })).recordset[0].total;
      return { ok: response.status === 409 && rows === 0, observado: `${response.status} "${response.json?.message}"; filas SQL=${rows}` };
    });
    await caseRun('CP-27', 'a', {
      hu: 'HU-005', criterio: 'A14', esperado: 'Reserva inexistente: 404 en datos y PDF, sin documento.'
    }, async () => {
      const id = randomUUID();
      const response = await receipt(reception, id);
      const pdf = await reception.request('GET', `/api/receipts/${id}/pdf`);
      return { ok: response.status === 404 && pdf.status === 404, observado: `datos ${response.status}; PDF ${pdf.status} (${pdf.headers['content-type']})` };
    });
    await caseRun('CP-27', 'b', {
      hu: 'HU-005', criterio: 'A14', esperado: 'Sin reserva seleccionada o identificador vacío/mal formado: 404, sin documento.'
    }, async () => {
      const empty = await reception.request('GET', '/api/receipts/');
      const malformed = await reception.request('GET', '/api/receipts/abc/pdf');
      return { ok: empty.status === 404 && malformed.status === 404, observado: `sin ID ${empty.status}; mal formado ${malformed.status}` };
    });
    await caseRun('CP-28', 'a', {
      hu: 'HU-005', criterio: 'A15',
      esperado: 'CONSULTA abre por URL directa datos, PDF y página del comprobante de B: 403 en todos, sin datos del huésped.'
    }, async () => {
      const data = await receipt(consulta, bId);
      const pdf = await consulta.request('GET', `/api/receipts/${bId}/pdf?download=1`);
      const page = await consulta.request('GET', `/receipts/${bId}`);
      const exposes = [data, pdf, page].some((response) => response.text.includes('RTF4 Uno'));
      return {
        ok: data.status === 403 && pdf.status === 403 && page.status === 403 && !exposes,
        observado: `datos ${data.status}; PDF ${pdf.status}; página ${page.status}; expone huésped=${exposes}`
      };
    });
    await caseRun('CP-28', 'b', {
      hu: 'HU-005', criterio: 'A15', esperado: 'Control positivo: RECEPCION obtiene 200 en el mismo comprobante.'
    }, async () => {
      const response = await receipt(reception, bId);
      return { ok: response.status === 200, observado: `${response.status}` };
    });
    await caseRun('CP-29', 'a', {
      hu: 'HU-005', criterio: 'A14',
      esperado: 'Descargar dos veces: 200, attachment, mismos importes y sin nuevos cargos/pagos en SQL.'
    }, async () => {
      const counts = async () => (await database.query(
        `SELECT (SELECT COUNT(*) FROM dbo.ReservationCharges WHERE reservation_id = @id) AS charges,
                (SELECT COUNT(*) FROM dbo.ReservationPayments WHERE reservation_id = @id) AS payments`,
        { id: bId }
      )).recordset[0];
      const before = await counts();
      const first = await reception.request('GET', `/api/receipts/${bId}/pdf?download=1`);
      const second = await reception.request('GET', `/api/receipts/${bId}/pdf?download=1`);
      const after = await counts();
      const totalsA = (await receipt(reception, bId)).json?.receipt;
      const totalsB = (await receipt(reception, bId)).json?.receipt;
      const sameTotals = totalsA.total === totalsB.total && totalsA.balance === totalsB.balance;
      return {
        ok: pdfComplete(first) && pdfComplete(second) && /attachment/.test(first.headers['content-disposition']) &&
          before.charges === after.charges && before.payments === after.payments && sameTotals && first.buffer.equals(second.buffer),
        observado: `descargas ${first.status}/${second.status}; ${first.headers['content-disposition']}; cargos ${before.charges}→${after.charges}; pagos ${before.payments}→${after.payments}; PDF idénticos=${first.buffer.equals(second.buffer)}`
      };
    });
    await caseRun('CP-30', 'a', {
      hu: 'HU-005', criterio: 'A11 A14',
      esperado: 'Fallo controlado al generar el PDF: 500 con mensaje claro, sin archivo; movimientos sin cambios; el reintento produce un PDF completo.'
    }, async () => {
      if (unsupported('receipt.pdf').length) {
        return { blockedReason: 'No ejecutado: en la versión probada el punto de fallo receipt.pdf solo existe con NODE_ENV=test (memoria), no con SQL Server.' };
      }
      const before = (await receipt(reception, bId)).json?.receipt;
      const failed = await withFailpoint('receipt.pdf', () => reception.request('GET', `/api/receipts/${bId}/pdf`));
      const after = (await receipt(reception, bId)).json?.receipt;
      const retry = await reception.request('GET', `/api/receipts/${bId}/pdf`);
      return {
        ok: failed.status === 500 && !/pdf/.test(failed.headers['content-type'] || '') && !leaks(failed) &&
          before.balance === after.balance && before.charges.length === after.charges.length && pdfComplete(retry),
        observado: `fallo ${failed.status} (${failed.headers['content-type']}) "${failed.json?.message}"; saldo ${before.balance}→${after.balance}; reintento ${retry.status} completo=${pdfComplete(retry)}`,
        evidencia: ['Punto de fallo de laboratorio: receipt.pdf']
      };
    });

    // --- Recorrido completo y permisos ----------------------------------------
    await caseRun('CP-31', 'api', {
      hu: 'Todas', criterio: 'A13 A16',
      esperado: 'RECEPCION consulta, omite primero un campo (400), corrige (201) y el comprobante conserva ID, fechas y valores.'
    }, async () => {
      const from = addDays(T, 115);
      const to = addDays(T, 118);
      const search = await availability(reception, from, to, 2);
      const key = randomUUID();
      const missing = await reception.request('POST', '/api/reservations', {
        body: { guestId: ids.g2, checkIn: from, checkOut: to, guestCount: 2 }, headers: { 'Idempotency-Key': key }
      });
      const created = await createReservation(reception, body(ids.g2, ids.h2, from, to, 2));
      const id = created.json?.reservation?.id;
      const r = (await receipt(reception, id)).json?.receipt || {};
      if (id) await reception.request('POST', `/api/reservations/${id}/cancel`);
      return {
        ok: search.status === 200 && roomIn(search, ids.h2) && missing.status === 400 && created.status === 201 &&
          r.reservationId === id && r.checkIn === from && r.checkOut === to && r.nights === 3 && r.total === String(3 * 220000),
        observado: `búsqueda ${search.status}; campo faltante ${missing.status}; alta ${created.status}; comprobante ${r.receiptId} noches ${r.nights} total ${r.total}`
      };
    });
    await caseRun('CP-32', 'a', {
      hu: 'HU-004 HU-001', criterio: 'A15',
      esperado: 'CONSULTA invoca directamente operaciones de reserva (crear, confirmar, cancelar, listar, página): 403 y sin cambios.'
    }, async () => {
      const before = await totalReservations();
      const create = await createReservation(consulta, body(ids.g1, ids.h2, addDays(T, 120), addDays(T, 121)));
      const status = await consulta.request('PATCH', `/api/reservations/${r0Id}/status`, { body: { status: 'CANCELLED' } });
      const cancel = await consulta.request('POST', `/api/reservations/${r0Id}/cancel`);
      const list = await consulta.request('GET', '/api/reservations');
      const page = await consulta.request('GET', '/reservations');
      const after = await totalReservations();
      const r0 = (await reception.request('GET', `/api/reservations/${r0Id}`)).json?.reservation?.status;
      return {
        ok: [create, status, cancel, list, page].every((response) => response.status === 403) && after === before && r0 === 'CONFIRMED',
        observado: `crear ${create.status}; estado ${status.status}; cancelar ${cancel.status}; listar ${list.status}; página ${page.status}; reservas ${before}/${after}; R0 ${r0}`
      };
    });
    await caseRun('CP-32', 'b', {
      hu: 'HU-004 HU-002', criterio: 'A15',
      esperado: 'Control positivo: CONSULTA sí consulta disponibilidad y habitaciones (200); huéspedes y dashboard 403; RECEPCION no crea habitaciones (403).'
    }, async () => {
      const avail = await availability(consulta, addDays(T, 15), addDays(T, 17), 2);
      const rooms = await consulta.request('GET', '/api/rooms');
      const guests = await consulta.request('GET', '/api/guests');
      const dashboard = await consulta.request('GET', '/api/dashboard/summary');
      const createRoom = await reception.request('POST', '/api/rooms', {
        body: { number: 'X-1', type: 'DOBLE', capacity: 2, rate: 1000, status: 'DISPONIBLE', description: '' }
      });
      return {
        ok: avail.status === 200 && rooms.status === 200 && guests.status === 403 && dashboard.status === 403 && createRoom.status === 403,
        observado: `disponibilidad ${avail.status}; habitaciones ${rooms.status}; huéspedes ${guests.status}; dashboard ${dashboard.status}; recepción crea habitación ${createRoom.status}`
      };
    });
  } finally {
    // Limpieza no destructiva: las reservas de esta ejecución quedan canceladas.
    for (const id of createdReservationIds) await cancelBySql(id).catch(() => {});
    for (const client of [admin, admin2, reception, consulta, anonymous]) client.close();
    await new Promise((resolve) => server.close(resolve));
    await database.closePool().catch(() => {});
  }

  const summary = results.reduce((acc, item) => {
    acc[item.estado] = (acc[item.estado] || 0) + 1;
    return acc;
  }, {});
  const report = {
    ejecucion: runLabel,
    inicio: startedAt.toISOString(),
    fin: new Date().toISOString(),
    fechaReferenciaT: T,
    zonaHoraria: 'America/Bogota',
    version,
    ambiente: {
      node: process.version,
      baseDeDatos: `${expectedDatabase} (SQL Server 2022 Express local)`,
      api: 'Express en 127.0.0.1, puerto efímero',
      clientes: 'node:http con agentes independientes por sesión'
    },
    resumen: { variantes: results.length, ...summary },
    concurrenciaCP17: pairs,
    resultados: results
  };
  fs.writeFileSync(path.join(outDir, 'resultados.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'http-log.json'), JSON.stringify(log, null, 2));
  const lines = [
    `# Resultados API + SQL Server — ${runLabel}`,
    '',
    `- Inicio: ${report.inicio} · Fin: ${report.fin} · T (hotel, America/Bogota): ${T}`,
    `- Versión: commit base ${version.commitBase}; cambios sin commit: ${version.cambiosSinCommit ? 'sí' : 'no'}; huella ${version.huellaArbolDeTrabajo}`,
    `- Ambiente: Node ${process.version}; ${report.ambiente.baseDeDatos}; ${report.ambiente.clientes}`,
    `- Resumen: ${results.length} variantes · ${Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join(' · ')}`,
    '',
    '| CP | Var. | HU | Criterio | Esperado | Observado | Estado |',
    '|---|---|---|---|---|---|---|',
    ...results.map((item) => `| ${item.cp} | ${item.variante} | ${item.hu} | ${item.criterio} | ${item.esperado.replaceAll('|', '/')} | ${String(item.observado).replaceAll('|', '/')} | ${item.estado} |`)
  ];
  fs.writeFileSync(path.join(outDir, 'resultados.md'), `${lines.join('\n')}\n`);
  console.log(`\nResumen ${runLabel}: ${JSON.stringify(report.resumen)}\nEvidencia: ${path.relative(root, outDir)}`);
  return report;
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
