const express  = require('express');
const router    = express.Router();
const protect   = require('../middleware/auth');
const { register, login, googleLogin } = require('../controllers/authController');
// change-password is owned by userController but accessible via /api/auth too
const { changePasswordController } = require('../controllers/userController');

router.post('/register',        register);
router.post('/login',           login);
router.post('/google',          googleLogin);
router.post('/change-password', protect, changePasswordController); // also at /api/users/me/change-password

module.exports = router;
