const express = require('express');
const availabilityPageController = require('../controllers/availabilityPageController');

const router = express.Router();

router.get('/', availabilityPageController.renderAvailability);

module.exports = router;
