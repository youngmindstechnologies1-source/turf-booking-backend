const express = require('express');
const router = express.Router();
const {
  generateSlots,
  getSlots,
  updateSlotPrice,
  blockSlots,
  unblockSlots,
} = require('../controllers/slotController');
const { protect, authorize } = require('../middleware/auth');

router.post('/generate', protect, authorize('owner'), generateSlots);
router.get('/:turfId', getSlots);
router.put('/:id/price', protect, authorize('owner'), updateSlotPrice);
router.put('/block', protect, authorize('owner'), blockSlots);
router.put('/unblock', protect, authorize('owner'), unblockSlots);

module.exports = router;
