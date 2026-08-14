const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const {
  applyForGigController,
  getGigApplicationsController,
  getMyApplicationsController,
  updateApplicationStatusController,
} = require('../controllers/applicationController');

// Support both styles for flexibility
router.post('/apply/:gigId',            protect, applyForGigController);
router.post('/:gigId',                  protect, applyForGigController); // Frontend direct style

router.get('/my',                       protect, getMyApplicationsController);
router.get('/gig/:gigId',               protect, getGigApplicationsController);

// Support both PUT and PATCH for status updates
router.patch('/:applicationId/status',  protect, updateApplicationStatusController);
router.put('/:applicationId/status',    protect, updateApplicationStatusController); // Frontend verb

module.exports = router;
