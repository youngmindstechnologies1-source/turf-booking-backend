const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Review must have a player'],
    },
    turf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turf',
      required: [true, 'Review must belong to a turf'],
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Review must be linked to a booking'],
    },
    rating: {
      type: Number,
      required: [true, 'Please provide a rating'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, 'Comment cannot exceed 500 characters'],
    },
  },
  { timestamps: true }
);

// Indexes
reviewSchema.index({ turf: 1, createdAt: -1 });
reviewSchema.index({ player: 1 });
reviewSchema.index({ booking: 1 }, { unique: true });

// Static method to calculate average rating
reviewSchema.statics.calcAverageRating = async function (turfId) {
  const result = await this.aggregate([
    { $match: { turf: turfId } },
    {
      $group: {
        _id: '$turf',
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  try {
    if (result.length > 0) {
      await mongoose.model('Turf').findByIdAndUpdate(turfId, {
        averageRating: Math.round(result[0].averageRating * 10) / 10,
        reviewCount: result[0].reviewCount,
      });
    } else {
      await mongoose.model('Turf').findByIdAndUpdate(turfId, {
        averageRating: 0,
        reviewCount: 0,
      });
    }
  } catch (err) {
    console.error('Error calculating average rating:', err);
  }
};

// Post-save hook: recalculate rating
reviewSchema.post('save', function () {
  this.constructor.calcAverageRating(this.turf);
});

// Post-findOneAndDelete hook: recalculate rating
reviewSchema.post('findOneAndDelete', function (doc) {
  if (doc) {
    doc.constructor.calcAverageRating(doc.turf);
  }
});

module.exports = mongoose.model('Review', reviewSchema);
