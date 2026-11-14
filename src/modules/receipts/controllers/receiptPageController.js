const reservationService = require('../../reservations/services/reservationService');
const receiptService = require('../services/receiptService');

function formatCop(value) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(BigInt(value));
}

async function renderList(req, res) {
  const reservations = await reservationService.listReservations();
  return res.render('receipts/views/index', { user: req.auth, reservations });
}

async function renderReceipt(req, res) {
  const receipt = await receiptService.getReceipt(req.params.reservationId);
  return res.render('receipts/views/detail', { user: req.auth, receipt, formatCop });
}

module.exports = { renderList, renderReceipt };
