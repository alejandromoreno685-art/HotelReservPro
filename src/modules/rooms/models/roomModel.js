const { randomUUID } = require('node:crypto');
const database = require('../../../database');

const testMode = process.env.NODE_ENV === 'test';
const rooms = new Map();

function mapRoom(row) {
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    capacity: Number(row.capacity),
    rate: Number(row.rate),
    status: row.status,
    description: row.description,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt
  };
}

const roomColumns = `id, room_number AS number, room_type AS type, capacity, rate,
  physical_status AS status, description, created_at AS createdAt, updated_at AS updatedAt`;

function sortRooms(rooms) {
  return rooms.sort((left, right) => left.number.localeCompare(right.number, 'es', {
    numeric: true,
    sensitivity: 'base'
  }));
}

async function list(filters = {}) {
  if (!testMode) {
    const conditions = [];
    const parameters = {};
    if (filters.status) {
      conditions.push('physical_status = @status');
      parameters.status = filters.status;
    }
    if (filters.type) {
      conditions.push('room_type = @type');
      parameters.type = filters.type;
    }
    if (filters.search) {
      conditions.push('(room_number LIKE @search OR description LIKE @search)');
      parameters.search = `%${filters.search}%`;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await database.query(
      `SELECT ${roomColumns} FROM dbo.Rooms ${where} ORDER BY room_number`,
      parameters
    );
    return sortRooms(result.recordset.map(mapRoom));
  }

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
  if (!testMode) {
    const result = await database.query(
      `SELECT ${roomColumns} FROM dbo.Rooms WHERE id = @id`,
      { id }
    );
    return result.recordset.length ? mapRoom(result.recordset[0]) : null;
  }

  const room = rooms.get(id);
  return room ? { ...room } : null;
}

async function findByNumber(number) {
  if (!testMode) {
    const result = await database.query(
      'SELECT id FROM dbo.Rooms WHERE room_number = @number',
      { number: number.toUpperCase() }
    );
    return result.recordset.length > 0;
  }

  return [...rooms.values()].some((room) => room.number === number.toUpperCase());
}

async function create(data) {
  const id = randomUUID();
  if (!testMode) {
    await database.query(
      `INSERT INTO dbo.Rooms
        (id, room_number, room_type, capacity, rate, physical_status, description)
       VALUES (@id, @number, @type, @capacity, @rate, @status, @description)`,
      { id, ...data }
    );
    return findById(id);
  }

  const now = new Date().toISOString();
  const room = { id, ...data, createdAt: now, updatedAt: now };
  rooms.set(room.id, room);
  return { ...room };
}

async function update(id, data) {
  if (!testMode) {
    const result = await database.query(
      `UPDATE dbo.Rooms
       SET room_number = @number, room_type = @type, capacity = @capacity, rate = @rate,
           physical_status = @status, description = @description, updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      { id, ...data }
    );
    if (result.rowsAffected[0] === 0) return null;
    return findById(id);
  }

  const currentRoom = rooms.get(id);
  if (!currentRoom) return null;
  const room = { ...currentRoom, ...data, updatedAt: new Date().toISOString() };
  rooms.set(id, room);
  return { ...room };
}

async function remove(id) {
  const room = await findById(id);
  if (!room) return null;
  if (!testMode) {
    await database.query('DELETE FROM dbo.Rooms WHERE id = @id', { id });
    return room;
  }

  rooms.delete(id);
  return room;
}

async function findAvailable(filters) {
  if (!testMode) {
    const typeCondition = filters.type ? 'AND r.room_type = @type' : '';
    const result = await database.query(
      `SELECT ${roomColumns.split(',').map((column) => `r.${column.trim()}`).join(', ')}
       FROM dbo.Rooms r
       WHERE r.physical_status = 'DISPONIBLE'
         AND r.capacity >= @guestCount
         ${typeCondition}
         AND NOT EXISTS (
           SELECT 1 FROM dbo.Reservations res
           WHERE res.room_id = r.id
             AND res.status IN ('PENDING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')
             AND res.check_in < @checkOut
             AND res.check_out > @checkIn
         )
       ORDER BY r.rate, r.room_number`,
      {
        guestCount: filters.guestCount,
        checkOut: filters.checkOut,
        checkIn: filters.checkIn,
        ...(filters.type ? { type: filters.type } : {})
      }
    );
    return result.recordset.map(mapRoom);
  }

  return (await list({ type: filters.type }))
    .filter((room) => room.status === 'DISPONIBLE' && room.capacity >= filters.guestCount);
}

module.exports = { list, findById, findByNumber, create, update, remove, findAvailable };
