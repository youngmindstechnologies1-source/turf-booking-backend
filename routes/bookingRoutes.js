const express = require('express');
const router = express.Router();
const {
  createBooking,
  getMyBookings,
  getTurfBookings,
  getBooking,
  cancelBooking,
} = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, authorize('player'), createBooking);
router.get('/my-bookings', protect, getMyBookings);
router.get('/turf/:turfId', protect, authorize('owner'), getTurfBookings);
router.get('/:id', protect, getBooking);
router.put('/:id/cancel', protect, cancelBooking);

module.exports = router;
