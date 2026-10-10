const { randomUUID } = require('node:crypto');

const rooms = new Map();

function list(filters = {}) {
  const search = (filters.search || '').toLocaleLowerCase();

  return [...rooms.values()]
    .filter((room) => !filters.status || room.status === filters.status)
    .filter((room) => !filters.type || room.type === filters.type)
    .filter((room) => (
      !search ||
      room.number.toLocaleLowerCase().includes(search) ||
      room.description.toLocaleLowerCase().includes(search)
    ))
    .sort((left, right) => left.number.localeCompare(right.number, 'es', {
      numeric: true,
      sensitivity: 'base'
    }))
    .map((room) => ({ ...room }));
}

function findById(id) {
  const room = rooms.get(id);
  return room ? { ...room } : null;
}

function findByNumber(number) {
  const normalizedNumber = number.toLocaleUpperCase();
  return [...rooms.values()].some((room) => room.number === normalizedNumber);
}

function create(data) {
  const now = new Date().toISOString();
  const room = {
    id: randomUUID(),
    ...data,
    createdAt: now,
    updatedAt: now
  };
  rooms.set(room.id, room);
  return { ...room };
}

function update(id, data) {
  const currentRoom = rooms.get(id);
  if (!currentRoom) return null;

  const room = {
    ...currentRoom,
    ...data,
    updatedAt: new Date().toISOString()
  };
  rooms.set(id, room);
  return { ...room };
}

function remove(id) {
  const room = rooms.get(id);
  if (!room) return null;
  rooms.delete(id);
  return { ...room };
}

module.exports = { list, findById, findByNumber, create, update, remove };
