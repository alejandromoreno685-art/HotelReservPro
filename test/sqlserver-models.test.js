const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, scryptSync } = require('node:crypto');

process.env.NODE_ENV = 'development';

const database = require('../src/database');
const roomModel = require('../src/modules/rooms/models/roomModel');
const guestModel = require('../src/modules/guests/models/guestModel');
const userStore = require('../src/modules/auth/models/userStore');

const calls = [];
const salt = randomBytes(16);
const passwordHash = scryptSync('my-test-password', salt, 64);
const originalQuery = database.query;

database.query = async (statement, parameters) => {
  calls.push({ statement, parameters });
  if (statement.includes('FROM dbo.Rooms')) {
    return {
      recordset: [{
        id: '7f3d90ba-2759-4dc2-a159-c998482032f1',
        number: '101',
        type: 'DOBLE',
        capacity: 2,
        rate: 180000,
        status: 'DISPONIBLE',
        description: 'Balcón',
        createdAt: new Date('2026-10-10T12:00:00.000Z'),
        updatedAt: new Date('2026-10-10T12:00:00.000Z')
      }]
    };
  }
  if (statement.includes('FROM dbo.Guests')) {
    return {
      recordset: [{
        id: 'guest-1',
        fullName: 'Ana Pérez',
        documentType: 'CC',
        documentNumber: '12345',
        phone: '3001234567',
        email: 'ana@example.com',
        country: 'Colombia',
        foreignNonResident: false,
        createdAt: new Date('2026-10-10T12:00:00.000Z'),
        updatedAt: new Date('2026-10-10T12:00:00.000Z')
      }]
    };
  }
  if (statement.includes('FROM dbo.Users')) {
    return {
      recordset: [{
        id: 'user-1',
        username: 'admin',
        display_name: 'Administrador',
        password_salt: salt,
        password_hash: passwordHash,
        role: 'ADMIN',
        active: true,
        failed_login_attempts: 0,
        locked_until: null
      }]
    };
  }
  return { rowsAffected: [1], recordset: [] };
};

after(() => {
  database.query = originalQuery;
});

test('uses parameterized SQL Server queries for availability intervals', async () => {
  const rooms = await roomModel.findAvailable({
    checkIn: '2028-05-10',
    checkOut: '2028-05-12',
    guestCount: 2,
    type: 'DOBLE'
  });

  assert.equal(rooms[0].rate, 180000);
  const call = calls.at(-1);
  assert.match(call.statement, /res\.check_in < @checkOut/);
  assert.match(call.statement, /res\.check_out > @checkIn/);
  assert.deepEqual(call.parameters, {
    guestCount: 2,
    checkOut: '2028-05-12',
    checkIn: '2028-05-10',
    type: 'DOBLE'
  });
});

test('maps guest rows and binds search values in SQL Server', async () => {
  const guests = await guestModel.list({ search: 'ana' });

  assert.equal(guests[0].fullName, 'Ana Pérez');
  assert.equal(guests[0].foreignNonResident, false);
  const call = calls.at(-1);
  assert.match(call.statement, /email LIKE @search/);
  assert.deepEqual(call.parameters, { search: '%ana%' });
});

test('loads and verifies administrator password hashes from SQL Server', async () => {
  const user = await userStore.findByUsername('admin');

  assert.equal(user.role, 'ADMIN');
  assert.equal(userStore.verifyPassword(user, 'my-test-password'), true);
  assert.equal(userStore.verifyPassword(user, 'wrong-password'), false);
  assert.match(calls.at(-1).statement, /FROM dbo\.Users/);
  assert.deepEqual(calls.at(-1).parameters, { username: 'admin' });
});
