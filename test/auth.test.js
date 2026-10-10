const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../main');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('rejects dashboard API requests without a JWT', async () => {
  const response = await fetch(`${baseUrl}/api/dashboard/summary`);
  assert.equal(response.status, 401);
});

test('renders the login view and serves its module stylesheet', async () => {
  const pageResponse = await fetch(`${baseUrl}/login`);
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /Iniciar sesión/);
  assert.match(page, /\/css\/auth\.css/);

  const stylesheetResponse = await fetch(`${baseUrl}/css/auth.css`);
  assert.equal(stylesheetResponse.status, 200);
  assert.match(stylesheetResponse.headers.get('content-type'), /text\/css/);
});

test('redirects unauthenticated page requests to login', async () => {
  const response = await fetch(`${baseUrl}/dashboard`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/login');
});

test('rejects an incorrect administrator password', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'incorrecta' })
  });
  assert.equal(response.status, 401);
});

test('authenticates the administrator and returns only temporary dashboard data', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });

  assert.equal(loginResponse.status, 200);
  assert.match(loginResponse.headers.get('set-cookie'), /HttpOnly/i);
  const { user } = await loginResponse.json();
  assert.deepEqual(user, {
    id: 'user-admin',
    username: 'admin',
    name: 'Administrador',
    role: 'admin'
  });

  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const pageResponse = await fetch(`${baseUrl}/dashboard`, {
    headers: { cookie }
  });
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /Panel general/);

  const currentUserResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie }
  });
  assert.equal(currentUserResponse.status, 200);
  assert.equal((await currentUserResponse.json()).user.username, 'admin');

  const dashboardResponse = await fetch(`${baseUrl}/api/dashboard/summary`, {
    headers: { cookie }
  });
  assert.equal(dashboardResponse.status, 200);
  assert.deepEqual(await dashboardResponse.json(), {
    summary: {
      reservationsToday: 0,
      pendingReservations: 0,
      occupiedRooms: 0,
      pendingPayments: 0,
      recordedIncome: 0,
      recentActivity: [],
      totalRooms: 0,
      availableRooms: 0,
      cleaningRooms: 0,
      maintenanceRooms: 0,
      outOfServiceRooms: 0
    }
  });

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie }
  });
  assert.equal(logoutResponse.status, 204);
});
