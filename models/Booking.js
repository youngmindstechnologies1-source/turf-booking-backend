const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const bookingSchema = new mongoose.Schema(
  {
    bookingRef: {
      type: String,
      unique: true,
    },
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Booking must have a player'],
    },
    turf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turf',
      required: [true, 'Booking must have a turf'],
    },
    slots: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Slot',
      },
    ],
    sport: {
      type: String,
      required: [true, 'Please specify the sport'],
    },
    date: {
      type: Date,
      required: [true, 'Booking must have a date'],
    },
    startTime: {
      type: String,
      required: [true, 'Booking must have a start time'],
    },
    endTime: {
      type: String,
      required: [true, 'Booking must have an end time'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Booking must have a total amount'],
      min: [0, 'Total amount cannot be negative'],
    },
    status: {
      type: String,
      enum: [
        'confirmed',       // Cash booking — pay at venue
        'pending_split',   // UPI split initiated, waiting for payments
        'completed',       // Past booking
        'cancelled',       // Cancelled
        'fully_settled',   // All payments verified by owner
      ],
      default: 'confirmed',
    },
    paymentMode: {
      type: String,
      enum: ['cash', 'upi_split'],
      default: 'cash',
    },
    // --- Split Payment Fields ---
    playerCount: {
      type: Number,
      min: 1,
      default: 1,
    },
    splitAmount: {
      type: Number,
      default: 0,
    },
    splitLockExpiresAt: {
      type: Date,
    },
    cashOutstanding: {
      type: Number,
      default: 0,
    },
    onlineCollected: {
      type: Number,
      default: 0,
    },
    settledAt: {
      type: Date,
    },
    settledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
    },
    cancelledAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Indexes
bookingSchema.index({ bookingRef: 1 }, { unique: true });
bookingSchema.index({ player: 1, status: 1 });
bookingSchema.index({ turf: 1, date: 1 });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ status: 1, splitLockExpiresAt: 1 });

// Generate booking reference before saving
bookingSchema.pre('save', function (next) {
  if (this.isNew) {
    this.bookingRef = 'TB-' + nanoid(10).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
