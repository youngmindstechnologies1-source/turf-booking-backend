const User = require('../models/User');
const Turf = require('../models/Turf');
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const { ErrorResponse } = require('../middleware/errorHandler');

// @desc    Get pending turfs
// @route   GET /api/admin/turfs/pending
// @access  Private (admin)
const getPendingTurfs = async (req, res, next) => {
  try {
    const turfs = await Turf.find({ status: 'pending' })
      .populate('owner', 'name email phone')
      .sort('createdAt');

    res.status(200).json({
      success: true,
      count: turfs.length,
      turfs,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve a turf
// @route   PUT /api/admin/turfs/:id/approve
// @access  Private (admin)
const approveTurf = async (req, res, next) => {
  try {
    const turf = await Turf.findById(req.params.id);

    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }

    turf.status = 'approved';
    await turf.save();

    res.status(200).json({
      success: true,
      turf,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject a turf
// @route   PUT /api/admin/turfs/:id/reject
// @access  Private (admin)
const rejectTurf = async (req, res, next) => {
  try {
    const turf = await Turf.findById(req.params.id);

    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }

    turf.status = 'rejected';
    turf.adminNotes = req.body.adminNotes || '';
    await turf.save();

    res.status(200).json({
      success: true,
      turf,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (admin)
const getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const filter = {};

    // Role filter
    if (req.query.role) {
      filter.role = req.query.role;
    }

    // Search by name or email
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [{ name: searchRegex }, { email: searchRegex }];
    }

    const total = await User.countDocuments(filter);

    const users = await User.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      users,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle user active status
// @route   PUT /api/admin/users/:id/toggle-active
// @access  Private (admin)
const toggleUserActive = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all bookings (admin)
// @route   GET /api/admin/bookings
// @access  Private (admin)
const getAllBookings = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const filter = {};

    // Status filter
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) {
        filter.date.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filter.date.$lte = new Date(req.query.endDate);
      }
    }

    const total = await Booking.countDocuments(filter);

    const bookings = await Booking.find(filter)
      .populate('player', 'name email')
      .populate('turf', 'name city')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: bookings.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      bookings,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin cancel booking
// @route   PUT /api/admin/bookings/:id/cancel
// @access  Private (admin)
const adminCancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    if (booking.status === 'cancelled') {
      return next(new ErrorResponse('Booking is already cancelled', 400));
    }

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
      message: 'Booking cancelled by admin',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get platform stats
// @route   GET /api/admin/stats
// @access  Private (admin)
const getStats = async (req, res, next) => {
  try {
    const now = new Date();

    // Start of this week (Monday)
    const startOfWeek = new Date(now);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(startOfWeek.getDate() - diff);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of last week
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    // End of last week
    const endOfLastWeek = new Date(startOfWeek);
    endOfLastWeek.setMilliseconds(-1);

    // Start of this month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalOwners,
      totalPlayers,
      totalTurfs,
      pendingTurfs,
      totalBookings,
      bookingsThisWeek,
      bookingsLastWeek,
      revenueThisMonth,
      recentBookings,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'owner' }),
      User.countDocuments({ role: 'player' }),
      Turf.countDocuments({ status: 'approved' }),
      Turf.countDocuments({ status: 'pending' }),
      Booking.countDocuments(),
      Booking.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Booking.countDocuments({
        createdAt: { $gte: startOfLastWeek, $lte: endOfLastWeek },
      }),
      Booking.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfMonth },
            status: { $ne: 'cancelled' },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' },
          },
        },
      ]),
      Booking.find()
        .populate('player', 'name email')
        .populate('turf', 'name city')
        .sort('-createdAt')
        .limit(10),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalOwners,
        totalPlayers,
        totalTurfs,
        pendingTurfs,
        totalBookings,
        bookingsThisWeek,
        bookingsLastWeek,
        revenueThisMonth:
          revenueThisMonth.length > 0 ? revenueThisMonth[0].total : 0,
        recentBookings,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPendingTurfs,
  approveTurf,
  rejectTurf,
  getUsers,
  toggleUserActive,
  getAllBookings,
  adminCancelBooking,
  getStats,
};
