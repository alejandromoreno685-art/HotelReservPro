const express = require('express');
const reservationController = require('../controllers/reservationController');

const router = express.Router();

router.get('/options', reservationController.options);
router.get('/available-rooms', reservationController.availableRooms);
router.get('/', reservationController.list);
router.post('/', reservationController.create);
router.get('/:id', reservationController.get);
router.patch('/:id/status', reservationController.updateStatus);
router.post('/:id/cancel', reservationController.cancel);

module.exports = router;
