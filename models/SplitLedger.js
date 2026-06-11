const mongoose = require('mongoose');

const splitLedgerSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Ledger entry must belong to a booking'],
    },
    playerLabel: {
      type: String,
      required: [true, 'Player label is required'],
      trim: true,
    },
    playerName: {
      type: String,
      trim: true,
    },
    shareAmount: {
      type: Number,
      required: [true, 'Share amount is required'],
      min: [0, 'Share amount cannot be negative'],
    },
    status: {
      type: String,
      enum: [
        'unpaid',            // Initial state
        'verified_by_host',  // Host self-confirmed payment
        'utr_submitted',     // Friend submitted UPI reference
        'pay_at_turf',       // Friend chose to pay cash at venue
        'settled',           // Owner verified payment
      ],
      default: 'unpaid',
    },
    utrNumber: {
      type: String,
      trim: true,
    },
    utrSubmittedAt: {
      type: Date,
    },
    isHost: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Indexes
splitLedgerSchema.index({ booking: 1, sortOrder: 1 });
splitLedgerSchema.index({ utrNumber: 1 });

module.exports = mongoose.model('SplitLedger', splitLedgerSchema);
