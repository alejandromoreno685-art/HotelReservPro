const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

const app = require('../main');
const { jwtSecret, tokenIssuer } = require('../src/security');

let server;
let baseUrl;
let adminCookie;
let guestId;
let roomId;
let reservationId;

function futureDate(daysFromNow) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function roleCookie(role) {
  const token = jwt.sign(
    { sub: `user-${role}`, username: `rtf4-${role}`, role },
    jwtSecret,
    { algorithm: 'HS256', issuer: tokenIssuer, expiresIn: '10m' }
  );
  return `hotelreserve_token=${token}`;
}

function extractPdfText(buffer) {
  return [...buffer.toString('ascii').matchAll(/<([A-F0-9]+)> Tj/g)]
    .map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'))
    .join('\n');
}

async function request(path, options = {}, cookie = adminCookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  return { response, body };
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  assert.equal(login.status, 200);
  adminCookie = login.headers.get('set-cookie').split(';')[0];

  const guest = await request('/api/guests', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Huésped de comprobante',
      documentType: 'OTHER',
      documentNumber: `RCP-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      phone: '3001234567',
      email: 'comprobante@example.com',
      country: 'Colombia',
      foreignNonResident: false
    })
  });
  assert.equal(guest.response.status, 201, JSON.stringify(guest.body));
  guestId = guest.body.guest.id;

  const room = await request('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      number: `RC-${randomUUID().slice(0, 8)}`,
      type: 'DOBLE',
      capacity: 2,
      rate: 200000,
      status: 'DISPONIBLE',
      description: ''
    })
  });
  assert.equal(room.response.status, 201, JSON.stringify(room.body));
  roomId = room.body.room.id;

  const created = await request('/api/reservations', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      guestId,
      roomId,
      checkIn: futureDate(10),
      checkOut: futureDate(12),
      guestCount: 2
    })
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  reservationId = created.body.reservation.id;
});

after(async () => {
  if (reservationId) {
    await request(`/api/reservations/${reservationId}/cancel`, { method: 'POST' });
  }
  if (guestId) await request(`/api/guests/${guestId}`, { method: 'DELETE' });
  if (roomId) await request(`/api/rooms/${roomId}`, { method: 'DELETE' });
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('calculates and reprints a receipt from persisted reservation and financial data', async () => {
  const first = await request(`/api/receipts/${reservationId}`);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.receipt.nights, 2);
  assert.equal(first.body.receipt.ratePerNight, '200000');
  assert.equal(first.body.receipt.accommodation, '400000');
  assert.equal(first.body.receipt.total, '400000');
  assert.equal(first.body.receipt.balance, '400000');
  assert.equal(first.body.receipt.reservationId, reservationId);

  const charge = await request(`/api/receipts/${reservationId}/charges`, {
    method: 'POST',
    body: JSON.stringify({ description: 'Consumo de prueba', amount: 50000 })
  });
  assert.equal(charge.response.status, 201);
  const payment = await request(`/api/receipts/${reservationId}/payments`, {
    method: 'POST',
    body: JSON.stringify({ description: 'Anticipo de prueba', amount: 100000 })
  });
  assert.equal(payment.response.status, 201);
  assert.equal(payment.body.receipt.chargeTotal, '50000');
  assert.equal(payment.body.receipt.paymentTotal, '100000');
  assert.equal(payment.body.receipt.total, '450000');
  assert.equal(payment.body.receipt.balance, '350000');

  const updatedRoom = await request(`/api/rooms/${roomId}`, {
    method: 'PUT',
    body: JSON.stringify({ rate: 300000 })
  });
  assert.equal(updatedRoom.response.status, 200);
  const reprinted = await request(`/api/receipts/${reservationId}`);
  assert.equal(reprinted.body.receipt.receiptId, first.body.receipt.receiptId);
  assert.equal(reprinted.body.receipt.ratePerNight, '200000');
  assert.equal(reprinted.body.receipt.total, '450000');
  assert.equal(reprinted.body.receipt.balance, '350000');

  const preview = await request(`/api/receipts/${reservationId}/pdf`);
  const download = await request(`/api/receipts/${reservationId}/pdf?download=1`);
  assert.equal(preview.response.status, 200);
  assert.equal(preview.response.headers.get('content-type'), 'application/pdf');
  assert.match(preview.response.headers.get('content-disposition'), /^inline/);
  assert.match(download.response.headers.get('content-disposition'), /^attachment/);
  assert.equal(preview.body.subarray(0, 8).toString('ascii'), '%PDF-1.4');
  assert.deepEqual(download.body, preview.body);
  assert.match(preview.body.toString('ascii'), /\/Type \/Page/);
  const pdfText = extractPdfText(preview.body);
  assert.match(pdfText, /COMPROBANTE INTERNO/);
  assert.match(pdfText, /No es factura electrónica/);
  assert.match(pdfText, /450\.000/);
  assert.match(pdfText, /350\.000/);
  assert.match(pdfText, new RegExp(reservationId));

  process.env.RTF4_TEST_FAILPOINT = 'receipt.pdf';
  try {
    const failedPdf = await request(`/api/receipts/${reservationId}/pdf`);
    assert.equal(failedPdf.response.status, 500);
    assert.deepEqual(failedPdf.body, {
      message: 'No fue posible generar el comprobante PDF. No se registraron cambios; intenta nuevamente.'
    });
  } finally {
    delete process.env.RTF4_TEST_FAILPOINT;
  }
  const unchanged = await request(`/api/receipts/${reservationId}`);
  assert.equal(unchanged.body.receipt.total, '450000');
  assert.equal(unchanged.body.receipt.balance, '350000');
});

test('returns not-found and validation errors without exposing receipt data', async () => {
  const absent = await request('/api/receipts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(absent.response.status, 404);
  const invalid = await request(`/api/receipts/${reservationId}/charges`, {
    method: 'POST',
    body: JSON.stringify({ description: 'No válido', amount: 1.5 })
  });
  assert.equal(invalid.response.status, 400);
});

test('enforces API and page permissions for consultation users', async () => {
  const consulta = roleCookie('consulta');
  const noToken = await request(`/api/receipts/${reservationId}`, {}, null);
  assert.equal(noToken.response.status, 401);
  const noTokenReservation = await request('/api/reservations', {}, null);
  assert.equal(noTokenReservation.response.status, 401);
  const expired = jwt.sign(
    { sub: 'expired', username: 'expired', role: 'admin' },
    jwtSecret,
    { algorithm: 'HS256', issuer: tokenIssuer, expiresIn: -1 }
  );
  const altered = `${expired.slice(0, -1)}x`;
  for (const token of [expired, altered]) {
    const headers = { authorization: `Bearer ${token}` };
    assert.equal((await request('/api/reservations', { headers }, null)).response.status, 401);
    assert.equal((await request(`/api/receipts/${reservationId}`, { headers }, null)).response.status, 401);
  }

  const roomList = await request('/api/rooms', {}, consulta);
  assert.equal(roomList.response.status, 200);
  const availability = await request(
    `/api/availability?checkIn=${futureDate(20)}&checkOut=${futureDate(21)}&guestCount=1`,
    {},
    consulta
  );
  assert.equal(availability.response.status, 200);
  for (const path of [
    '/api/reservations',
    '/api/guests',
    `/api/receipts/${reservationId}`,
    `/api/receipts/${reservationId}/pdf`,
    `/receipts/${reservationId}`
  ]) {
    const response = await request(path, {}, consulta);
    assert.equal(response.response.status, 403, path);
  }
  const roomMutation = await request('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ number: 'NOPE', type: 'DOBLE', capacity: 2, rate: 1 })
  }, consulta);
  assert.equal(roomMutation.response.status, 403);
});

test('renders receipt entry points from reservations and the module menu', async () => {
  const page = await request('/receipts');
  const html = page.body.toString();
  assert.equal(page.response.status, 200);
  assert.match(html, /Comprobantes/);
  assert.match(html, new RegExp(`/receipts/${reservationId}`));
  const detail = await request(`/receipts/${reservationId}`);
  assert.equal(detail.response.status, 200);
  assert.match(detail.body.toString(), /Vista previa PDF/);
});

test('RTF4: does not duplicate a movement retried with the same Idempotency-Key', async () => {
  const key = randomUUID();
  const send = () => request(`/api/receipts/${reservationId}/charges`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ description: 'Minibar idempotente', amount: 10000 })
  });
  const first = await send();
  const second = await send();
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 200);
  assert.equal(second.body.duplicate, true);
  const matches = second.body.receipt.charges.filter((item) => item.description === 'Minibar idempotente');
  assert.equal(matches.length, 1);

  const changed = await request(`/api/receipts/${reservationId}/charges`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ description: 'Otro valor', amount: 99 })
  });
  assert.equal(changed.response.status, 409);
});

test('RTF4: rejects payments above the pending balance and movements on cancelled reservations', async () => {
  const before = await request(`/api/receipts/${reservationId}`);
  const excessive = await request(`/api/receipts/${reservationId}/payments`, {
    method: 'POST',
    body: JSON.stringify({ description: 'Excesivo', amount: Number(before.body.receipt.balance) + 1 })
  });
  assert.equal(excessive.response.status, 409);
  assert.match(excessive.body.message, /saldo pendiente/);
  const unchanged = await request(`/api/receipts/${reservationId}`);
  assert.equal(unchanged.body.receipt.balance, before.body.receipt.balance);

  const created = await request('/api/reservations', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ guestId, roomId, checkIn: futureDate(40), checkOut: futureDate(41), guestCount: 1 })
  });
  assert.equal(created.response.status, 201);
  const id = created.body.reservation.id;
  await request(`/api/reservations/${id}/cancel`, { method: 'POST' });
  const charge = await request(`/api/receipts/${id}/charges`, {
    method: 'POST',
    body: JSON.stringify({ description: 'Tardío', amount: 1000 })
  });
  assert.equal(charge.response.status, 409);
  const receipt = await request(`/api/receipts/${id}`);
  assert.equal(receipt.body.receipt.charges.length, 0);
});
