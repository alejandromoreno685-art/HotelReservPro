const roomService = require('../services/roomService');

async function list(req, res) {
  return res.json({ rooms: await roomService.listRooms(req.query) });
}

async function get(req, res) {
  return res.json({ room: await roomService.getRoom(req.params.id) });
}

async function create(req, res) {
  const room = await roomService.createRoom(req.body);
  return res.status(201).json({ room });
}

async function update(req, res) {
  return res.json({ room: await roomService.updateRoom(req.params.id, req.body) });
}

async function remove(req, res) {
  await roomService.deleteRoom(req.params.id);
  return res.status(204).end();
}

module.exports = { list, get, create, update, remove };
