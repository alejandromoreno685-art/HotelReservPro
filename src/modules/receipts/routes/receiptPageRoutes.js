const express = require('express');
const receiptPageController = require('../controllers/receiptPageController');

const router = express.Router();

router.get('/', receiptPageController.renderList);
router.get('/:reservationId', receiptPageController.renderReceipt);

module.exports = router;
