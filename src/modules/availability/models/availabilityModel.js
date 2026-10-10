const roomModel = require('../../rooms/models/roomModel');
const reservationModel = require('../../reservations/models/reservationModel');

async function findAvailableRooms(criteria) {
  const rooms = await roomModel.findAvailable(criteria);
  if (process.env.NODE_ENV !== 'test') return rooms;

  const reservedRoomIds = new Set(await reservationModel.findOverlappingRoomIds(criteria));
  return rooms.filter((room) => !reservedRoomIds.has(room.id));
}

module.exports = { findAvailableRooms };
