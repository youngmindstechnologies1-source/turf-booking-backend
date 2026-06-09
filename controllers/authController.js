const User = require('../models/User');
const { ErrorResponse } = require('../middleware/errorHandler');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return next(new ErrorResponse('Please provide name, email, and password', 400));
    }

    // Check if allowed role
    const allowedRoles = ['player', 'owner'];
    if (role && !allowedRoles.includes(role)) {
      return next(new ErrorResponse('Invalid role. Must be player or owner', 400));
    }

    // Check if email exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new ErrorResponse('Email already registered', 400));
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'player',
    });

    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        favouriteTurfs: user.favouriteTurfs,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new ErrorResponse('Please provide email and password', 400));
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return next(new ErrorResponse('Invalid credentials', 401));
    }

    if (!user.isActive) {
      return next(new ErrorResponse('Your account has been deactivated', 401));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return next(new ErrorResponse('Invalid credentials', 401));
    }

    const token = user.generateAuthToken();

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        favouriteTurfs: user.favouriteTurfs,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged-in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('favouriteTurfs', 'name slug city photos pricePerHour averageRating');

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update profile
// @route   PUT /api/auth/update-profile
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const fieldsToUpdate = {};
    if (req.body.name) fieldsToUpdate.name = req.body.name;
    if (req.body.phone !== undefined) fieldsToUpdate.phone = req.body.phone;
    if (req.body.avatar !== undefined) fieldsToUpdate.avatar = req.body.avatar;

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true,
    }).populate('favouriteTurfs', 'name slug city photos pricePerHour averageRating');

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(new ErrorResponse('Please provide current and new password', 400));
    }

    if (newPassword.length < 6) {
      return next(new ErrorResponse('New password must be at least 6 characters', 400));
    }

    const user = await User.findById(req.user.id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return next(new ErrorResponse('Current password is incorrect', 401));
    }

    user.password = newPassword;
    await user.save();

    const token = user.generateAuthToken();

    res.status(200).json({
      success: true,
      token,
      message: 'Password updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle favourite turf
// @route   PUT /api/auth/favourites/:turfId
// @access  Private
const toggleFavourite = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const turfId = req.params.turfId;

    const index = user.favouriteTurfs.indexOf(turfId);

    if (index > -1) {
      // Remove from favourites
      user.favouriteTurfs.pull(turfId);
    } else {
      // Add to favourites
      user.favouriteTurfs.push(turfId);
    }

    await user.save();

    const updatedUser = await User.findById(req.user.id).populate(
      'favouriteTurfs',
      'name slug city photos pricePerHour averageRating'
    );

    res.status(200).json({
      success: true,
      favouriteTurfs: updatedUser.favouriteTurfs,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  toggleFavourite,
};
