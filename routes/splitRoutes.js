const express = require('express');
const router = express.Router();
const {
  getSplitStatus,
  submitUtr,
  markPayCash,
  hostConfirm,
} = require('../controllers/splitController');

// All routes are public (no auth required)
router.get('/:bookingRef', getSplitStatus);
router.post('/:bookingRef/submit-utr', submitUtr);
router.post('/:bookingRef/pay-cash', markPayCash);
router.post('/:bookingRef/host-confirm', hostConfirm);

module.exports = router;
