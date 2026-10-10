const { randomUUID } = require('node:crypto');
const database = require('../../../database');
const guestModel = require('../../guests/models/guestModel');
const roomModel = require('../../rooms/models/roomModel');

const testMode = process.env.NODE_ENV === 'test';
const reservations = new Map();
const activeStatuses = ['PENDING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS'];
const reservationColumns = `res.id, res.guest_id AS guestId, res.room_id AS roomId,
  res.check_in AS checkIn, res.check_out AS checkOut, res.guest_count AS guestCount,
  res.status, res.created_at AS createdAt,
  g.full_name AS guestName, g.document_type AS documentType,
  g.document_number AS documentNumber,
  r.room_number AS roomNumber, r.room_type AS roomType, r.rate AS ratePerNight`;

function dateValue(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function mapReservation(row) {
  return {
    id: row.id,
    guestId: row.guestId,
    roomId: row.roomId,
    checkIn: dateValue(row.checkIn),
    checkOut: dateValue(row.checkOut),
    guestCount: Number(row.guestCount),
    status: row.status,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    guestName: row.guestName,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    roomNumber: row.roomNumber,
    roomType: row.roomType,
    ratePerNight: Number(row.ratePerNight)
  };
}

function overlaps(checkIn, checkOut, reservation) {
  return reservation.status !== 'CANCELLED' &&
    reservation.status !== 'COMPLETED' &&
    checkIn < reservation.checkOut &&
    checkOut > reservation.checkIn;
}

async function list(filters = {}) {
  if (!testMode) {
    const statusFilter = filters.status ? 'AND res.status = @status' : '';
    const result = await database.query(
      `SELECT ${reservationColumns}
       FROM dbo.Reservations res
       JOIN dbo.Guests g ON g.id = res.guest_id
       JOIN dbo.Rooms r ON r.id = res.room_id
       WHERE 1 = 1 ${statusFilter}
       ORDER BY res.check_in DESC, res.created_at DESC`,
      filters.status ? { status: filters.status } : {}
    );
    return result.recordset.map(mapReservation);
  }

  const records = await Promise.all([...reservations.values()].map(async (item) => {
    const guest = await guestModel.findById(item.guestId);
    const room = await roomModel.findById(item.roomId);
    if (!guest || !room) return null;
    return {
      ...item,
      guestName: guest.fullName,
      documentType: guest.documentType,
      documentNumber: guest.documentNumber,
      roomNumber: room.number,
      roomType: room.type,
      ratePerNight: room.rate
    };
  }));
  return records
    .filter((item) => item && (!filters.status || item.status === filters.status))
    .sort((left, right) => right.checkIn.localeCompare(left.checkIn))
    .map((item) => ({ ...item }));
}

async function findById(id) {
  if (!testMode) {
    const result = await database.query(
      `SELECT ${reservationColumns}
       FROM dbo.Reservations res
       JOIN dbo.Guests g ON g.id = res.guest_id
       JOIN dbo.Rooms r ON r.id = res.room_id
       WHERE res.id = @id`,
      { id }
    );
    return result.recordset.length ? mapReservation(result.recordset[0]) : null;
  }
  const reservation = reservations.get(id);
  if (!reservation) return null;
  const [records] = await Promise.all([list()]);
  return records.find((item) => item.id === id) || null;
}

async function findOverlappingRoomIds(criteria) {
  if (!testMode) {
    const result = await database.query(
      `SELECT DISTINCT room_id AS roomId
       FROM dbo.Reservations
       WHERE status IN ('PENDING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')
         AND check_in < @checkOut AND check_out > @checkIn`,
      { checkIn: criteria.checkIn, checkOut: criteria.checkOut }
    );
    return result.recordset.map((row) => row.roomId);
  }

  return [...reservations.values()]
    .filter((reservation) => overlaps(criteria.checkIn, criteria.checkOut, reservation))
    .map((reservation) => reservation.roomId);
}

async function create(data) {
  const id = randomUUID();
  if (!testMode) {
    return database.withTransaction(async (query) => {
      const roomResult = await query(
        `SELECT id, capacity, physical_status
         FROM dbo.Rooms WITH (UPDLOCK, HOLDLOCK)
         WHERE id = @roomId`,
        { roomId: data.roomId }
      );
      const room = roomResult.recordset[0];
      if (!room || room.physical_status !== 'DISPONIBLE' || room.capacity < data.guestCount) {
        const error = new Error('La habitación no existe, no está operativa o no tiene capacidad suficiente.');
        error.code = 'ROOM_UNAVAILABLE';
        throw error;
      }

      const guestResult = await query(
        'SELECT id FROM dbo.Guests WITH (HOLDLOCK) WHERE id = @guestId',
        { guestId: data.guestId }
      );
      if (guestResult.recordset.length === 0) {
        const error = new Error('No se encontró el huésped seleccionado.');
        error.code = 'GUEST_NOT_FOUND';
        throw error;
      }

      const overlapResult = await query(
        `SELECT TOP (1) id
         FROM dbo.Reservations WITH (UPDLOCK, HOLDLOCK)
         WHERE room_id = @roomId
           AND status IN ('PENDING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')
           AND check_in < @checkOut AND check_out > @checkIn`,
        {
          roomId: data.roomId,
          checkIn: data.checkIn,
          checkOut: data.checkOut
        }
      );
      if (overlapResult.recordset.length > 0) {
        const error = new Error('La habitación ya fue reservada para parte de ese período.');
        error.code = 'RESERVATION_OVERLAP';
        throw error;
      }

      await query(
        `INSERT INTO dbo.Reservations
          (id, guest_id, room_id, check_in, check_out, guest_count, status)
         VALUES (@id, @guestId, @roomId, @checkIn, @checkOut, @guestCount, 'PENDING_DEPOSIT')`,
        { id, ...data }
      );
      return id;
    }).then(() => findById(id));
  }

  const room = await roomModel.findById(data.roomId);
  const guest = await guestModel.findById(data.guestId);
  if (!guest) {
    const error = new Error('No se encontró el huésped seleccionado.');
    error.code = 'GUEST_NOT_FOUND';
    throw error;
  }
  if (!room || room.status !== 'DISPONIBLE' || room.capacity < data.guestCount) {
    const error = new Error('La habitación no existe, no está operativa o no tiene capacidad suficiente.');
    error.code = 'ROOM_UNAVAILABLE';
    throw error;
  }
  if ([...reservations.values()].some((item) => (
    item.roomId === data.roomId && overlaps(data.checkIn, data.checkOut, item)
  ))) {
    const error = new Error('La habitación ya fue reservada para parte de ese período.');
    error.code = 'RESERVATION_OVERLAP';
    throw error;
  }

  reservations.set(id, {
    id,
    ...data,
    status: 'PENDING_DEPOSIT',
    createdAt: new Date().toISOString()
  });
  return findById(id);
}

async function updateStatus(id, status, expectedStatus) {
  if (!testMode) {
    const result = await database.query(
      `UPDATE dbo.Reservations
       SET status = @status
       WHERE id = @id AND status = @expectedStatus`,
      { id, status, expectedStatus }
    );
    if (result.rowsAffected[0] === 0) {
      const error = new Error('La reserva cambió en otra operación; recarga la página e inténtalo de nuevo.');
      error.code = 'RESERVATION_STATE_CHANGED';
      throw error;
    }
    return findById(id);
  }

  const reservation = reservations.get(id);
  if (!reservation || reservation.status !== expectedStatus) {
    const error = new Error('La reserva cambió en otra operación; recarga la página e inténtalo de nuevo.');
    error.code = 'RESERVATION_STATE_CHANGED';
    throw error;
  }
  reservations.set(id, { ...reservation, status });
  return findById(id);
}

async function getSummary() {
  if (!testMode) {
    const result = await database.query(
      `SELECT
         SUM(CASE WHEN check_in = CONVERT(date, SYSUTCDATETIME())
                       AND status IN ('PENDING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')
                  THEN 1 ELSE 0 END) AS reservationsToday,
         SUM(CASE WHEN status = 'PENDING_DEPOSIT' THEN 1 ELSE 0 END) AS pendingReservations,
         SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS occupiedRooms
       FROM dbo.Reservations`
    );
    const summary = result.recordset[0];
    return {
      reservationsToday: Number(summary.reservationsToday || 0),
      pendingReservations: Number(summary.pendingReservations || 0),
      occupiedRooms: Number(summary.occupiedRooms || 0)
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const currentReservations = [...reservations.values()];
  return {
    reservationsToday: currentReservations.filter(
      (item) => item.checkIn === today && activeStatuses.includes(item.status)
    ).length,
    pendingReservations: currentReservations.filter((item) => item.status === 'PENDING_DEPOSIT').length,
    occupiedRooms: currentReservations.filter((item) => item.status === 'IN_PROGRESS').length
  };
}

module.exports = {
  list,
  findById,
  findOverlappingRoomIds,
  create,
  updateStatus,
  getSummary
};
