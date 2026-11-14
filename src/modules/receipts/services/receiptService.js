const reservationModel = require('../../reservations/models/reservationModel');
const receiptModel = require('../models/receiptModel');
const { isUuid, isRequestKey } = require('../../../validation');

const maxMoneyAmount = 999999999999;

class ReceiptError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ReceiptError';
    this.statusCode = statusCode;
    if (statusCode >= 500) this.publicMessage = message;
  }
}

function nightsBetween(checkIn, checkOut) {
  return (Date.parse(`${checkOut}T00:00:00.000Z`) -
    Date.parse(`${checkIn}T00:00:00.000Z`)) / 86400000;
}

function amountValue(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= maxMoneyAmount
    ? amount
    : null;
}

function normalizeEntry(input, isPayment) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ReceiptError('Ingresa un concepto y un valor válidos.', 400);
  }
  const amount = amountValue(input.amount);
  if (amount === null) {
    throw new ReceiptError('El valor debe ser un número entero de pesos mayor que cero.', 400);
  }
  const description = typeof input.description === 'string'
    ? input.description.trim()
    : (isPayment ? 'Anticipo' : '');
  if (!description || description.length > 160) {
    throw new ReceiptError('El concepto debe tener entre 1 y 160 caracteres.', 400);
  }
  return { amount, description };
}

function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (!/^-?\d+$/.test(String(value))) {
    throw new ReceiptError('Los valores persistidos del comprobante no son válidos.', 500);
  }
  return BigInt(value);
}

async function getReceipt(reservationId) {
  if (!isUuid(reservationId)) {
    throw new ReceiptError('No se encontró la reserva solicitada.', 404);
  }
  const reservation = await reservationModel.findById(reservationId);
  if (!reservation) throw new ReceiptError('No se encontró la reserva solicitada.', 404);

  const { charges, payments } = await receiptModel.findFinancials(reservationId);
  const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
  if (!Number.isInteger(nights) || nights < 1) {
    throw new ReceiptError('No se pudieron validar las fechas de la reserva.', 500);
  }
  const accommodation = BigInt(nights) * toBigInt(reservation.ratePerNight);
  const chargeTotal = charges.reduce((sum, item) => sum + toBigInt(item.amount), 0n);
  const paymentTotal = payments.reduce((sum, item) => sum + toBigInt(item.amount), 0n);
  const total = accommodation + chargeTotal;
  const balance = total - paymentTotal;

  return {
    receiptId: `CMP-${reservation.id}`,
    reservationId: reservation.id,
    status: reservation.status,
    issuedAt: new Date().toISOString(),
    guestName: reservation.guestName,
    documentType: reservation.documentType,
    documentNumber: reservation.documentNumber,
    roomNumber: reservation.roomNumber,
    roomType: reservation.roomType,
    checkIn: reservation.checkIn,
    checkOut: reservation.checkOut,
    nights,
    ratePerNight: String(reservation.ratePerNight),
    accommodation: accommodation.toString(),
    charges,
    chargeTotal: chargeTotal.toString(),
    payments,
    paymentTotal: paymentTotal.toString(),
    total: total.toString(),
    balance: balance.toString(),
    currency: 'COP',
    documentTypeLabel: 'Comprobante interno - no es factura electrónica'
  };
}

const entryErrors = {
  RESERVATION_NOT_FOUND: 404,
  RESERVATION_CANCELLED: 409,
  PAYMENT_EXCEEDS_BALANCE: 409,
  IDEMPOTENCY_CONFLICT: 409
};

async function addEntry(kind, reservationId, input, requestKey) {
  if (!isUuid(reservationId)) throw new ReceiptError('No se encontró la reserva solicitada.', 404);
  const entry = normalizeEntry(input, kind === 'payment');
  const key = typeof requestKey === 'string' && requestKey.trim() ? requestKey.trim() : null;
  if (key && !isRequestKey(key)) throw new ReceiptError('La clave de solicitud no es válida.', 400);
  let outcome;
  try {
    outcome = kind === 'charge'
      ? await receiptModel.addCharge(reservationId, entry, key)
      : await receiptModel.addPayment(reservationId, entry, key);
  } catch (error) {
    if (entryErrors[error.code]) throw new ReceiptError(error.message, entryErrors[error.code]);
    if (error.number === 547) {
      throw new ReceiptError(`La reserva cambió antes de registrar el ${kind === 'charge' ? 'consumo' : 'anticipo'}.`, 409);
    }
    if ([2601, 2627].includes(error.number)) {
      throw new ReceiptError('Ese movimiento ya fue registrado por otra solicitud.', 409);
    }
    throw error;
  }
  return { receipt: await getReceipt(reservationId), duplicate: outcome.duplicate };
}

const addCharge = (reservationId, input, requestKey) => addEntry('charge', reservationId, input, requestKey);
const addPayment = (reservationId, input, requestKey) => addEntry('payment', reservationId, input, requestKey);

module.exports = { ReceiptError, getReceipt, addCharge, addPayment };
