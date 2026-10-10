const dashboardModel = require('../models/dashboardModel');
const roomService = require('../../rooms/services/roomService');

function getSummary() {
  return {
    ...dashboardModel.getSummary(),
    ...roomService.getCounts()
  };
}

module.exports = { getSummary };
