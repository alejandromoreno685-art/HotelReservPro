function renderReservations(req, res) {
  return res.render('reservations/views/index', { user: req.auth });
}

module.exports = { renderReservations };
