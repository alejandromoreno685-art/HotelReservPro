const express = require('express');
const receiptController = require('../controllers/receiptController');

const router = express.Router();

router.get('/:reservationId/pdf', receiptController.pdf);
router.get('/:reservationId', receiptController.get);
router.post('/:reservationId/charges', receiptController.addCharge);
router.post('/:reservationId/payments', receiptController.addPayment);

module.exports = router;
