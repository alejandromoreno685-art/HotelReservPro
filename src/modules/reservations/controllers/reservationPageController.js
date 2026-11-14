const { hotelToday } = require('../../../hotelDate');
const reservationService = require('../services/reservationService');

function renderReservations(req, res) {
  return res.render('reservations/views/index', { user: req.auth, hotelToday: hotelToday() });
}

async function renderReservation(req, res) {
  const reservation = await reservationService.getReservation(req.params.id);
  return res.render('reservations/views/detail', { user: req.auth, reservation });
}

module.exports = { renderReservations, renderReservation };
