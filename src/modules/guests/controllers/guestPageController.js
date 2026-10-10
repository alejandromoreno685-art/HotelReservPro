function renderGuests(req, res) {
  return res.render('guests/views/index', { user: req.auth });
}

module.exports = { renderGuests };
