const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { hotelToday } = require('../src/hotelDate');

process.env.NODE_ENV = 'test';

const app = require('../main');

let server;
let baseUrl;
let cookie;
let guestId;
let roomId;
let reservationId;
const createdReservationIds = new Set();

function futureDate(daysFromNow) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function requestJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (path === '/api/reservations' && options.method === 'POST' && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = randomUUID();
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      cookie,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...headers
    }
  });
  const data = response.status === 204 ? null : await response.json();
  if (data?.reservation?.id) createdReservationIds.add(data.reservation.id);
  return { response, data };
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
  cookie = login.headers.get('set-cookie').split(';')[0];

  const guest = await requestJson('/api/guests', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Huésped de prueba de reservas',
      documentType: 'OTHER',
      documentNumber: 'RESERVATIONTEST1',
      phone: '3001234567',
      email: 'reservas-test@example.com',
      country: 'Colombia',
      foreignNonResident: false
    })
  });
  guestId = guest.data.guest.id;

  const room = await requestJson('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      number: 'RES-TEST',
      type: 'DOBLE',
      capacity: 2,
      rate: 180000,
      status: 'DISPONIBLE',
      description: ''
    })
  });
  roomId = room.data.room.id;
});

after(async () => {
  for (const id of createdReservationIds) {
    await requestJson(`/api/reservations/${id}/cancel`, { method: 'POST' });
  }
  if (guestId) await requestJson(`/api/guests/${guestId}`, { method: 'DELETE' });
  if (roomId) await requestJson(`/api/rooms/${roomId}`, { method: 'DELETE' });
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('creates, lists, confirms and cancels reservations without overbooking', async () => {
  const page = await fetch(`${baseUrl}/reservations`, { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Nueva reserva/);
  const stylesheet = await fetch(`${baseUrl}/css/reservations.css`);
  assert.equal(stylesheet.status, 200);
  const frontend = await fetch(`${baseUrl}/js/reservations.js`);
  assert.equal(frontend.status, 200);

  const checkIn = futureDate(10);
  const checkOut = futureDate(12);
  const payload = { guestId, roomId, checkIn, checkOut, guestCount: 2 };
  const created = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  assert.equal(created.response.status, 201);
  reservationId = created.data.reservation.id;
  assert.equal(created.data.reservation.status, 'PENDING_DEPOSIT');
  assert.equal(created.data.reservation.guestName, 'Huésped de prueba de reservas');
  assert.equal(created.data.reservation.ratePerNight, 180000);
  const detail = await fetch(`${baseUrl}/reservations/${reservationId}`, { headers: { cookie } });
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /Abrir comprobante/);
  const dashboard = await requestJson('/api/dashboard/summary');
  assert.equal(dashboard.data.summary.pendingReservations, 1);

  const overlap = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  assert.equal(overlap.response.status, 409);
  for (const [overlapStart, overlapEnd] of [
    [futureDate(9), futureDate(11)],
    [futureDate(11), futureDate(13)],
    [futureDate(9), futureDate(13)]
  ]) {
    const result = await requestJson('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({
        guestId,
        roomId,
        checkIn: overlapStart,
        checkOut: overlapEnd,
        guestCount: 1
      })
    });
    assert.equal(result.response.status, 409);
  }

  const availableQuery = new URLSearchParams({ checkIn, checkOut, guestCount: '2' });
  const availability = await requestJson(`/api/availability?${availableQuery}`);
  assert.equal(availability.data.rooms.some((room) => room.id === roomId), false);

  const confirmed = await requestJson(`/api/reservations/${reservationId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'CONFIRMED' })
  });
  assert.equal(confirmed.response.status, 200);
  assert.equal(confirmed.data.reservation.status, 'CONFIRMED');

  const invalidTransition = await requestJson(`/api/reservations/${reservationId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'IN_PROGRESS' })
  });
  assert.equal(invalidTransition.response.status, 409);

  const cancelled = await requestJson(`/api/reservations/${reservationId}/cancel`, { method: 'POST' });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.data.reservation.status, 'CANCELLED');
  reservationId = null;

  const releasedAvailability = await requestJson(`/api/availability?${availableQuery}`);
  assert.equal(releasedAvailability.data.rooms.some((room) => room.id === roomId), true);

  const list = await requestJson('/api/reservations?status=CANCELLED');
  assert.ok(list.data.reservations.some((item) => item.id === cancelled.data.reservation.id));
});

test('rejects invalid reservation dates, guest capacity, and status transitions', async () => {
  const invalidDates = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({
      guestId,
      roomId,
      checkIn: futureDate(2),
      checkOut: futureDate(2),
      guestCount: 1
    })
  });
  assert.equal(invalidDates.response.status, 400);

  const overCapacity = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({
      guestId,
      roomId,
      checkIn: futureDate(3),
      checkOut: futureDate(4),
      guestCount: 3
    })
  });
  assert.equal(overCapacity.response.status, 400);
});

test('requires a replayable idempotency key and reconciles repeated submissions', async () => {
  const payload = {
    guestId,
    roomId,
    checkIn: futureDate(20),
    checkOut: futureDate(22),
    guestCount: 1
  };
  const key = randomUUID();
  const first = await requestJson('/api/reservations', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify(payload)
  });
  assert.equal(first.response.status, 201);

  const replay = await requestJson('/api/reservations', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify(payload)
  });
  assert.equal(replay.response.status, 201);
  assert.equal(replay.data.reservation.id, first.data.reservation.id);

  const changedReplay = await requestJson('/api/reservations', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ ...payload, guestCount: 2 })
  });
  assert.equal(changedReplay.response.status, 409);
  const reconciled = await requestJson(`/api/reservations/idempotency/${key}`);
  assert.equal(reconciled.response.status, 200);
  assert.equal(reconciled.data.reservation.id, first.data.reservation.id);

  const missingKey = await fetch(`${baseUrl}/api/reservations`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      checkIn: futureDate(24),
      checkOut: futureDate(26)
    })
  });
  assert.equal(missingKey.status, 400);
});

test('serializes competing in-memory requests and permits adjacent stays', async () => {
  const checkIn = futureDate(30);
  const checkOut = futureDate(32);
  const payload = { guestId, roomId, checkIn, checkOut, guestCount: 1 };
  const contenders = await Promise.all([
    requestJson('/api/reservations', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
    requestJson('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ ...payload, guestCount: 2 })
    })
  ]);
  assert.deepEqual(contenders.map(({ response }) => response.status).sort(), [201, 409]);
  const winner = contenders.find(({ response }) => response.status === 201).data.reservation;

  const adjacent = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({
      guestId,
      roomId,
      checkIn: checkOut,
      checkOut: futureDate(33),
      guestCount: 1
    })
  });
  assert.equal(adjacent.response.status, 201);
  await requestJson(`/api/reservations/${winner.id}/cancel`, { method: 'POST' });
  await requestJson(`/api/reservations/${adjacent.data.reservation.id}/cancel`, { method: 'POST' });
});

test('covers calendar, required references, and integer guest-count boundaries', async () => {
  const checkIn = futureDate(40);
  const checkOut = futureDate(41);
  const base = { guestId, roomId, checkIn, checkOut, guestCount: 1 };
  for (const payload of [
    { ...base, checkIn: '2027-02-30' },
    { ...base, checkIn: 'no-es-fecha' },
    { ...base, checkIn: hotelToday(new Date(Date.now() - 86400000)) },
    { ...base, guestId: '' },
    { ...base, roomId: '' },
    { ...base, checkIn: '' },
    { ...base, checkOut: '' },
    { ...base, guestCount: 0 },
    { ...base, guestCount: 1.5 },
    { ...base, guestCount: 13 }
  ]) {
    const result = await requestJson('/api/reservations', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    assert.equal(result.response.status, 400, JSON.stringify(payload));
  }

  const largeRoom = await requestJson('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      number: 'RES-12TEST',
      type: 'FAMILIAR',
      capacity: 12,
      rate: 200000,
      status: 'DISPONIBLE',
      description: ''
    })
  });
  assert.equal(largeRoom.response.status, 201);
  const maximum = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({ ...base, roomId: largeRoom.data.room.id, guestCount: 12 })
  });
  assert.equal(maximum.response.status, 201);
  await requestJson(`/api/reservations/${maximum.data.reservation.id}/cancel`, { method: 'POST' });
  await requestJson(`/api/rooms/${largeRoom.data.room.id}`, { method: 'DELETE' });

  const todayStay = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({
      guestId,
      roomId,
      checkIn: hotelToday(),
      checkOut: futureDate(1),
      guestCount: 1
    })
  });
  assert.equal(todayStay.response.status, 201);
  await requestJson(`/api/reservations/${todayStay.data.reservation.id}/cancel`, { method: 'POST' });
});

test('distinguishes missing guests, missing rooms, and inoperable rooms', async () => {
  const base = {
    guestId,
    roomId,
    checkIn: futureDate(50),
    checkOut: futureDate(51),
    guestCount: 1
  };
  const noGuest = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({ ...base, guestId: randomUUID() })
  });
  assert.equal(noGuest.response.status, 404);

  const noRoom = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({ ...base, roomId: randomUUID() })
  });
  assert.equal(noRoom.response.status, 404);

  const unavailableRoom = await requestJson('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      number: 'RES-MAINT',
      type: 'DOBLE',
      capacity: 2,
      rate: 200000,
      status: 'MANTENIMIENTO',
      description: ''
    })
  });
  assert.equal(unavailableRoom.response.status, 201);
  const nonOperational = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({ ...base, roomId: unavailableRoom.data.room.id })
  });
  assert.equal(nonOperational.response.status, 409);
  await requestJson(`/api/rooms/${unavailableRoom.data.room.id}`, { method: 'DELETE' });
});

test('RTF4: malformed identifiers return controlled 400/404 responses', async () => {
  const badGuest = await fetch(`${baseUrl}/api/reservations`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ guestId: 'abc', roomId, checkIn: futureDate(70), checkOut: futureDate(71), guestCount: 1 })
  });
  assert.equal(badGuest.status, 400);
  for (const path of ['/api/reservations/no-es-un-id', '/api/guests/no-es-un-id', '/api/rooms/no-es-un-id']) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { cookie } });
    assert.equal(response.status, 404, path);
  }
  const cancel = await fetch(`${baseUrl}/api/reservations/no-es-un-id/cancel`, { method: 'POST', headers: { cookie } });
  assert.equal(cancel.status, 404);
});
