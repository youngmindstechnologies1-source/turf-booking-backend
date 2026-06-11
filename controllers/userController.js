const User = require('../models/User');
const Match = require('../models/Match');
const { ErrorResponse } = require('../middleware/errorHandler');

// @desc    Get user profile details
// @route   GET /api/users/profile/:id
// @access  Private
const getUserProfile = async (req, res, next) => {
  try {
    const userId = req.params.id;

    const targetUser = await User.findById(userId)
      .select('-password')
      .populate('following', 'name email avatar skillLevel');

    if (!targetUser) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Calculate followers count (users who are following targetUser)
    const followersCount = await User.countDocuments({ following: userId });

    // Check if current logged-in user is following targetUser
    const currentUser = await User.findById(req.user.id);
    const isFollowing = currentUser.following.includes(userId);

    // Fetch matches hosted by this user
    const hostedMatches = await Match.find({ host: userId })
      .populate('turf', 'name city address photos')
      .sort('-date');

    // Fetch matches joined by this user
    const joinedMatches = await Match.find({ 'joinedPlayers.user': userId })
      .populate('turf', 'name city address photos')
      .populate('host', 'name avatar')
      .sort('-date');

    res.status(200).json({
      success: true,
      profile: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        phone: targetUser.phone,
        avatar: targetUser.avatar,
        skillLevel: targetUser.skillLevel,
        role: targetUser.role,
        followingCount: targetUser.following.length,
        followersCount,
        isFollowing,
        hostedMatches,
        joinedMatches,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Follow/Unfollow a user
// @route   POST /api/users/follow/:id
// @access  Private
const toggleFollow = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;

    if (targetUserId === req.user.id) {
      return next(new ErrorResponse('You cannot follow yourself', 400));
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return next(new ErrorResponse('User to follow not found', 404));
    }

    const currentUser = await User.findById(req.user.id);
    const isFollowing = currentUser.following.includes(targetUserId);

    if (isFollowing) {
      // Unfollow
      currentUser.following.pull(targetUserId);
      await currentUser.save();
      res.status(200).json({
        success: true,
        message: `Successfully unfollowed ${targetUser.name}`,
        isFollowing: false,
      });
    } else {
      // Follow
      currentUser.following.push(targetUserId);
      await currentUser.save();
      res.status(200).json({
        success: true,
        message: `Successfully followed ${targetUser.name}`,
        isFollowing: true,
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Search players by name or email
// @route   GET /api/users/search
// @access  Private
const searchPlayers = async (req, res, next) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(200).json({ success: true, players: [] });
    }

    const players = await User.find({
      _id: { $ne: req.user.id },
      role: 'player',
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ],
    })
      .select('name email avatar skillLevel')
      .limit(10);

    res.status(200).json({
      success: true,
      players,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserProfile,
  toggleFollow,
  searchPlayers,
};
