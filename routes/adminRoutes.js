const express = require('express');
const router = express.Router();
const {
  getPendingTurfs,
  approveTurf,
  rejectTurf,
  getUsers,
  toggleUserActive,
  getAllBookings,
  adminCancelBooking,
  getStats,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// All routes require admin access
router.use(protect, authorize('admin'));

router.get('/turfs/pending', getPendingTurfs);
router.put('/turfs/:id/approve', approveTurf);
router.put('/turfs/:id/reject', rejectTurf);
router.get('/users', getUsers);
router.put('/users/:id/toggle-active', toggleUserActive);
router.get('/bookings', getAllBookings);
router.put('/bookings/:id/cancel', adminCancelBooking);
router.get('/stats', getStats);

module.exports = router;
