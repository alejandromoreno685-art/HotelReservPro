const availabilityModel = require('../models/availabilityModel');
const { roomTypes } = require('../../rooms/services/roomService');

class AvailabilityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AvailabilityError';
    this.statusCode = 400;
  }
}

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function overlaps(checkIn, checkOut, existingCheckIn, existingCheckOut) {
  return checkIn < existingCheckOut && checkOut > existingCheckIn;
}

function normalizeCriteria(input) {
  const checkIn = input.checkIn;
  const checkOut = input.checkOut;
  if (!isValidCalendarDate(checkIn) || !isValidCalendarDate(checkOut)) {
    throw new AvailabilityError('Ingresa fechas válidas de entrada y salida.');
  }

  const today = new Date().toISOString().slice(0, 10);
  if (checkIn < today) {
    throw new AvailabilityError('La fecha de entrada no puede ser anterior a hoy.');
  }
  if (checkOut <= checkIn) {
    throw new AvailabilityError('La fecha de salida debe ser posterior a la entrada.');
  }

  const guestCount = Number(input.guestCount);
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 12) {
    throw new AvailabilityError('El número de huéspedes debe estar entre 1 y 12.');
  }

  const roomType = input.roomType ? String(input.roomType).trim().toUpperCase() : '';
  if (roomType && !roomTypes.includes(roomType)) {
    throw new AvailabilityError('El tipo de habitación seleccionado no es válido.');
  }

  return { checkIn, checkOut, guestCount, type: roomType || undefined };
}

async function searchAvailability(input) {
  const criteria = normalizeCriteria(input);
  const rooms = await availabilityModel.findAvailableRooms(criteria);
  return { criteria, rooms };
}

module.exports = {
  AvailabilityError,
  isValidCalendarDate,
  overlaps,
  normalizeCriteria,
  searchAvailability
};
