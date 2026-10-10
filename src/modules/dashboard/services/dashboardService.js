const dashboardModel = require('../models/dashboardModel');
const roomService = require('../../rooms/services/roomService');
const reservationModel = require('../../reservations/models/reservationModel');

async function getSummary() {
  return {
    ...dashboardModel.getSummary(),
    ...await reservationModel.getSummary(),
    ...await roomService.getCounts()
  };
}

module.exports = { getSummary };
