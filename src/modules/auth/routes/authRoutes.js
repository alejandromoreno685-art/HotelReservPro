const express = require('express');
const authController = require('../controllers/authController');
const { requireJwt } = require('../../../middlewares/jwt');

const router = express.Router();

router.post('/login', authController.login);
router.post('/logout', requireJwt, authController.logout);
router.get('/me', requireJwt, authController.currentUser);

module.exports = router;
