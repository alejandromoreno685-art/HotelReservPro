function renderRooms(req, res) {
  return res.render('rooms/views/index', {
    user: req.auth,
    canManageRooms: req.auth.role === 'admin'
  });
}

module.exports = { renderRooms };
