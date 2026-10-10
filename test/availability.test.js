const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
const app = require('../main');
const { isValidCalendarDate, overlaps } = require('../src/modules/availability/services/availabilityService');

let server;
let baseUrl;
let cookie;

function futureDate(daysFromNow) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
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
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('validates real calendar dates and uses half-open reservation interval overlap', () => {
  assert.equal(isValidCalendarDate('2028-02-29'), true);
  assert.equal(isValidCalendarDate('2027-02-29'), false);
  assert.equal(isValidCalendarDate('2028-13-01'), false);
  assert.equal(overlaps('2028-05-10', '2028-05-12', '2028-05-12', '2028-05-15'), false);
  assert.equal(overlaps('2028-05-12', '2028-05-15', '2028-05-10', '2028-05-12'), false);
  assert.equal(overlaps('2028-05-11', '2028-05-13', '2028-05-10', '2028-05-12'), true);
  assert.equal(overlaps('2028-05-10', '2028-05-12', '2028-05-11', '2028-05-13'), true);
});

test('returns matching operational rooms and rejects invalid date criteria', async () => {
  const page = await fetch(`${baseUrl}/availability`, { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Consultar disponibilidad/);
  const stylesheet = await fetch(`${baseUrl}/css/availability.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /text\/css/);

  const baseRoom = {
    type: 'SUITE',
    capacity: 3,
    rate: 250000,
    status: 'DISPONIBLE',
    description: ''
  };
  const roomIds = [];
  for (const [number, overrides] of [
    ['701', {}],
    ['702', { capacity: 2 }],
    ['703', { status: 'MANTENIMIENTO' }]
  ]) {
    const response = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ ...baseRoom, ...overrides, number })
    });
    assert.equal(response.status, 201);
    roomIds.push((await response.json()).room.id);
  }

  const checkIn = futureDate(5);
  const checkOut = futureDate(7);
  const query = new URLSearchParams({
    checkIn,
    checkOut,
    guestCount: '3',
    roomType: 'SUITE'
  });
  const resultResponse = await fetch(`${baseUrl}/api/availability?${query}`, { headers: { cookie } });
  assert.equal(resultResponse.status, 200);
  const result = await resultResponse.json();
  assert.deepEqual(result.rooms.map((room) => room.number), ['701']);

  const invalidDate = await fetch(
    `${baseUrl}/api/availability?checkIn=2028-02-30&checkOut=2028-03-01&guestCount=2`,
    { headers: { cookie } }
  );
  assert.equal(invalidDate.status, 400);

  const invalidRange = await fetch(
    `${baseUrl}/api/availability?checkIn=${checkOut}&checkOut=${checkIn}&guestCount=2`,
    { headers: { cookie } }
  );
  assert.equal(invalidRange.status, 400);

  const invalidGuests = await fetch(
    `${baseUrl}/api/availability?checkIn=${checkIn}&checkOut=${checkOut}&guestCount=13`,
    { headers: { cookie } }
  );
  assert.equal(invalidGuests.status, 400);

  for (const id of roomIds) {
    await fetch(`${baseUrl}/api/rooms/${id}`, { method: 'DELETE', headers: { cookie } });
  }
});
