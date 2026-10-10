const { randomUUID } = require('node:crypto');

const guests = new Map();

function matches(guest, filters) {
  const search = (filters.search || '').toLocaleLowerCase();
  return !search || [
    guest.fullName,
    guest.documentNumber,
    guest.email,
    guest.phone
  ].some((field) => field.toLocaleLowerCase().includes(search));
}

async function list(filters = {}) {
  return [...guests.values()]
    .filter((guest) => matches(guest, filters))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es'))
    .map((guest) => ({ ...guest }));
}

async function findById(id) {
  const guest = guests.get(id);
  return guest ? { ...guest } : null;
}

async function findByDocument(documentType, documentNumber) {
  const guest = [...guests.values()].find(
    (item) => item.documentType === documentType && item.documentNumber === documentNumber
  );
  return guest ? { ...guest } : null;
}

async function create(data) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const guest = { id, ...data, createdAt: now, updatedAt: now };
  guests.set(id, guest);
  return { ...guest };
}

async function update(id, data) {
  const current = guests.get(id);
  if (!current) return null;
  const guest = { ...current, ...data, updatedAt: new Date().toISOString() };
  guests.set(id, guest);
  return { ...guest };
}

async function remove(id) {
  const guest = await findById(id);
  if (!guest) return null;
  guests.delete(id);
  return guest;
}

module.exports = { list, findById, findByDocument, create, update, remove };
