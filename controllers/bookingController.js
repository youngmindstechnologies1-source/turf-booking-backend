const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const Turf = require('../models/Turf');
const SplitLedger = require('../models/SplitLedger');
const { ErrorResponse } = require('../middleware/errorHandler');

// @desc    Create a booking
// @route   POST /api/bookings
// @access  Private (player)
const createBooking = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { turfId, slotIds, sport, paymentMode, playerCount, notes } = req.body;

    if (!turfId || !slotIds || !Array.isArray(slotIds) || slotIds.length === 0 || !sport) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Please provide turfId, slotIds, and sport', 400));
    }

    const mode = paymentMode || 'cash';
    const numPlayers = Math.max(1, parseInt(playerCount) || 1);

    // Verify turf exists
    const turf = await Turf.findById(turfId).session(session);
    if (!turf) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Turf not found', 404));
    }

    // For UPI split, turf must have a VPA configured
    if (mode === 'upi_split' && !turf.upiVpa) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('This turf does not have UPI payments configured', 400));
    }

    // Try to book the slots atomically
    const result = await Slot.updateMany(
      {
        _id: { $in: slotIds },
        status: 'available',
      },
      {
        status: 'booked',
      },
      { session }
    );

    if (result.modifiedCount !== slotIds.length) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Some slots are no longer available', 409));
    }

    // Get slot details for booking info
    const slots = await Slot.find({ _id: { $in: slotIds } })
      .sort('startTime')
      .session(session);

    const totalAmount = slots.reduce((sum, slot) => sum + slot.price, 0);
    const date = slots[0].date;
    const startTime = slots[0].startTime;
    const endTime = slots[slots.length - 1].endTime;

    const splitAmount = Math.ceil(totalAmount / numPlayers);

    // Build booking data
    const bookingData = {
      player: req.user.id,
      turf: turfId,
      slots: slotIds,
      sport,
      date,
      startTime,
      endTime,
      totalAmount,
      paymentMode: mode,
      playerCount: numPlayers,
      splitAmount,
      notes: notes || '',
    };

    if (mode === 'cash') {
      // Cash: immediately confirmed, full amount outstanding
      bookingData.status = 'confirmed';
      bookingData.cashOutstanding = totalAmount;
      bookingData.onlineCollected = 0;
    } else {
      // UPI Split: pending, 15-minute lock
      bookingData.status = 'pending_split';
      bookingData.splitLockExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      bookingData.cashOutstanding = 0;
      bookingData.onlineCollected = 0;
    }

    // Create booking
    const booking = await Booking.create([bookingData], { session });

    // Update slots with booking reference
    await Slot.updateMany(
      { _id: { $in: slotIds } },
      { booking: booking[0]._id },
      { session }
    );

    // Create SplitLedger rows
    const ledgerEntries = [];
    for (let i = 0; i < numPlayers; i++) {
      ledgerEntries.push({
        booking: booking[0]._id,
        playerLabel: i === 0 ? `${req.user.name} (Host)` : `Player ${i + 1}`,
        playerName: i === 0 ? req.user.name : '',
        shareAmount: splitAmount,
        status: 'unpaid',
        isHost: i === 0,
        sortOrder: i,
      });
    }

    await SplitLedger.insertMany(ledgerEntries, { session });

    await session.commitTransaction();
    session.endSession();

    const populatedBooking = await Booking.findById(booking[0]._id)
      .populate('turf', 'name city address photos upiVpa upiDisplayName')
      .populate('slots');

    const ledger = await SplitLedger.find({ booking: booking[0]._id })
      .sort('sortOrder');

    res.status(201).json({
      success: true,
      booking: populatedBooking,
      ledger,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// @desc    Get my bookings
// @route   GET /api/bookings/my-bookings
// @access  Private
const getMyBookings = async (req, res, next) => {
  try {
    // Auto-mark past confirmed bookings as completed
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    await Booking.updateMany(
      {
        player: req.user.id,
        status: { $in: ['confirmed', 'fully_settled'] },
        date: { $lt: now },
      },
      { status: 'completed' }
    );

    const bookings = await Booking.find({ player: req.user.id })
      .populate('turf', 'name city photos address')
      .populate('slots')
      .sort('-createdAt');

    const userMatches = await mongoose.model('Match').find({ host: req.user.id });
    const matchMap = {};
    userMatches.forEach(m => {
      matchMap[m.booking.toString()] = m._id;
    });

    const bookingsWithMatch = bookings.map(b => {
      const bObj = b.toObject();
      const matchId = matchMap[b._id.toString()];
      return {
        ...bObj,
        isHosted: !!matchId,
        matchId: matchId || null
      };
    });

    res.status(200).json({
      success: true,
      count: bookings.length,
      bookings: bookingsWithMatch,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get bookings for a turf (owner view)
// @route   GET /api/bookings/turf/:turfId
// @access  Private (owner)
const getTurfBookings = async (req, res, next) => {
  try {
    const turf = await Turf.findById(req.params.turfId);

    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }

    if (turf.owner.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to view bookings for this turf', 403));
    }

    const filter = { turf: req.params.turfId };

    // Optional date filter
    if (req.query.date) {
      const filterDate = new Date(req.query.date);
      filterDate.setUTCHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      filter.date = { $gte: filterDate, $lt: nextDay };
    }

    const bookings = await Booking.find(filter)
      .populate('player', 'name email phone')
      .populate('slots')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
const getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('turf', 'name city address photos owner upiVpa upiDisplayName')
      .populate('player', 'name email phone')
      .populate('slots');

    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    // Check access: must be the player or the turf owner
    const isPlayer = booking.player._id.toString() === req.user.id;
    const isTurfOwner = booking.turf.owner.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isPlayer && !isTurfOwner && !isAdmin) {
      return next(new ErrorResponse('Not authorized to view this booking', 403));
    }

    const match = await mongoose.model('Match').findOne({ booking: booking._id });

    res.status(200).json({
      success: true,
      booking,
      isHosted: !!match,
      matchId: match ? match._id : null,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
const cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    // Check if player is the owner of this booking
    if (booking.player.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to cancel this booking', 403));
    }

    if (!['confirmed', 'pending_split'].includes(booking.status)) {
      return next(new ErrorResponse('Only confirmed or pending bookings can be cancelled', 400));
    }

    // Check if booking date is in the future
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const bookingDate = new Date(booking.date);
    bookingDate.setUTCHours(0, 0, 0, 0);

    if (bookingDate <= now) {
      return next(new ErrorResponse('Cannot cancel a booking for today or past dates', 400));
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();

    // Release slots
    await Slot.updateMany(
      { _id: { $in: booking.slots } },
      {
        status: 'available',
        booking: null,
      }
    );

    // Clean up ledger entries
    await SplitLedger.deleteMany({ booking: booking._id });

    res.status(200).json({
      success: true,
      booking,
      message: 'Booking cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Settle booking (owner marks as fully settled at check-in)
// @route   PUT /api/bookings/:id/settle
// @access  Private (owner)
const settleBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('turf', 'owner');

    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    if (booking.turf.owner.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to settle this booking', 403));
    }

    if (['cancelled', 'fully_settled'].includes(booking.status)) {
      return next(new ErrorResponse(`Cannot settle a ${booking.status} booking`, 400));
    }

    // Mark all ledger entries as settled
    await SplitLedger.updateMany(
      { booking: booking._id },
      { status: 'settled' }
    );

    // Update booking
    booking.status = 'fully_settled';
    booking.settledAt = new Date();
    booking.settledBy = req.user.id;
    booking.onlineCollected = booking.totalAmount - (booking.cashOutstanding || 0);
    await booking.save();

    res.status(200).json({
      success: true,
      booking,
      message: 'Booking settled successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get split details for a booking
// @route   GET /api/bookings/:id/split-details
// @access  Private
const getSplitDetails = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('turf', 'name owner upiVpa upiDisplayName')
      .populate('player', 'name email phone');

    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    // Check access
    const isPlayer = booking.player._id.toString() === req.user.id;
    const isTurfOwner = booking.turf.owner.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isPlayer && !isTurfOwner && !isAdmin) {
      return next(new ErrorResponse('Not authorized', 403));
    }

    const ledger = await SplitLedger.find({ booking: booking._id })
      .sort('sortOrder');

    res.status(200).json({
      success: true,
      booking,
      ledger,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  getTurfBookings,
  getBooking,
  cancelBooking,
  settleBooking,
  getSplitDetails,
};
