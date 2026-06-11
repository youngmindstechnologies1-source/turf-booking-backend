const express = require('express');
const router = express.Router();
const {
  getUserProfile,
  toggleFollow,
  searchPlayers,
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.get('/search', protect, searchPlayers);
router.get('/profile/:id', protect, getUserProfile);
router.post('/follow/:id', protect, toggleFollow);

module.exports = router;
