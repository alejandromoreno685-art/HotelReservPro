const guestModel = require('../models/guestModel');

const documentTypes = ['CC', 'CE', 'PASSPORT', 'TI', 'NIT', 'OTHER'];

class GuestError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'GuestError';
    this.statusCode = statusCode;
  }
}

function normalizeGuest(input, existing) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new GuestError('Los datos del huésped no son válidos.', 400);
  }
  const value = (key) => input[key] === undefined && existing ? existing[key] : input[key];
  const fullName = typeof value('fullName') === 'string' ? value('fullName').trim() : '';
  const documentType = typeof value('documentType') === 'string'
    ? value('documentType').trim().toUpperCase()
    : '';
  const documentNumber = typeof value('documentNumber') === 'string'
    ? value('documentNumber').trim().toUpperCase()
    : '';
  const phone = typeof value('phone') === 'string' ? value('phone').trim() : '';
  const email = typeof value('email') === 'string' ? value('email').trim().toLowerCase() : '';
  const country = typeof value('country') === 'string' ? value('country').trim() : '';
  const foreignNonResident = value('foreignNonResident') === true ||
    value('foreignNonResident') === 'true';

  if (fullName.length < 2 || fullName.length > 160) {
    throw new GuestError('El nombre debe tener entre 2 y 160 caracteres.', 400);
  }
  if (!documentTypes.includes(documentType)) {
    throw new GuestError('Selecciona un tipo de documento válido.', 400);
  }
  if (!/^[A-Z0-9.-]{3,40}$/.test(documentNumber)) {
    throw new GuestError('El número de documento debe tener entre 3 y 40 caracteres válidos.', 400);
  }
  if (phone.length < 7 || phone.length > 30) {
    throw new GuestError('Ingresa un teléfono válido.', 400);
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new GuestError('Ingresa un correo electrónico válido.', 400);
  }
  if (country.length < 2 || country.length > 100) {
    throw new GuestError('Ingresa el país de residencia.', 400);
  }

  return {
    fullName,
    documentType,
    documentNumber,
    phone,
    email,
    country,
    foreignNonResident
  };
}

async function listGuests(search) {
  if (search !== undefined && typeof search !== 'string') {
    throw new GuestError('El criterio de búsqueda no es válido.', 400);
  }
  return guestModel.list({ search: search || '' });
}

async function getGuest(id) {
  const guest = await guestModel.findById(id);
  if (!guest) throw new GuestError('No se encontró el huésped.', 404);
  return guest;
}

async function createGuest(input) {
  const guest = normalizeGuest(input);
  if (await guestModel.findByDocument(guest.documentType, guest.documentNumber)) {
    throw new GuestError('Ya existe un huésped con ese tipo y número de documento.', 409);
  }
  return guestModel.create(guest);
}

async function updateGuest(id, input) {
  const current = await guestModel.findById(id);
  if (!current) throw new GuestError('No se encontró el huésped.', 404);
  const guest = normalizeGuest(input, current);
  const duplicate = await guestModel.findByDocument(guest.documentType, guest.documentNumber);
  if (duplicate && duplicate.id !== id) {
    throw new GuestError('Ya existe un huésped con ese tipo y número de documento.', 409);
  }
  return guestModel.update(id, guest);
}

async function deleteGuest(id) {
  const guest = await guestModel.remove(id);
  if (!guest) throw new GuestError('No se encontró el huésped.', 404);
  return guest;
}

module.exports = {
  GuestError,
  documentTypes,
  listGuests,
  getGuest,
  createGuest,
  updateGuest,
  deleteGuest
};
