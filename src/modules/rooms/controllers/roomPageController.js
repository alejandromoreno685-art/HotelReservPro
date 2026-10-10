function renderRooms(req, res) {
  return res.render('rooms/views/index', { user: req.auth });
}

module.exports = { renderRooms };
