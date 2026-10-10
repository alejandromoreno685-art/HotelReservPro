const express = require('express');
const guestController = require('../controllers/guestController');

const router = express.Router();

router.get('/', guestController.list);
router.post('/', guestController.create);
router.get('/:id', guestController.get);
router.put('/:id', guestController.update);
router.delete('/:id', guestController.remove);

module.exports = router;
