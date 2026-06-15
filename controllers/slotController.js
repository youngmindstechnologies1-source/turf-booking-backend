const Slot = require('../models/Slot');
const Turf = require('../models/Turf');
const generateSlotsForDateRange = require('../utils/generateSlots');
const { ErrorResponse } = require('../middleware/errorHandler');

// @desc    Generate slots for a turf
// @route   POST /api/slots/generate
// @access  Private (owner)
const generateSlots = async (req, res, next) => {
  try {
    const { turfId, startDate, endDate } = req.body;

    if (!turfId || !startDate || !endDate) {
      return next(new ErrorResponse('Please provide turfId, startDate, and endDate', 400));
    }

    const turf = await Turf.findById(turfId);
    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }

    // Check ownership
    if (turf.owner.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to generate slots for this turf', 403));
    }

    const count = await generateSlotsForDateRange(turf, startDate, endDate);

    res.status(201).json({
      success: true,
      count,
      message: `${count} slots generated successfully`,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get slots for a turf on a specific date
// @route   GET /api/slots/:turfId
// @access  Public
const getSlots = async (req, res, next) => {
  try {
    const { turfId } = req.params;
    const { date } = req.query;

    if (!date) {
      return next(new ErrorResponse('Please provide a date query parameter', 400));
    }

    const queryDate = new Date(date);
    queryDate.setUTCHours(0, 0, 0, 0);

    const nextDay = new Date(queryDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const slots = await Slot.find({
      turf: turfId,
      date: { $gte: queryDate, $lt: nextDay },
    }).sort('startTime');

    res.status(200).json({
      success: true,
      count: slots.length,
      slots,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update slot price
// @route   PUT /api/slots/:id/price
// @access  Private (owner)
const updateSlotPrice = async (req, res, next) => {
  try {
    const { price } = req.body;

    if (price === undefined || price < 0) {
      return next(new ErrorResponse('Please provide a valid price', 400));
    }

    const slot = await Slot.findById(req.params.id).populate('turf', 'owner');

    if (!slot) {
      return next(new ErrorResponse('Slot not found', 404));
    }

    // Check turf ownership
    if (slot.turf.owner.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to update this slot', 403));
    }

    slot.price = price;
    await slot.save();

    res.status(200).json({
      success: true,
      slot,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Block slots for a turf in a date range
// @route   PUT /api/slots/block
// @access  Private (owner)
const blockSlots = async (req, res, next) => {
  try {
    const { turfId, startDate, endDate, reason } = req.body;

    if (!turfId || !startDate || !endDate) {
      return next(new ErrorResponse('Please provide turfId, startDate, and endDate', 400));
    }

    const turf = await Turf.findById(turfId);
    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }

    if (turf.owner.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to block slots for this turf', 403));
    }

    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    const result = await Slot.updateMany(
      {
        turf: turfId,
        date: { $gte: start, $lte: end },
        status: 'available',
      },
      {
        status: 'blocked',
        blockedReason: reason || 'Blocked by owner',
      }
    );

    res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: `${result.modifiedCount} slots blocked`,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Unblock slots for a turf in a date range
// @route   PUT /api/slots/unblock
// @access  Private (owner)
const unblockSlots = async (req, res, next) => {
  try {
    const { turfId, startDate, endDate } = req.body;

    if (!turfId || !startDate || !endDate) {
      return next(new ErrorResponse('Please provide turfId, startDate, and endDate', 400));
    }

    const turf = await Turf.findById(turfId);
    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }

    if (turf.owner.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to unblock slots for this turf', 403));
    }

    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    const result = await Slot.updateMany(
      {
        turf: turfId,
        date: { $gte: start, $lte: end },
        status: 'blocked',
      },
      {
        status: 'available',
        $unset: { blockedReason: '' },
      }
    );

    res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: `${result.modifiedCount} slots unblocked`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateSlots,
  getSlots,
  updateSlotPrice,
  blockSlots,
  unblockSlots,
};
