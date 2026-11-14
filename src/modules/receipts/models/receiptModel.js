const { randomUUID } = require('node:crypto');
const sql = require('mssql');
const database = require('../../../database');
const reservationModel = require('../../reservations/models/reservationModel');

const testMode = process.env.NODE_ENV === 'test';
const charges = new Map();
const payments = new Map();
const requestKeys = new Map();

function mapEntry(row, dateField) {
  return {
    id: row.id,
    description: row.description,
    amount: String(row.amount),
    createdAt: row[dateField] instanceof Date
      ? row[dateField].toISOString()
      : row[dateField]
  };
}

function modelError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function dateText(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function nightsBetween(checkIn, checkOut) {
  return Math.round((Date.parse(`${dateText(checkOut)}T00:00:00Z`) -
    Date.parse(`${dateText(checkIn)}T00:00:00Z`)) / 86400000);
}

async function findFinancials(reservationId) {
  if (!testMode) {
    const [chargeResult, paymentResult] = await Promise.all([
      database.query(
        `SELECT id, description, amount, created_at AS createdAt
         FROM dbo.ReservationCharges
         WHERE reservation_id = @reservationId
         ORDER BY created_at, id`,
        { reservationId }
      ),
      database.query(
        `SELECT id, description, amount, received_at AS createdAt
         FROM dbo.ReservationPayments
         WHERE reservation_id = @reservationId
         ORDER BY received_at, id`,
        { reservationId }
      )
    ]);
    return {
      charges: chargeResult.recordset.map((row) => mapEntry(row, 'createdAt')),
      payments: paymentResult.recordset.map((row) => mapEntry(row, 'createdAt'))
    };
  }

  return {
    charges: (charges.get(reservationId) || []).map((entry) => ({ ...entry })),
    payments: (payments.get(reservationId) || []).map((entry) => ({ ...entry }))
  };
}

// Reglas comunes para registrar un movimiento:
// - la reserva debe existir y no estar cancelada;
// - un anticipo no puede superar el saldo pendiente.
function validateEntry(kind, reservation, entry, totals) {
  if (!reservation) throw modelError('No se encontró la reserva solicitada.', 'RESERVATION_NOT_FOUND');
  if (reservation.status === 'CANCELLED') {
    throw modelError('La reserva está cancelada; no admite consumos ni anticipos.', 'RESERVATION_CANCELLED');
  }
  if (kind === 'payment') {
    const balance = nightsBetween(reservation.checkIn, reservation.checkOut) * Number(reservation.rate) +
      totals.charges - totals.payments;
    if (entry.amount > balance) {
      throw modelError(
        `El anticipo supera el saldo pendiente ($ ${balance.toLocaleString('es-CO')} COP).`,
        'PAYMENT_EXCEEDS_BALANCE'
      );
    }
  }
}

// Una misma clave de solicitud con los mismos datos es un reintento; con
// datos distintos es un error del cliente.
function sameRequest(existing, reservationId, entry) {
  return String(existing.reservationId).toLowerCase() === String(reservationId).toLowerCase() &&
    Number(existing.amount) === Number(entry.amount) && existing.description === entry.description;
}

async function addEntry(kind, reservationId, entry, requestKey) {
  const id = randomUUID();
  const tableName = kind === 'charge' ? 'ReservationCharges' : 'ReservationPayments';
  if (!testMode) {
    return database.withTransaction(async (query) => {
      // UPDLOCK sobre la reserva serializa los movimientos de una misma reserva.
      const reservation = (await query(
        `SELECT id, status, check_in AS checkIn, check_out AS checkOut, rate_per_night AS rate
         FROM dbo.Reservations WITH (UPDLOCK, HOLDLOCK)
         WHERE id = @reservationId`,
        { reservationId }
      )).recordset[0];
      if (requestKey) {
        const existing = (await query(
          `SELECT id, reservation_id AS reservationId, description, amount
           FROM dbo.${tableName} WITH (UPDLOCK, HOLDLOCK)
           WHERE request_key = @requestKey`,
          { requestKey }
        )).recordset[0];
        if (existing) {
          if (!sameRequest(existing, reservationId, entry)) {
            throw modelError('La clave de solicitud ya se utilizó con otros datos.', 'IDEMPOTENCY_CONFLICT');
          }
          return { duplicate: true };
        }
      }
      const totals = (await query(
        `SELECT
           (SELECT COALESCE(SUM(amount), 0) FROM dbo.ReservationCharges WHERE reservation_id = @reservationId) AS charges,
           (SELECT COALESCE(SUM(amount), 0) FROM dbo.ReservationPayments WHERE reservation_id = @reservationId) AS payments`,
        { reservationId }
      )).recordset[0];
      validateEntry(kind, reservation, entry, {
        charges: Number(totals.charges),
        payments: Number(totals.payments)
      });
      await query(
        `INSERT INTO dbo.${tableName}
          (id, reservation_id, description, amount, request_key)
         VALUES (@id, @reservationId, @description, @amount, @requestKey)`,
        {
          id,
          reservationId,
          description: entry.description,
          amount: { type: sql.Decimal(12, 0), value: entry.amount },
          requestKey: { type: sql.VarChar(100), value: requestKey || null }
        }
      );
      return { duplicate: false };
    });
  }

  const reservation = await reservationModel.findById(reservationId);
  const keyName = `${kind}:${requestKey}`;
  if (requestKey && requestKeys.has(keyName)) {
    if (!sameRequest(requestKeys.get(keyName), reservationId, entry)) {
      throw modelError('La clave de solicitud ya se utilizó con otros datos.', 'IDEMPOTENCY_CONFLICT');
    }
    return { duplicate: true };
  }
  const collection = kind === 'charge' ? charges : payments;
  const sum = (map) => (map.get(reservationId) || []).reduce((total, item) => total + Number(item.amount), 0);
  validateEntry(kind, reservation && { ...reservation, rate: reservation.ratePerNight }, entry, {
    charges: sum(charges),
    payments: sum(payments)
  });
  const record = {
    id,
    description: entry.description,
    amount: String(entry.amount),
    createdAt: new Date().toISOString()
  };
  const records = collection.get(reservationId) || [];
  records.push(record);
  collection.set(reservationId, records);
  if (requestKey) requestKeys.set(keyName, { reservationId, ...entry });
  return { duplicate: false };
}

async function addCharge(reservationId, entry, requestKey) {
  return addEntry('charge', reservationId, entry, requestKey);
}

async function addPayment(reservationId, entry, requestKey) {
  return addEntry('payment', reservationId, entry, requestKey);
}

module.exports = { findFinancials, addCharge, addPayment };
