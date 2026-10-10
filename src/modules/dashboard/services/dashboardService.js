const dashboardModel = require('../models/dashboardModel');
const roomService = require('../../rooms/services/roomService');

async function getSummary() {
  return {
    ...dashboardModel.getSummary(),
    ...await roomService.getCounts()
  };
}

module.exports = { getSummary };
