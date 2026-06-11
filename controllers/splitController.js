const SplitLedger = require('../models/SplitLedger');
const Booking = require('../models/Booking');
const { ErrorResponse } = require('../middleware/errorHandler');

// @desc    Get split status board (public landing page data)
// @route   GET /api/split/:bookingRef
// @access  Public
const getSplitStatus = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ bookingRef: req.params.bookingRef })
      .populate('turf', 'name city address photos upiVpa upiDisplayName')
      .populate('player', 'name');

    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    const ledger = await SplitLedger.find({ booking: booking._id })
      .sort('sortOrder');

    // Calculate time remaining for split lock
    let timeRemainingMs = 0;
    if (booking.splitLockExpiresAt) {
      timeRemainingMs = Math.max(0, booking.splitLockExpiresAt.getTime() - Date.now());
    }

    res.status(200).json({
      success: true,
      booking: {
        bookingRef: booking.bookingRef,
        turfName: booking.turf?.name || 'Turf',
        turfCity: booking.turf?.city || '',
        turfAddress: booking.turf?.address || '',
        turfPhoto: booking.turf?.photos?.[0] || null,
        upiVpa: booking.turf?.upiVpa || '',
        upiDisplayName: booking.turf?.upiDisplayName || booking.turf?.name || 'Turf',
        hostName: booking.player?.name || 'Host',
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        sport: booking.sport,
        totalAmount: booking.totalAmount,
        splitAmount: booking.splitAmount,
        playerCount: booking.playerCount,
        paymentMode: booking.paymentMode,
        status: booking.status,
        cashOutstanding: booking.cashOutstanding,
        onlineCollected: booking.onlineCollected,
        timeRemainingMs,
      },
      ledger,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Submit UTR number after UPI payment
// @route   POST /api/split/:bookingRef/submit-utr
// @access  Public
const submitUtr = async (req, res, next) => {
  try {
    const { ledgerId, playerName, utrNumber } = req.body;

    if (!ledgerId || !utrNumber) {
      return next(new ErrorResponse('Please provide ledgerId and utrNumber', 400));
    }

    // Validate UTR format: 12-digit numeric
    const utrClean = utrNumber.trim();
    if (!/^\d{12}$/.test(utrClean)) {
      return next(new ErrorResponse('UTR number must be exactly 12 digits', 400));
    }

    const booking = await Booking.findOne({ bookingRef: req.params.bookingRef });
    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    const ledgerEntry = await SplitLedger.findOne({
      _id: ledgerId,
      booking: booking._id,
    });

    if (!ledgerEntry) {
      return next(new ErrorResponse('Ledger entry not found', 404));
    }

    if (ledgerEntry.status === 'settled') {
      return next(new ErrorResponse('This share has already been settled', 400));
    }

    // Update ledger entry
    ledgerEntry.utrNumber = utrClean;
    ledgerEntry.utrSubmittedAt = new Date();
    ledgerEntry.status = 'utr_submitted';
    if (playerName) {
      ledgerEntry.playerName = playerName.trim();
    }
    await ledgerEntry.save();

    // Recalculate booking totals
    await recalculateBookingTotals(booking._id);

    res.status(200).json({
      success: true,
      message: 'UTR submitted successfully',
      ledgerEntry,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark player as "Pay Cash at Turf"
// @route   POST /api/split/:bookingRef/pay-cash
// @access  Public
const markPayCash = async (req, res, next) => {
  try {
    const { ledgerId, playerName } = req.body;

    if (!ledgerId) {
      return next(new ErrorResponse('Please provide ledgerId', 400));
    }

    const booking = await Booking.findOne({ bookingRef: req.params.bookingRef });
    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    const ledgerEntry = await SplitLedger.findOne({
      _id: ledgerId,
      booking: booking._id,
    });

    if (!ledgerEntry) {
      return next(new ErrorResponse('Ledger entry not found', 404));
    }

    if (ledgerEntry.status === 'settled') {
      return next(new ErrorResponse('This share has already been settled', 400));
    }

    ledgerEntry.status = 'pay_at_turf';
    if (playerName) {
      ledgerEntry.playerName = playerName.trim();
    }
    await ledgerEntry.save();

    // Recalculate booking totals
    await recalculateBookingTotals(booking._id);

    res.status(200).json({
      success: true,
      message: 'Marked as pay at turf',
      ledgerEntry,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Host confirms their own payment
// @route   POST /api/split/:bookingRef/host-confirm
// @access  Public
const hostConfirm = async (req, res, next) => {
  try {
    const { ledgerId } = req.body;

    if (!ledgerId) {
      return next(new ErrorResponse('Please provide ledgerId', 400));
    }

    const booking = await Booking.findOne({ bookingRef: req.params.bookingRef });
    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    const ledgerEntry = await SplitLedger.findOne({
      _id: ledgerId,
      booking: booking._id,
      isHost: true,
    });

    if (!ledgerEntry) {
      return next(new ErrorResponse('Host ledger entry not found', 404));
    }

    ledgerEntry.status = 'verified_by_host';
    await ledgerEntry.save();

    // Recalculate booking totals
    await recalculateBookingTotals(booking._id);

    res.status(200).json({
      success: true,
      message: 'Host payment confirmed',
      ledgerEntry,
    });
  } catch (error) {
    next(error);
  }
};

// Helper: Recalculate booking online/cash totals from ledger
const recalculateBookingTotals = async (bookingId) => {
  const ledgerEntries = await SplitLedger.find({ booking: bookingId });

  let onlineCollected = 0;
  let cashOutstanding = 0;

  for (const entry of ledgerEntries) {
    if (
      entry.status === 'utr_submitted' ||
      entry.status === 'verified_by_host' ||
      entry.status === 'settled'
    ) {
      onlineCollected += entry.shareAmount;
    } else if (entry.status === 'pay_at_turf') {
      cashOutstanding += entry.shareAmount;
    } else {
      // unpaid — still outstanding but not yet categorized
    }
  }

  // Check if all players have acted
  const allActed = ledgerEntries.every(
    (e) => e.status !== 'unpaid'
  );

  const updateData = {
    onlineCollected,
    cashOutstanding,
  };

  // If all players have paid or marked cash, confirm the booking
  if (allActed) {
    const booking = await Booking.findById(bookingId);
    if (booking && booking.status === 'pending_split') {
      updateData.status = 'confirmed';
    }
  }

  await Booking.findByIdAndUpdate(bookingId, updateData);
};

module.exports = {
  getSplitStatus,
  submitUtr,
  markPayCash,
  hostConfirm,
  recalculateBookingTotals,
};
