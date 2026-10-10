const roomModel = require('../models/roomModel');

const roomTypes = ['ESTANDAR', 'DOBLE', 'FAMILIAR', 'SUITE'];
const roomStatuses = ['DISPONIBLE', 'EN_LIMPIEZA', 'MANTENIMIENTO', 'FUERA_DE_SERVICIO'];

class RoomError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'RoomError';
    this.statusCode = statusCode;
  }
}

function validateFilters(filters) {
  const normalized = {
    search: typeof filters.search === 'string' ? filters.search.trim() : '',
    type: typeof filters.type === 'string' ? filters.type.trim().toUpperCase() : '',
    status: typeof filters.status === 'string' ? filters.status.trim().toUpperCase() : ''
  };

  if (normalized.type && !roomTypes.includes(normalized.type)) {
    throw new RoomError('El tipo de habitación no es válido.', 400);
  }
  if (normalized.status && !roomStatuses.includes(normalized.status)) {
    throw new RoomError('El estado de habitación no es válido.', 400);
  }
  return normalized;
}

function normalizeRoom(input, existingRoom) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RoomError('Los datos de la habitación no son válidos.', 400);
  }

  const numberValue = input.number === undefined && existingRoom
    ? existingRoom.number
    : input.number;
  const number = typeof numberValue === 'string' ? numberValue.trim().toUpperCase() : '';
  if (!/^[A-Z0-9-]{1,12}$/.test(number)) {
    throw new RoomError('El número debe tener entre 1 y 12 caracteres alfanuméricos o guiones.', 400);
  }

  const typeValue = input.type === undefined && existingRoom ? existingRoom.type : input.type;
  const type = typeof typeValue === 'string' ? typeValue.trim().toUpperCase() : '';
  if (!roomTypes.includes(type)) {
    throw new RoomError('Selecciona un tipo de habitación válido.', 400);
  }

  const capacityValue = input.capacity === undefined && existingRoom
    ? existingRoom.capacity
    : input.capacity;
  const capacity = Number(capacityValue);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 12) {
    throw new RoomError('La capacidad debe ser un número entero entre 1 y 12.', 400);
  }

  const rateValue = input.rate === undefined && existingRoom ? existingRoom.rate : input.rate;
  const rate = Number(rateValue);
  if (!Number.isSafeInteger(rate) || rate < 1) {
    throw new RoomError('La tarifa por noche debe ser un valor entero positivo.', 400);
  }

  const statusValue = input.status === undefined
    ? (existingRoom ? existingRoom.status : 'DISPONIBLE')
    : input.status;
  const status = typeof statusValue === 'string' ? statusValue.trim().toUpperCase() : '';
  if (!roomStatuses.includes(status)) {
    throw new RoomError('Selecciona un estado de habitación válido.', 400);
  }

  const descriptionValue = input.description === undefined && existingRoom
    ? existingRoom.description
    : (input.description || '');
  if (typeof descriptionValue !== 'string' || descriptionValue.trim().length > 250) {
    throw new RoomError('La descripción no puede superar 250 caracteres.', 400);
  }

  return {
    number,
    type,
    capacity,
    rate,
    status,
    description: descriptionValue.trim()
  };
}

async function listRooms(filters) {
  return roomModel.list(validateFilters(filters || {}));
}

async function getRoom(id) {
  const room = await roomModel.findById(id);
  if (!room) throw new RoomError('No se encontró la habitación.', 404);
  return room;
}

async function createRoom(input) {
  const data = normalizeRoom(input);
  if (await roomModel.findByNumber(data.number)) {
    throw new RoomError('Ya existe una habitación con ese número.', 409);
  }
  return roomModel.create(data);
}

async function updateRoom(id, input) {
  const currentRoom = await roomModel.findById(id);
  if (!currentRoom) throw new RoomError('No se encontró la habitación.', 404);

  const data = normalizeRoom(input, currentRoom);
  if (data.number !== currentRoom.number && await roomModel.findByNumber(data.number)) {
    throw new RoomError('Ya existe una habitación con ese número.', 409);
  }
  return roomModel.update(id, data);
}

async function deleteRoom(id) {
  const room = await roomModel.remove(id);
  if (!room) throw new RoomError('No se encontró la habitación.', 404);
  return room;
}

async function getCounts() {
  const rooms = await roomModel.list();
  return {
    totalRooms: rooms.length,
    availableRooms: rooms.filter((room) => room.status === 'DISPONIBLE').length,
    cleaningRooms: rooms.filter((room) => room.status === 'EN_LIMPIEZA').length,
    maintenanceRooms: rooms.filter((room) => room.status === 'MANTENIMIENTO').length,
    outOfServiceRooms: rooms.filter((room) => room.status === 'FUERA_DE_SERVICIO').length
  };
}

module.exports = {
  roomTypes,
  roomStatuses,
  RoomError,
  listRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
  getCounts
};
