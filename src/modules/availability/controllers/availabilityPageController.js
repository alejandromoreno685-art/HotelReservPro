const { hotelToday } = require('../../../hotelDate');

function renderAvailability(req, res) {
  return res.render('availability/views/index', { user: req.auth, hotelToday: hotelToday() });
}

module.exports = { renderAvailability };
