function renderAvailability(req, res) {
  return res.render('availability/views/index', { user: req.auth });
}

module.exports = { renderAvailability };
