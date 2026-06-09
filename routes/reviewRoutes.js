const express = require('express');
const router = express.Router();
const {
  createReview,
  getTurfReviews,
  deleteReview,
} = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, authorize('player'), createReview);
router.get('/turf/:turfId', getTurfReviews);
router.delete('/:id', protect, deleteReview);

module.exports = router;
