const express = require('express');
const protect = require('../middleware/auth');
const {
    createGigController,
    getAllGigsController,
    getGigByIdController,
    updateGigController,
    deleteGigController
} = require('../controllers/gigController');

const router = express.Router();

// Public Routes
router.get('/',    getAllGigsController);
router.get('/:id', getGigByIdController);

// Protected Routes
router.post('/',   protect, createGigController);
router.put('/:id',    protect, updateGigController);
router.delete('/:id', protect, deleteGigController);

module.exports = router;