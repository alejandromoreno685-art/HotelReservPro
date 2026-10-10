const express = require('express');
const guestPageController = require('../controllers/guestPageController');

const router = express.Router();

router.get('/', guestPageController.renderGuests);

module.exports = router;
