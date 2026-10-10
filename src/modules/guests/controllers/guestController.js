const guestService = require('../services/guestService');

async function list(req, res) {
  return res.json({ guests: await guestService.listGuests(req.query.search) });
}

async function get(req, res) {
  return res.json({ guest: await guestService.getGuest(req.params.id) });
}

async function create(req, res) {
  return res.status(201).json({ guest: await guestService.createGuest(req.body) });
}

async function update(req, res) {
  return res.json({ guest: await guestService.updateGuest(req.params.id, req.body) });
}

async function remove(req, res) {
  await guestService.deleteGuest(req.params.id);
  return res.status(204).end();
}

module.exports = { list, get, create, update, remove };
