const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Turf = require('../models/Turf');
const { ErrorResponse } = require('../middleware/errorHandler');

// @desc    Create a review
// @route   POST /api/reviews
// @access  Private (player)
const createReview = async (req, res, next) => {
  try {
    const { turfId, bookingId, rating, comment } = req.body;

    if (!turfId || !bookingId || !rating) {
      return next(new ErrorResponse('Please provide turfId, bookingId, and rating', 400));
    }

    // Verify booking belongs to the player
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    if (booking.player.toString() !== req.user.id) {
      return next(new ErrorResponse('This booking does not belong to you', 403));
    }

    // Check booking status is completed
    if (booking.status !== 'completed') {
      return next(new ErrorResponse('You can only review completed bookings', 400));
    }

    // Check if review already exists for this booking
    const existingReview = await Review.findOne({ booking: bookingId });
    if (existingReview) {
      return next(new ErrorResponse('You have already reviewed this booking', 400));
    }

    const review = await Review.create({
      player: req.user.id,
      turf: turfId,
      booking: bookingId,
      rating,
      comment: comment || '',
    });

    const populatedReview = await Review.findById(review._id).populate(
      'player',
      'name avatar'
    );

    res.status(201).json({
      success: true,
      review: populatedReview,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get reviews for a turf
// @route   GET /api/reviews/turf/:turfId
// @access  Public
const getTurfReviews = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const total = await Review.countDocuments({ turf: req.params.turfId });

    const reviews = await Review.find({ turf: req.params.turfId })
      .populate('player', 'name avatar')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      reviews,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a review
// @route   DELETE /api/reviews/:id
// @access  Private
const deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return next(new ErrorResponse('Review not found', 404));
    }

    // Check if user is the review author or admin
    if (review.player.toString() !== req.user.id && req.user.role !== 'admin') {
      return next(new ErrorResponse('Not authorized to delete this review', 403));
    }

    const turfId = review.turf;

    await Review.findOneAndDelete({ _id: req.params.id });

    // Recalculate turf rating (handled by post-findOneAndDelete hook, but also call manually for safety)
    await Review.calcAverageRating(turfId);

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createReview,
  getTurfReviews,
  deleteReview,
};
