const express = require('express');
const availabilityController = require('../controllers/availabilityController');

const router = express.Router();

router.get('/', availabilityController.search);

module.exports = router;
