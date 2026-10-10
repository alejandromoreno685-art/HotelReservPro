const { randomUUID } = require('node:crypto');

const rooms = new Map();

function sortRooms(rooms) {
  return rooms.sort((left, right) => left.number.localeCompare(right.number, 'es', {
    numeric: true,
    sensitivity: 'base'
  }));
}

async function list(filters = {}) {
  const search = (filters.search || '').toLocaleLowerCase();
  return sortRooms([...rooms.values()]
    .filter((room) => !filters.status || room.status === filters.status)
    .filter((room) => !filters.type || room.type === filters.type)
    .filter((room) => (
      !search ||
      room.number.toLocaleLowerCase().includes(search) ||
      room.description.toLocaleLowerCase().includes(search)
    ))
    .map((room) => ({ ...room })));
}

async function findById(id) {
  const room = rooms.get(id);
  return room ? { ...room } : null;
}

async function findByNumber(number) {
  return [...rooms.values()].some((room) => room.number === number.toUpperCase());
}

async function create(data) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const room = { id, ...data, createdAt: now, updatedAt: now };
  rooms.set(room.id, room);
  return { ...room };
}

async function update(id, data) {
  const currentRoom = rooms.get(id);
  if (!currentRoom) return null;
  const room = { ...currentRoom, ...data, updatedAt: new Date().toISOString() };
  rooms.set(id, room);
  return { ...room };
}

async function remove(id) {
  const room = await findById(id);
  if (!room) return null;
  rooms.delete(id);
  return room;
}

async function findAvailable(filters) {
  return (await list({ type: filters.type }))
    .filter((room) => room.status === 'DISPONIBLE' && room.capacity >= filters.guestCount);
}

module.exports = { list, findById, findByNumber, create, update, remove, findAvailable };
