const roomModel = require('../../rooms/models/roomModel');

function findAvailableRooms(criteria) {
  return roomModel.findAvailable(criteria);
}

module.exports = { findAvailableRooms };
