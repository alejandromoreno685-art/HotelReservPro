const path = require('node:path');
// Las variables del perfil de pruebas se cargan primero para que .env no las sustituya.
require('dotenv').config({ path: path.join(__dirname, '..', '.env.rtf4.local'), quiet: true });
require('dotenv').config({ quiet: true });

const { randomBytes, scryptSync } = require('node:crypto');
const database = require('../src/database');

const expectedDatabase = 'HotelReservePro_Test';
const testEnabled = process.env.RTF4_SQLSERVER_TEST === '1' &&
  process.env.NODE_ENV === 'rtf4-integration' &&
  process.env.DB_NAME === expectedDatabase;

const guests = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    name: 'Huésped RTF4 Uno',
    document: 'RTF4GUEST01',
    email: 'rtf4-uno@example.test'
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    name: 'Huésped RTF4 Dos',
    document: 'RTF4GUEST02',
    email: 'rtf4-dos@example.test'
  }
];

const rooms = [
  { id: '22222222-2222-4222-8222-222222222201', number: 'RTF4-1', capacity: 2, rate: 200000, status: 'DISPONIBLE' },
  { id: '22222222-2222-4222-8222-222222222202', number: 'RTF4-2', capacity: 4, rate: 220000, status: 'DISPONIBLE' },
  { id: '22222222-2222-4222-8222-222222222203', number: 'RTF4-3', capacity: 2, rate: 180000, status: 'MANTENIMIENTO' },
  { id: '22222222-2222-4222-8222-222222222204', number: 'RTF4-4', capacity: 12, rate: 300000, status: 'DISPONIBLE' }
];

function credentials() {
  const configured = [
    ['rtf4-admin', 'Administrador RTF4', 'ADMIN', process.env.RTF4_ADMIN_PASSWORD],
    ['rtf4-recepcion', 'Recepción RTF4', 'RECEPTIONIST', process.env.RTF4_RECEPTION_PASSWORD],
    ['rtf4-consulta', 'Consulta RTF4', 'CONSULTA', process.env.RTF4_CONSULTA_PASSWORD]
  ];
  if (configured.some(([, , , password]) => typeof password !== 'string' || password.length < 12)) {
    throw new Error('Configura tres contraseñas de prueba con al menos 12 caracteres.');
  }
  return configured;
}

async function seedUser(username, displayName, role, password) {
  const existing = await database.query(
    'SELECT id FROM dbo.Users WHERE username = @username',
    { username }
  );
  if (existing.recordset.length) return;
  const salt = randomBytes(16);
  const passwordHash = scryptSync(password, salt, 64);
  await database.query(
    `INSERT INTO dbo.Users
      (id, username, display_name, password_salt, password_hash, role, active)
     VALUES (NEWID(), @username, @displayName, @salt, @passwordHash, @role, 1)`,
    { username, displayName, salt, passwordHash, role }
  );
}

async function seedGuest(guest) {
  await database.query(
    `IF NOT EXISTS (SELECT 1 FROM dbo.Guests WHERE id = @id)
     INSERT INTO dbo.Guests
       (id, full_name, document_type, document_number, phone, email, country, foreign_non_resident)
     VALUES (@id, @name, 'OTHER', @document, '3000000000', @email, 'Colombia', 0)`,
    guest
  );
}

async function seedRoom(room) {
  await database.query(
    `IF NOT EXISTS (SELECT 1 FROM dbo.Rooms WHERE id = @id)
     INSERT INTO dbo.Rooms
       (id, room_number, room_type, capacity, rate, physical_status, description)
     VALUES (@id, @number, 'DOBLE', @capacity, @rate, @status, N'Habitación ficticia para RTF4')`,
    room
  );
}

async function main() {
  if (!testEnabled) {
    throw new Error('Seed bloqueado: habilita únicamente HotelReservePro_Test.');
  }
  await database.checkConnection();
  for (const user of credentials()) await seedUser(...user);
  for (const guest of guests) await seedGuest(guest);
  for (const room of rooms) await seedRoom(room);
  console.log('Fixtures ficticios RTF4 preparados en la base de pruebas exclusiva.');
}

main()
  .catch((error) => {
    console.error('No se pudo preparar el seed RTF4. Verifica el ambiente y el esquema.', error.code || error.number || 'sin código');
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.closePool();
  });
