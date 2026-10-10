const express = require('express');
const reservationPageController = require('../controllers/reservationPageController');

const router = express.Router();

router.get('/', reservationPageController.renderReservations);

module.exports = router;
