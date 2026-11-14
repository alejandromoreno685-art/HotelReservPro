// Genera la colección y el entorno Postman RTF4 (sin secretos).
// Uso: node scripts/build-postman.js
const fs = require('node:fs');
const path = require('node:path');

const outDir = path.join(__dirname, '..', 'docs', 'rtf4', 'postman');
fs.mkdirSync(outDir, { recursive: true });

const json = { key: 'Content-Type', value: 'application/json' };
const lines = (text) => text.trim().split('\n');
const request = (name, method, url, { body, headers = [], tests, prerequest } = {}) => ({
  name,
  event: [
    ...(prerequest ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: lines(prerequest) } }] : []),
    ...(tests ? [{ listen: 'test', script: { type: 'text/javascript', exec: lines(tests) } }] : [])
  ],
  request: {
    method,
    header: [...(body ? [json] : []), ...headers],
    url: { raw: `{{baseUrl}}${url}`, host: ['{{baseUrl}}'], path: url.split('?')[0].split('/').filter(Boolean) ,
      ...(url.includes('?') ? { query: url.split('?')[1].split('&').map((pair) => { const [key, value] = pair.split('='); return { key, value }; }) } : {}) },
    ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } } : {})
  }
});

// Fechas del hotel (America/Bogota) calculadas en cada ejecución. Se usa un
// desplazamiento de 300 a 999 días para no chocar con ejecuciones anteriores.
const setupDates = `
const bogota = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const addDays = (value, days) => { const d = new Date(value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
if (!pm.collectionVariables.get('checkIn')) {
  const offset = 300 + Math.floor(Math.random() * 230) * 3;
  pm.collectionVariables.set('checkIn', addDays(bogota, offset));
  pm.collectionVariables.set('checkOut', addDays(bogota, offset + 2));
  pm.collectionVariables.set('checkInOverlap', addDays(bogota, offset + 1));
  pm.collectionVariables.set('checkOutOverlap', addDays(bogota, offset + 3));
  pm.collectionVariables.set('idempotencyKey', pm.variables.replaceIn('{{$guid}}'));
}`;

const collection = {
  info: {
    name: 'HotelReserve Pro - RTF4 Pruebas funcionales',
    description: 'Recorrido API de RTF4 contra la base HotelReservePro_Test. Requiere los datos ficticios de scripts/seed-rtf4.js. Las contraseñas se ingresan en el entorno local (valor actual) o con --env-var; nunca se guardan en este archivo.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [
    { key: 'checkIn', value: '' }, { key: 'checkOut', value: '' },
    { key: 'checkInOverlap', value: '' }, { key: 'checkOutOverlap', value: '' },
    { key: 'idempotencyKey', value: '' }, { key: 'reservationId', value: '' }
  ],
  item: [
    {
      name: '1. Acceso (HU-004)',
      item: [
        request('CP-04a - Reservas sin sesión → 401', 'GET', '/api/reservations', {
          prerequest: setupDates,
          tests: `pm.test('CP-04a responde 401 sin sesión', () => pm.response.to.have.status(401));`
        }),
        request('CP-02a - Contraseña incorrecta → 401 genérico', 'POST', '/api/auth/login', {
          body: { username: '{{adminUsername}}', password: 'Clave-incorrecta-RTF4' },
          tests: `pm.test('CP-02a responde 401', () => pm.response.to.have.status(401));
pm.test('Mensaje genérico', () => pm.expect(pm.response.json().message).to.eql('Usuario o contraseña incorrectos.'));`
        }),
        request('CP-03c - Campos vacíos → 400', 'POST', '/api/auth/login', {
          body: { username: '', password: '' },
          tests: `pm.test('CP-03c responde 400', () => pm.response.to.have.status(400));`
        }),
        request('CP-01 - Iniciar sesión ADMIN → 200', 'POST', '/api/auth/login', {
          body: { username: '{{adminUsername}}', password: '{{adminPassword}}' },
          tests: `pm.test('CP-01 responde 200', () => pm.response.to.have.status(200));
pm.test('Rol admin y sin contraseña en la respuesta', () => {
  pm.expect(pm.response.json().user.role).to.eql('admin');
  pm.expect(pm.response.text()).to.not.include(pm.environment.get('adminPassword'));
});`
        }),
        request('CP-01 - Sesión actual → 200', 'GET', '/api/auth/me', {
          tests: `pm.test('Sesión válida', () => pm.response.to.have.status(200));`
        })
      ]
    },
    {
      name: '2. Disponibilidad (HU-002)',
      item: [
        request('CP-05 - Consultar periodo libre → incluye la habitación', 'GET', '/api/availability?checkIn={{checkIn}}&checkOut={{checkOut}}&guestCount=2', {
          tests: `pm.test('CP-05 responde 200', () => pm.response.to.have.status(200));
pm.test('Incluye la habitación de prueba', () => pm.expect(pm.response.json().rooms.map(r => r.id)).to.include(pm.environment.get('roomId')));
pm.test('Excluye la habitación en mantenimiento', () => pm.expect(pm.response.json().rooms.map(r => r.id)).to.not.include(pm.environment.get('roomMaintenanceId')));`
        }),
        request('CP-08c - Fechas invertidas → 400', 'GET', '/api/availability?checkIn={{checkOut}}&checkOut={{checkIn}}&guestCount=2', {
          tests: `pm.test('CP-08c responde 400', () => pm.response.to.have.status(400));`
        }),
        request('CP-08d - Sin coincidencias → 200 y lista vacía', 'GET', '/api/availability?checkIn={{checkIn}}&checkOut={{checkOut}}&guestCount=2&roomType=SUITE', {
          tests: `pm.test('CP-08d responde 200 con lista vacía', () => { pm.response.to.have.status(200); pm.expect(pm.response.json().rooms).to.have.length(0); });`
        })
      ]
    },
    {
      name: '3. Reservas (HU-001)',
      item: [
        request('CP-09 - Crear reserva → 201 PENDING_DEPOSIT', 'POST', '/api/reservations', {
          headers: [{ key: 'Idempotency-Key', value: '{{idempotencyKey}}' }],
          body: { guestId: '{{guestId}}', roomId: '{{roomId}}', checkIn: '{{checkIn}}', checkOut: '{{checkOut}}', guestCount: 2 },
          tests: `pm.test('CP-09 responde 201', () => pm.response.to.have.status(201));
const r = pm.response.json().reservation;
pm.test('Estado PENDING_DEPOSIT y datos iguales', () => {
  pm.expect(r.status).to.eql('PENDING_DEPOSIT');
  pm.expect(r.checkIn).to.eql(pm.collectionVariables.get('checkIn'));
  pm.expect(r.roomId.toLowerCase()).to.eql(pm.environment.get('roomId').toLowerCase());
});
pm.collectionVariables.set('reservationId', r.id);`
        }),
        request('CP-21b/24 - Reintento con la misma clave → mismo ID', 'POST', '/api/reservations', {
          headers: [{ key: 'Idempotency-Key', value: '{{idempotencyKey}}' }],
          body: { guestId: '{{guestId}}', roomId: '{{roomId}}', checkIn: '{{checkIn}}', checkOut: '{{checkOut}}', guestCount: 2 },
          tests: `pm.test('No crea otra reserva', () => pm.expect(pm.response.json().reservation.id).to.eql(pm.collectionVariables.get('reservationId')));`
        }),
        request('CP-21 - Reconciliar por clave → 200', 'GET', '/api/reservations/idempotency/{{idempotencyKey}}', {
          tests: `pm.test('Localiza la reserva guardada', () => { pm.response.to.have.status(200); pm.expect(pm.response.json().reservation.id).to.eql(pm.collectionVariables.get('reservationId')); });`
        }),
        request('CP-14b - Solapamiento → 409', 'POST', '/api/reservations', {
          headers: [{ key: 'Idempotency-Key', value: '{{$guid}}' }],
          body: { guestId: '{{guestId2}}', roomId: '{{roomId}}', checkIn: '{{checkInOverlap}}', checkOut: '{{checkOutOverlap}}', guestCount: 2 },
          tests: `pm.test('CP-14 responde 409', () => pm.response.to.have.status(409));`
        }),
        request('CP-13a - Huésped inexistente → 404', 'POST', '/api/reservations', {
          headers: [{ key: 'Idempotency-Key', value: '{{$guid}}' }],
          body: { guestId: '{{guestIdMissing}}', roomId: '{{roomId}}', checkIn: '{{checkOut}}', checkOut: '{{checkOutOverlap}}', guestCount: 2 },
          tests: `pm.test('CP-13a responde 404', () => pm.response.to.have.status(404));`
        }),
        request('CP-12d - Excede capacidad → 400', 'POST', '/api/reservations', {
          headers: [{ key: 'Idempotency-Key', value: '{{$guid}}' }],
          body: { guestId: '{{guestId}}', roomId: '{{roomId}}', checkIn: '{{checkOut}}', checkOut: '{{checkOutOverlap}}', guestCount: 3 },
          tests: `pm.test('CP-12d responde 400', () => pm.response.to.have.status(400));`
        }),
        request('CP-09 - Consultar reserva → 200', 'GET', '/api/reservations/{{reservationId}}', {
          tests: `pm.test('Persistida', () => { pm.response.to.have.status(200); pm.expect(pm.response.json().reservation.status).to.eql('PENDING_DEPOSIT'); });`
        }),
        request('CP-16a - Confirmar → 200', 'PATCH', '/api/reservations/{{reservationId}}/status', {
          body: { status: 'CONFIRMED' },
          tests: `pm.test('CP-16a responde 200 CONFIRMED', () => { pm.response.to.have.status(200); pm.expect(pm.response.json().reservation.status).to.eql('CONFIRMED'); });`
        }),
        request('CP-16b - CONFIRMED → IN_PROGRESS → 409', 'PATCH', '/api/reservations/{{reservationId}}/status', {
          body: { status: 'IN_PROGRESS' },
          tests: `pm.test('CP-16b responde 409', () => pm.response.to.have.status(409));`
        })
      ]
    },
    {
      name: '4. Comprobantes (HU-005)',
      item: [
        request('CP-25 - Comprobante inicial 2 × $200.000', 'GET', '/api/receipts/{{reservationId}}', {
          tests: `pm.test('CP-25 total y saldo $400.000', () => {
  const r = pm.response.json().receipt;
  pm.expect(r.nights).to.eql(2); pm.expect(r.ratePerNight).to.eql('200000');
  pm.expect(r.total).to.eql('400000'); pm.expect(r.balance).to.eql('400000');
});`
        }),
        request('CP-26 - Registrar consumo $50.000 → 201', 'POST', '/api/receipts/{{reservationId}}/charges', {
          headers: [{ key: 'Idempotency-Key', value: '{{$guid}}' }],
          body: { description: 'Restaurante (Postman)', amount: 50000 },
          tests: `pm.test('Consumo registrado', () => pm.response.to.have.status(201));`
        }),
        request('CP-26 - Registrar anticipo $100.000 → 201', 'POST', '/api/receipts/{{reservationId}}/payments', {
          headers: [{ key: 'Idempotency-Key', value: '{{$guid}}' }],
          body: { description: 'Anticipo (Postman)', amount: 100000 },
          tests: `pm.test('Anticipo registrado', () => pm.response.to.have.status(201));
pm.test('CP-26 total $450.000 y saldo $350.000', () => {
  const r = pm.response.json().receipt;
  pm.expect(r.total).to.eql('450000'); pm.expect(r.balance).to.eql('350000');
});`
        }),
        request('CP-26c - Anticipo mayor al saldo → 409', 'POST', '/api/receipts/{{reservationId}}/payments', {
          headers: [{ key: 'Idempotency-Key', value: '{{$guid}}' }],
          body: { description: 'Anticipo excesivo', amount: 999999 },
          tests: `pm.test('CP-26c responde 409', () => pm.response.to.have.status(409));`
        }),
        request('CP-29 - Descargar PDF → 200 application/pdf', 'GET', '/api/receipts/{{reservationId}}/pdf?download=1', {
          tests: `pm.test('PDF descargable', () => { pm.response.to.have.status(200); pm.expect(pm.response.headers.get('Content-Type')).to.include('application/pdf'); pm.expect(pm.response.headers.get('Content-Disposition')).to.include('attachment'); });`
        }),
        request('CP-27a - Reserva inexistente → 404', 'GET', '/api/receipts/{{$guid}}', {
          tests: `pm.test('CP-27a responde 404', () => pm.response.to.have.status(404));`
        })
      ]
    },
    {
      name: '5. Permisos (HU-004/HU-005)',
      item: [
        request('Login CONSULTA → 200', 'POST', '/api/auth/login', {
          body: { username: '{{consultaUsername}}', password: '{{consultaPassword}}' },
          tests: `pm.test('Login CONSULTA', () => pm.response.to.have.status(200));`
        }),
        request('CP-28a - CONSULTA abre comprobante → 403', 'GET', '/api/receipts/{{reservationId}}', {
          tests: `pm.test('CP-28 responde 403', () => pm.response.to.have.status(403));
pm.test('No expone datos del huésped', () => pm.expect(pm.response.text()).to.not.include('RTF4 Uno'));`
        }),
        request('CP-32a - CONSULTA crea reserva → 403', 'POST', '/api/reservations', {
          headers: [{ key: 'Idempotency-Key', value: '{{$guid}}' }],
          body: { guestId: '{{guestId}}', roomId: '{{roomId}}', checkIn: '{{checkOutOverlap}}', checkOut: '{{checkOutOverlap}}', guestCount: 1 },
          tests: `pm.test('CP-32 responde 403', () => pm.response.to.have.status(403));`
        }),
        request('CP-32b - CONSULTA consulta disponibilidad → 200', 'GET', '/api/availability?checkIn={{checkIn}}&checkOut={{checkOut}}&guestCount=1', {
          tests: `pm.test('Disponibilidad permitida', () => pm.response.to.have.status(200));`
        }),
        request('Login ADMIN para limpieza → 200', 'POST', '/api/auth/login', {
          body: { username: '{{adminUsername}}', password: '{{adminPassword}}' },
          tests: `pm.test('Login ADMIN', () => pm.response.to.have.status(200));`
        }),
        request('CP-16c - Cancelar reserva (libera el intervalo) → 200', 'POST', '/api/reservations/{{reservationId}}/cancel', {
          tests: `pm.test('Cancelada', () => { pm.response.to.have.status(200); pm.expect(pm.response.json().reservation.status).to.eql('CANCELLED'); });`
        }),
        request('Cerrar sesión → 204', 'POST', '/api/auth/logout', {
          tests: `pm.test('Sesión cerrada', () => pm.response.to.have.status(204));`
        })
      ]
    }
  ]
};

const environment = {
  name: 'HotelReserve Pro RTF4 - local (sin secretos)',
  values: [
    ['baseUrl', 'http://localhost:3000'],
    ['adminUsername', 'rtf4-admin'],
    ['adminPassword', ''],
    ['consultaUsername', 'rtf4-consulta'],
    ['consultaPassword', ''],
    ['guestId', '11111111-1111-4111-8111-111111111101'],
    ['guestId2', '11111111-1111-4111-8111-111111111102'],
    ['guestIdMissing', '11111111-1111-4111-8111-111111111199'],
    ['roomId', '22222222-2222-4222-8222-222222222201'],
    ['roomMaintenanceId', '22222222-2222-4222-8222-222222222203']
  ].map(([key, value]) => ({ key, value, type: /password/i.test(key) ? 'secret' : 'default', enabled: true })),
  _postman_variable_scope: 'environment'
};

fs.writeFileSync(path.join(outDir, 'HotelReservePro_RTF4.postman_collection.json'), `${JSON.stringify(collection, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'HotelReservePro_RTF4.postman_environment.json'), `${JSON.stringify(environment, null, 2)}\n`);
console.log('Colección y entorno Postman generados en docs/rtf4/postman');
