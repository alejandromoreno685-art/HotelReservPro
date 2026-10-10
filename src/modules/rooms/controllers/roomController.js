const roomService = require('../services/roomService');

function list(req, res) {
  return res.json({ rooms: roomService.listRooms(req.query) });
}

function get(req, res) {
  return res.json({ room: roomService.getRoom(req.params.id) });
}

function create(req, res) {
  const room = roomService.createRoom(req.body);
  return res.status(201).json({ room });
}

function update(req, res) {
  return res.json({ room: roomService.updateRoom(req.params.id, req.body) });
}

function remove(req, res) {
  roomService.deleteRoom(req.params.id);
  return res.status(204).end();
}

module.exports = { list, get, create, update, remove };
