const receiptService = require('../services/receiptService');
const { buildPdf } = require('../services/receiptPdf');
const database = require('../../../database');

async function get(req, res) {
  const receipt = await receiptService.getReceipt(req.params.reservationId);
  return res.json({ receipt });
}

async function pdf(req, res) {
  const receipt = await receiptService.getReceipt(req.params.reservationId);
  let document;
  try {
    // Punto de fallo de laboratorio (CP-30): memoria (NODE_ENV=test) o perfil
    // exclusivo de SQL Server. Nunca se activa en desarrollo ni producción.
    if ((process.env.NODE_ENV === 'test' && process.env.RTF4_TEST_FAILPOINT === 'receipt.pdf') ||
        database.isFailpointActive('receipt.pdf')) {
      throw new Error('RTF4 test-only PDF generation failpoint.');
    }
    document = buildPdf(receipt);
  } catch (error) {
    console.error(error);
    throw new receiptService.ReceiptError(
      'No fue posible generar el comprobante PDF. No se registraron cambios; intenta nuevamente.',
      500
    );
  }
  const filename = `${receipt.receiptId}.pdf`;
  res.type('application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${filename}"`
  );
  res.setHeader('Content-Length', document.length);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(document);
}

async function addCharge(req, res) {
  const { receipt, duplicate } = await receiptService.addCharge(
    req.params.reservationId,
    req.body,
    req.get('Idempotency-Key')
  );
  return res.status(duplicate ? 200 : 201).json({ receipt, duplicate });
}

async function addPayment(req, res) {
  const { receipt, duplicate } = await receiptService.addPayment(
    req.params.reservationId,
    req.body,
    req.get('Idempotency-Key')
  );
  return res.status(duplicate ? 200 : 201).json({ receipt, duplicate });
}

module.exports = { get, pdf, addCharge, addPayment };
