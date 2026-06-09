const Turf = require('../models/Turf');
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const ApiFeatures = require('../utils/apiFeatures');
const { ErrorResponse } = require('../middleware/errorHandler');

// @desc    Get all turfs (approved & active)
// @route   GET /api/turfs
// @access  Public
const getTurfs = async (req, res, next) => {
  try {
    // Count total matching documents for pagination info
    const baseFilter = { status: 'approved', isActive: true };
    const countQuery = Turf.find(baseFilter);
    const countFeatures = new ApiFeatures(countQuery, req.query).search().filter();
    const total = await countFeatures.query.countDocuments();

    // Get paginated results
    const features = new ApiFeatures(Turf.find(baseFilter), req.query)
      .search()
      .filter()
      .sort()
      .paginate();

    const turfs = await features.query;

    const page = features.page || 1;
    const limit = features.limit || 12;
    const pages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      count: turfs.length,
      total,
      page,
      pages,
      turfs,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get turf by slug
// @route   GET /api/turfs/:slug
// @access  Public
const getTurfBySlug = async (req, res, next) => {
  try {
    const turf = await Turf.findOne({ slug: req.params.slug })
      .populate('owner', 'name email phone')
      .populate('reviews');

    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }

    res.status(200).json({
      success: true,
      turf,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create turf
// @route   POST /api/turfs
// @access  Private (owner)
const createTurf = async (req, res, next) => {
  try {
    req.body.owner = req.user.id;

    const turf = await Turf.create(req.body);

    res.status(201).json({
      success: true,
      turf,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update turf
// @route   PUT /api/turfs/:id
// @access  Private (owner)
const updateTurf = async (req, res, next) => {
  try {
    let turf = await Turf.findById(req.params.id);

    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }

    // Check ownership
    if (turf.owner.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to update this turf', 403));
    }

    // Don't allow updating owner or status through this endpoint
    delete req.body.owner;
    delete req.body.status;

    turf = await Turf.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      turf,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete turf
// @route   DELETE /api/turfs/:id
// @access  Private (owner)
const deleteTurf = async (req, res, next) => {
  try {
    const turf = await Turf.findById(req.params.id);

    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }

    // Check ownership
    if (turf.owner.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to delete this turf', 403));
    }

    // Delete associated slots, bookings, and reviews
    await Slot.deleteMany({ turf: turf._id });
    await Booking.deleteMany({ turf: turf._id });
    await Review.deleteMany({ turf: turf._id });
    await Turf.findByIdAndDelete(turf._id);

    res.status(200).json({
      success: true,
      message: 'Turf deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get turfs owned by current user
// @route   GET /api/turfs/owner/my-turfs
// @access  Private (owner)
const getMyTurfs = async (req, res, next) => {
  try {
    const turfs = await Turf.find({ owner: req.user.id }).sort('-createdAt');

    res.status(200).json({
      success: true,
      count: turfs.length,
      turfs,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload photos for turf
// @route   POST /api/turfs/:id/photos
// @access  Private (owner)
const uploadPhotos = async (req, res, next) => {
  try {
    const turf = await Turf.findById(req.params.id);

    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }

    // Check ownership
    if (turf.owner.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to upload photos for this turf', 403));
    }

    if (!req.files || req.files.length === 0) {
      return next(new ErrorResponse('Please upload at least one photo', 400));
    }

    const filePaths = req.files.map((file) => `/uploads/${file.filename}`);
    turf.photos.push(...filePaths);
    await turf.save();

    res.status(200).json({
      success: true,
      turf,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTurfs,
  getTurfBySlug,
  createTurf,
  updateTurf,
  deleteTurf,
  getMyTurfs,
  uploadPhotos,
};
