const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const app = require('../main');

let server;
let baseUrl;
let cookie;
let guestId;
let roomId;
let reservationId;

function futureDate(daysFromNow) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      cookie,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const data = response.status === 204 ? null : await response.json();
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
  if (reservationId) {
    await requestJson(`/api/reservations/${reservationId}/cancel`, { method: 'POST' });
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
  const dashboard = await requestJson('/api/dashboard/summary');
  assert.equal(dashboard.data.summary.pendingReservations, 1);

  const overlap = await requestJson('/api/reservations', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  assert.equal(overlap.response.status, 409);

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
