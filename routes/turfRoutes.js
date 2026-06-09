const express = require('express');
const router = express.Router();
const {
  getTurfs,
  getTurfBySlug,
  createTurf,
  updateTurf,
  deleteTurf,
  getMyTurfs,
  uploadPhotos,
} = require('../controllers/turfController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', getTurfs);
router.get('/owner/my-turfs', protect, authorize('owner'), getMyTurfs);
router.get('/:slug', getTurfBySlug);
router.post('/', protect, authorize('owner'), createTurf);
router.put('/:id', protect, authorize('owner'), updateTurf);
router.delete('/:id', protect, authorize('owner'), deleteTurf);
router.post(
  '/:id/photos',
  protect,
  authorize('owner'),
  upload.array('photos', 5),
  uploadPhotos
);

module.exports = router;
