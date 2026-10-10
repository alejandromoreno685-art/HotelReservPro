const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
const app = require('../main');

let server;
let baseUrl;
let cookie;

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

test('provides an authenticated guest CRUD with unique documents and explicit residency flag', async () => {
  const page = await fetch(`${baseUrl}/guests`, { headers: { cookie } });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /Directorio de huéspedes/);
  assert.match(html, /Extranjero no residente/);
  assert.match(html, /<small>Administrador<\/small>/);
  const stylesheet = await fetch(`${baseUrl}/css/guests.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /text\/css/);

  const guestData = {
    fullName: 'María Pérez',
    documentType: 'CC',
    documentNumber: '123456789',
    phone: '+57 300 123 4567',
    email: 'maria@example.com',
    country: 'Colombia',
    foreignNonResident: false
  };
  const invalid = await fetch(`${baseUrl}/api/guests`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ ...guestData, email: 'correo-invalido' })
  });
  assert.equal(invalid.status, 400);

  const createdResponse = await fetch(`${baseUrl}/api/guests`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(guestData)
  });
  assert.equal(createdResponse.status, 201);
  const guest = (await createdResponse.json()).guest;
  assert.equal(guest.documentNumber, '123456789');
  assert.equal(guest.foreignNonResident, false);

  const duplicateResponse = await fetch(`${baseUrl}/api/guests`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(guestData)
  });
  assert.equal(duplicateResponse.status, 409);

  const secondGuestResponse = await fetch(`${baseUrl}/api/guests`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      ...guestData,
      fullName: 'John Smith',
      documentType: 'PASSPORT',
      documentNumber: 'P-456789',
      email: 'john@example.com',
      country: 'United States',
      foreignNonResident: true
    })
  });
  assert.equal(secondGuestResponse.status, 201);
  const secondGuest = (await secondGuestResponse.json()).guest;
  assert.equal(secondGuest.foreignNonResident, true);

  const searchResponse = await fetch(`${baseUrl}/api/guests?search=123456`, { headers: { cookie } });
  assert.deepEqual((await searchResponse.json()).guests.map((item) => item.id), [guest.id]);

  const updateResponse = await fetch(`${baseUrl}/api/guests/${guest.id}`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ ...guestData, fullName: 'María Pérez Gómez', country: 'Colombia' })
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).guest.fullName, 'María Pérez Gómez');

  const deleteResponse = await fetch(`${baseUrl}/api/guests/${guest.id}`, {
    method: 'DELETE',
    headers: { cookie }
  });
  assert.equal(deleteResponse.status, 204);

  const missingResponse = await fetch(`${baseUrl}/api/guests/${guest.id}`, { headers: { cookie } });
  assert.equal(missingResponse.status, 404);

  const deleteSecondResponse = await fetch(`${baseUrl}/api/guests/${secondGuest.id}`, {
    method: 'DELETE',
    headers: { cookie }
  });
  assert.equal(deleteSecondResponse.status, 204);
});
