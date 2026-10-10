const dashboardModel = require('../models/dashboardModel');

function getSummary() {
  return dashboardModel.getSummary();
}

module.exports = { getSummary };
