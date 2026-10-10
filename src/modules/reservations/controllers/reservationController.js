const reservationService = require('../services/reservationService');

async function list(req, res) {
  return res.json({ reservations: await reservationService.listReservations(req.query) });
}

async function get(req, res) {
  return res.json({ reservation: await reservationService.getReservation(req.params.id) });
}

async function create(req, res) {
  const reservation = await reservationService.createReservation(req.body);
  return res.status(201).json({ reservation });
}

async function updateStatus(req, res) {
  const reservation = await reservationService.updateReservationStatus(
    req.params.id,
    req.body?.status
  );
  return res.json({ reservation });
}

async function cancel(req, res) {
  const reservation = await reservationService.cancelReservation(req.params.id);
  return res.json({ reservation });
}

async function options(req, res) {
  return res.json(await reservationService.getOptions());
}

async function availableRooms(req, res) {
  return res.json(await reservationService.availableRooms(req.query));
}

module.exports = { list, get, create, updateStatus, cancel, options, availableRooms };
