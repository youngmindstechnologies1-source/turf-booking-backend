const express = require('express');
const router = express.Router();
const {
  hostMatch,
  getOpenMatches,
  getMatchDetails,
  joinMatch,
  leaveMatch,
} = require('../controllers/matchController');
const { protect } = require('../middleware/auth');

router.get('/', getOpenMatches); // public feed
router.get('/:id', protect, getMatchDetails);
router.post('/host', protect, hostMatch);
router.post('/:id/join', protect, joinMatch);
router.post('/:id/leave', protect, leaveMatch);

module.exports = router;
