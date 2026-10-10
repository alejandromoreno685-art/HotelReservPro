const express = require('express');
const roomController = require('../controllers/roomController');

const router = express.Router();

router.get('/', roomController.list);
router.post('/', roomController.create);
router.get('/:id', roomController.get);
router.put('/:id', roomController.update);
router.delete('/:id', roomController.remove);

module.exports = router;
