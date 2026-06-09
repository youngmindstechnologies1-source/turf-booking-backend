const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema(
  {
    turf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turf',
      required: [true, 'Slot must belong to a turf'],
    },
    date: {
      type: Date,
      required: [true, 'Slot must have a date'],
    },
    startTime: {
      type: String,
      required: [true, 'Slot must have a start time'],
    },
    endTime: {
      type: String,
      required: [true, 'Slot must have an end time'],
    },
    status: {
      type: String,
      enum: ['available', 'booked', 'blocked'],
      default: 'available',
    },
    price: {
      type: Number,
      required: [true, 'Slot must have a price'],
      min: [0, 'Price cannot be negative'],
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    blockedReason: {
      type: String,
    },
  },
  { timestamps: true }
);

// Indexes
slotSchema.index({ turf: 1, date: 1, startTime: 1 }, { unique: true });
slotSchema.index({ turf: 1, date: 1, status: 1 });
slotSchema.index({ booking: 1 });

module.exports = mongoose.model('Slot', slotSchema);
