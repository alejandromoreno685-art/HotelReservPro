const sql = require('mssql');

let poolPromise;

// Puntos de fallo de laboratorio. Solo se activan en el perfil de pruebas
// exclusivo (ver triggerTestFailpoint); nunca en desarrollo ni producción.
const supportedFailpoints = [
  'transaction.begin',
  'transaction.after-commit',
  'transaction.after-rollback',
  'reservation.after-insert',
  'reservation.duplicate-request-2627',
  'reservation.skip-overlap-check',
  'reservation.invalid-guest-fk',
  'receipt.pdf'
];

function bindParameters(request, parameters) {
  for (const [name, value] of Object.entries(parameters)) {
    if (value && typeof value === 'object' && value.type && Object.hasOwn(value, 'value')) {
      request.input(name, value.type, value.value);
    } else {
      request.input(name, value);
    }
  }
}

function isFailpointActive(name) {
  const isDedicatedTestEnvironment = process.env.RTF4_SQLSERVER_TEST === '1' &&
    process.env.NODE_ENV === 'rtf4-integration' &&
    process.env.DB_NAME === 'HotelReservePro_Test';
  const activeFailpoints = (process.env.RTF4_TEST_FAILPOINT || '')
    .split(',')
    .map((point) => point.trim());
  return isDedicatedTestEnvironment && activeFailpoints.includes(name);
}

function triggerTestFailpoint(name) {
  if (isFailpointActive(name)) {
    const error = new Error(`Controlled RTF4 failure at ${name}.`);
    error.code = 'RTF4_TEST_FAILPOINT';
    throw error;
  }
}

function getPool() {
  if (!poolPromise) {
    const server = process.env.DB_SERVER;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME || 'HotelReservePro';

    if (!server || !user || !password) {
      throw new Error('Configura DB_SERVER, DB_USER y DB_PASSWORD en el archivo .env.');
    }

    const pool = new sql.ConnectionPool({
      server,
      ...(process.env.DB_PORT ? { port: Number(process.env.DB_PORT) } : {}),
      user,
      password,
      database,
      connectionTimeout: 15000,
      requestTimeout: 15000,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
        ...(process.env.DB_INSTANCE ? { instanceName: process.env.DB_INSTANCE } : {})
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    });

    poolPromise = pool.connect().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }

  return poolPromise;
}

async function query(statement, parameters = {}) {
  const pool = await getPool();
  const request = pool.request();
  bindParameters(request, parameters);
  return request.query(statement);
}

async function withTransaction(callback, isolationLevel = sql.ISOLATION_LEVEL.SERIALIZABLE) {
  let phase = 'connect';
  let pool;
  try {
    pool = await getPool();
  } catch (error) {
    error.transactionPhase = phase;
    throw error;
  }
  const transaction = new sql.Transaction(pool);
  let began = false;
  let committed = false;
  try {
    phase = 'begin';
    triggerTestFailpoint('transaction.begin');
    await transaction.begin(isolationLevel);
    began = true;
    phase = 'execute';
    const transactionQuery = async (statement, parameters = {}) => {
      const request = transaction.request();
      bindParameters(request, parameters);
      return request.query(statement);
    };

    const result = await callback(transactionQuery);
    phase = 'commit';
    await transaction.commit();
    committed = true;
    phase = 'after-commit';
    triggerTestFailpoint('transaction.after-commit');
    return result;
  } catch (error) {
    // connect/begin/execute: la transacción no se confirmó.
    // commit: resultado incierto. after-commit: los datos sí quedaron guardados.
    error.transactionPhase = phase;
    if (began && !committed) {
      try {
        await transaction.rollback();
        triggerTestFailpoint('transaction.after-rollback');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  }
}

function failpoint(name) {
  triggerTestFailpoint(name);
}

async function checkConnection() {
  await query('SELECT 1 AS connected');
}

async function closePool() {
  if (poolPromise) {
    const currentPool = poolPromise;
    poolPromise = null;
    const pool = await currentPool;
    await pool.close();
  }
}

module.exports = {
  query,
  withTransaction,
  checkConnection,
  closePool,
  failpoint,
  isFailpointActive,
  supportedFailpoints
};
