const sql = require('mssql');

let poolPromise;

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
  for (const [name, value] of Object.entries(parameters)) {
    request.input(name, value);
  }
  return request.query(statement);
}

async function withTransaction(callback, isolationLevel = sql.ISOLATION_LEVEL.SERIALIZABLE) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(isolationLevel);

  const transactionQuery = async (statement, parameters = {}) => {
    const request = transaction.request();
    for (const [name, value] of Object.entries(parameters)) {
      request.input(name, value);
    }
    return request.query(statement);
  };

  try {
    const result = await callback(transactionQuery);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
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

module.exports = { query, withTransaction, checkConnection, closePool };
