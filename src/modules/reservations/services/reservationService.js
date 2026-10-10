const guestModel = require('../../guests/models/guestModel');
const roomModel = require('../../rooms/models/roomModel');
const reservationModel = require('../models/reservationModel');
const { searchAvailability } = require('../../availability/services/availabilityService');
const { isValidCalendarDate } = require('../../availability/services/availabilityService');

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
  if (!isValidCalendarDate(checkIn) || !isValidCalendarDate(checkOut)) {
    throw new ReservationError('Ingresa fechas válidas de entrada y salida.', 400);
  }
  const today = new Date().toISOString().slice(0, 10);
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
  const reservation = await reservationModel.findById(id);
  if (!reservation) throw new ReservationError('No se encontró la reserva.', 404);
  return reservation;
}

async function createReservation(input) {
  const data = normalizeReservation(input);
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
    return await reservationModel.create(data);
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
    throw error;
  }
}

async function updateReservationStatus(id, nextStatus) {
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
  createReservation,
  updateReservationStatus,
  cancelReservation,
  getOptions,
  availableRooms
};
