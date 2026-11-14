const { createHash } = require('node:crypto');
const guestModel = require('../../guests/models/guestModel');
const roomModel = require('../../rooms/models/roomModel');
const reservationModel = require('../models/reservationModel');
const { searchAvailability } = require('../../availability/services/availabilityService');
const { isValidCalendarDate } = require('../../availability/services/availabilityService');
const { hotelToday } = require('../../../hotelDate');
const { isUuid, isRequestKey } = require('../../../validation');

const reservationStatuses = [
  'PENDING_DEPOSIT',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
];
const allowedTransitions = {
  PENDING_DEPOSIT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  IN_PROGRESS: [],
  COMPLETED: [],
  CANCELLED: []
};

class ReservationError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ReservationError';
    this.statusCode = statusCode;
    // Para errores 5xx el manejador global muestra este texto controlado.
    if (statusCode >= 500) this.publicMessage = message;
  }
}

function normalizeReservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ReservationError('Los datos de la reserva no son válidos.', 400);
  }

  const { guestId, roomId, checkIn, checkOut } = input;
  const guestCount = Number(input.guestCount);
  if (typeof guestId !== 'string' || !guestId.trim() ||
      typeof roomId !== 'string' || !roomId.trim()) {
    throw new ReservationError('Selecciona un huésped y una habitación.', 400);
  }
  if (!isUuid(guestId) || !isUuid(roomId)) {
    throw new ReservationError('El huésped o la habitación seleccionada no tiene un identificador válido.', 400);
  }
  if (!isValidCalendarDate(checkIn) || !isValidCalendarDate(checkOut)) {
    throw new ReservationError('Ingresa fechas válidas de entrada y salida.', 400);
  }
  const today = hotelToday();
  if (checkIn < today) {
    throw new ReservationError('La fecha de entrada no puede ser anterior a hoy.', 400);
  }
  if (checkOut <= checkIn) {
    throw new ReservationError('La fecha de salida debe ser posterior a la entrada.', 400);
  }
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 12) {
    throw new ReservationError('El número de huéspedes debe estar entre 1 y 12.', 400);
  }

  return { guestId: guestId.trim(), roomId: roomId.trim(), checkIn, checkOut, guestCount };
}

async function listReservations(filters = {}) {
  const status = typeof filters.status === 'string' ? filters.status.trim().toUpperCase() : '';
  if (status && !reservationStatuses.includes(status)) {
    throw new ReservationError('El estado de reserva seleccionado no es válido.', 400);
  }
  return reservationModel.list({ status });
}

async function getReservation(id) {
  if (!isUuid(id)) throw new ReservationError('No se encontró la reserva.', 404);
  const reservation = await reservationModel.findById(id);
  if (!reservation) throw new ReservationError('No se encontró la reserva.', 404);
  return reservation;
}

async function getReservationByRequestKey(key) {
  if (!isRequestKey(key)) {
    throw new ReservationError('La clave de solicitud no es válida.', 400);
  }
  const record = await reservationModel.findIdempotent(key.trim());
  if (!record) throw new ReservationError('No se encontró una reserva para esa solicitud.', 404);
  return getReservation(record.reservationId);
}

function reservationFingerprint(data) {
  return createHash('sha256').update(JSON.stringify([
    data.guestId,
    data.roomId,
    data.checkIn,
    data.checkOut,
    data.guestCount
  ])).digest('hex');
}

async function createReservation(input, requestKey) {
  const data = normalizeReservation(input);
  const idempotencyKey = typeof requestKey === 'string' && requestKey.trim()
    ? requestKey.trim()
    : '';
  if (!isRequestKey(idempotencyKey)) {
    throw new ReservationError('La solicitud requiere una clave de idempotencia válida.', 400);
  }
  const fingerprint = reservationFingerprint(data);
  const previous = await reservationModel.findIdempotent(idempotencyKey);
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      throw new ReservationError('La clave de solicitud ya se utilizó con otros datos.', 409);
    }
    return getReservation(previous.reservationId);
  }
  const [guest, room] = await Promise.all([
    guestModel.findById(data.guestId),
    roomModel.findById(data.roomId)
  ]);
  if (!guest) throw new ReservationError('No se encontró el huésped seleccionado.', 404);
  if (!room) throw new ReservationError('No se encontró la habitación seleccionada.', 404);
  if (room.status !== 'DISPONIBLE') {
    throw new ReservationError('La habitación no está operativa para recibir una reserva.', 409);
  }
  if (room.capacity < data.guestCount) {
    throw new ReservationError('La habitación no tiene capacidad suficiente para ese grupo.', 400);
  }

  try {
    return await reservationModel.create(data, { idempotencyKey, fingerprint });
  } catch (error) {
    if (error.code === 'RESERVATION_OVERLAP') {
      throw new ReservationError(error.message, 409);
    }
    if (error.code === 'ROOM_UNAVAILABLE') {
      throw new ReservationError(error.message, 409);
    }
    if (error.code === 'GUEST_NOT_FOUND') {
      throw new ReservationError(error.message, 404);
    }
    if (error.code === 'IDEMPOTENCY_CONFLICT') {
      throw new ReservationError(error.message, 409);
    }
    if (error.code === 'RESERVATION_UNIQUE_CONFLICT' ||
        error.code === 'RESERVATION_REFERENCE_CONFLICT') {
      throw new ReservationError(error.message, 409);
    }
    if (error.code === 'RESERVATION_NOT_SAVED') {
      throw new ReservationError(
        'No se guardó la reserva por un error técnico. Puedes intentarlo de nuevo.',
        500
      );
    }
    if (error.code === 'RESERVATION_RESULT_UNAVAILABLE') {
      throw new ReservationError(
        'La solicitud se procesó, pero no se pudo confirmar su resultado. Consulta las reservas antes de reintentar.',
        503
      );
    }
    throw error;
  }
}

async function updateReservationStatus(id, nextStatus) {
  if (!isUuid(id)) throw new ReservationError('No se encontró la reserva.', 404);
  const reservation = await reservationModel.findById(id);
  if (!reservation) throw new ReservationError('No se encontró la reserva.', 404);
  if (!reservationStatuses.includes(nextStatus)) {
    throw new ReservationError('El estado de reserva solicitado no es válido.', 400);
  }
  if (!allowedTransitions[reservation.status].includes(nextStatus)) {
    throw new ReservationError(
      `No se puede cambiar una reserva de ${reservation.status} a ${nextStatus}.`,
      409
    );
  }
  try {
    return await reservationModel.updateStatus(id, nextStatus, reservation.status);
  } catch (error) {
    if (error.code === 'RESERVATION_STATE_CHANGED') {
      throw new ReservationError(error.message, 409);
    }
    throw error;
  }
}

async function cancelReservation(id) {
  if (!isUuid(id)) throw new ReservationError('No se encontró la reserva.', 404);
  const reservation = await reservationModel.findById(id);
  if (!reservation) throw new ReservationError('No se encontró la reserva.', 404);
  return updateReservationStatus(id, 'CANCELLED');
}

async function getOptions() {
  const [guests, rooms] = await Promise.all([
    guestModel.list(),
    roomModel.list({ status: 'DISPONIBLE' })
  ]);
  return {
    guests,
    rooms: rooms.map(({ id, number, type, capacity, rate }) => ({ id, number, type, capacity, rate }))
  };
}

async function availableRooms(criteria) {
  return searchAvailability(criteria);
}

module.exports = {
  ReservationError,
  reservationStatuses,
  listReservations,
  getReservation,
  getReservationByRequestKey,
  createReservation,
  updateReservationStatus,
  cancelReservation,
  getOptions,
  availableRooms
};
