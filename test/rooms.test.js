const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../main');

let server;
let baseUrl;
let cookie;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('provides an authenticated temporary room CRUD workflow', async () => {
  const unauthenticated = await fetch(`${baseUrl}/api/rooms`);
  assert.equal(unauthenticated.status, 401);

  const pageResponse = await fetch(`${baseUrl}/rooms`, { headers: { cookie } });
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /Inventario de habitaciones/);
  assert.match(page, /\/css\/rooms\.css/);

  const stylesheetResponse = await fetch(`${baseUrl}/css/rooms.css`);
  assert.equal(stylesheetResponse.status, 200);
  assert.match(stylesheetResponse.headers.get('content-type'), /text\/css/);

  const invalidResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ number: '101', type: 'DOBLE', capacity: 0, rate: 150000 })
  });
  assert.equal(invalidResponse.status, 400);

  const firstResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      number: 'a101',
      type: 'doble',
      capacity: 2,
      rate: 180000,
      description: 'Balcón'
    })
  });
  assert.equal(firstResponse.status, 201);
  const firstRoom = (await firstResponse.json()).room;
  assert.equal(firstRoom.number, 'A101');
  assert.equal(firstRoom.status, 'DISPONIBLE');

  const duplicateResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ number: 'A101', type: 'SUITE', capacity: 2, rate: 200000 })
  });
  assert.equal(duplicateResponse.status, 409);

  const secondResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      number: '102',
      type: 'ESTANDAR',
      capacity: 1,
      rate: 120000,
      status: 'EN_LIMPIEZA'
    })
  });
  assert.equal(secondResponse.status, 201);
  const secondRoom = (await secondResponse.json()).room;

  const filteredResponse = await fetch(`${baseUrl}/api/rooms?status=EN_LIMPIEZA`, {
    headers: { cookie }
  });
  assert.deepEqual(
    (await filteredResponse.json()).rooms.map((room) => room.id),
    [secondRoom.id]
  );

  const searchedResponse = await fetch(`${baseUrl}/api/rooms?search=balc`, {
    headers: { cookie }
  });
  assert.deepEqual(
    (await searchedResponse.json()).rooms.map((room) => room.id),
    [firstRoom.id]
  );

  const invalidFilterResponse = await fetch(`${baseUrl}/api/rooms?status=OCUPADA`, {
    headers: { cookie }
  });
  assert.equal(invalidFilterResponse.status, 400);

  const updateResponse = await fetch(`${baseUrl}/api/rooms/${firstRoom.id}`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      number: '103',
      type: 'FAMILIAR',
      capacity: 4,
      rate: 250000,
      status: 'MANTENIMIENTO'
    })
  });
  assert.equal(updateResponse.status, 200);
  const updatedRoom = (await updateResponse.json()).room;
  assert.equal(updatedRoom.number, '103');
  assert.equal(updatedRoom.capacity, 4);
  assert.equal(updatedRoom.status, 'MANTENIMIENTO');

  const summaryResponse = await fetch(`${baseUrl}/api/dashboard/summary`, { headers: { cookie } });
  const summary = (await summaryResponse.json()).summary;
  assert.equal(summary.totalRooms, 2);
  assert.equal(summary.availableRooms, 0);
  assert.equal(summary.cleaningRooms, 1);
  assert.equal(summary.maintenanceRooms, 1);

  const deleteResponse = await fetch(`${baseUrl}/api/rooms/${firstRoom.id}`, {
    method: 'DELETE',
    headers: { cookie }
  });
  assert.equal(deleteResponse.status, 204);

  const missingResponse = await fetch(`${baseUrl}/api/rooms/${firstRoom.id}`, { headers: { cookie } });
  assert.equal(missingResponse.status, 404);

  const deleteSecondResponse = await fetch(`${baseUrl}/api/rooms/${secondRoom.id}`, {
    method: 'DELETE',
    headers: { cookie }
  });
  assert.equal(deleteSecondResponse.status, 204);

  const emptySummaryResponse = await fetch(`${baseUrl}/api/dashboard/summary`, { headers: { cookie } });
  assert.equal((await emptySummaryResponse.json()).summary.totalRooms, 0);
});
