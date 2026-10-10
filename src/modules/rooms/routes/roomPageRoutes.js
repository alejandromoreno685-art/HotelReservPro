const express = require('express');
const roomPageController = require('../controllers/roomPageController');

const router = express.Router();

router.get('/', roomPageController.renderRooms);

module.exports = router;
