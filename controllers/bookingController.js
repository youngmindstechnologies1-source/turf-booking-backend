const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const Turf = require('../models/Turf');
const { ErrorResponse } = require('../middleware/errorHandler');

// @desc    Create a booking
// @route   POST /api/bookings
// @access  Private (player)
const createBooking = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { turfId, slotIds, sport, paymentMode, notes } = req.body;

    if (!turfId || !slotIds || !Array.isArray(slotIds) || slotIds.length === 0 || !sport) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Please provide turfId, slotIds, and sport', 400));
    }

    // Verify turf exists
    const turf = await Turf.findById(turfId).session(session);
    if (!turf) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Turf not found', 404));
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

    // Create booking
    const booking = await Booking.create(
      [
        {
          player: req.user.id,
          turf: turfId,
          slots: slotIds,
          sport,
          date,
          startTime,
          endTime,
          totalAmount,
          paymentMode: paymentMode || 'venue',
          notes: notes || '',
        },
      ],
      { session }
    );

    // Update slots with booking reference
    await Slot.updateMany(
      { _id: { $in: slotIds } },
      { booking: booking[0]._id },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    const populatedBooking = await Booking.findById(booking[0]._id)
      .populate('turf', 'name city address photos')
      .populate('slots');

    res.status(201).json({
      success: true,
      booking: populatedBooking,
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
    now.setHours(0, 0, 0, 0);

    await Booking.updateMany(
      {
        player: req.user.id,
        status: 'confirmed',
        date: { $lt: now },
      },
      { status: 'completed' }
    );

    const bookings = await Booking.find({ player: req.user.id })
      .populate('turf', 'name city photos address')
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
      filterDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setDate(nextDay.getDate() + 1);
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
      .populate('turf', 'name city address photos owner')
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

    res.status(200).json({
      success: true,
      booking,
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

    if (booking.status !== 'confirmed') {
      return next(new ErrorResponse('Only confirmed bookings can be cancelled', 400));
    }

    // Check if booking date is in the future
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const bookingDate = new Date(booking.date);
    bookingDate.setHours(0, 0, 0, 0);

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

    res.status(200).json({
      success: true,
      booking,
      message: 'Booking cancelled successfully',
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
};
