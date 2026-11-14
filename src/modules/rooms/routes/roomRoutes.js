const express = require('express');
const roomController = require('../controllers/roomController');
const { requireRoles } = require('../../../middlewares/jwt');

const router = express.Router();

router.get('/', roomController.list);
router.post('/', requireRoles('admin'), roomController.create);
router.get('/:id', roomController.get);
router.put('/:id', requireRoles('admin'), roomController.update);
router.delete('/:id', requireRoles('admin'), roomController.remove);

module.exports = router;
