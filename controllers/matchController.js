const Match = require('../models/Match');
const Booking = require('../models/Booking');
const SplitLedger = require('../models/SplitLedger');
const User = require('../models/User');
const Turf = require('../models/Turf');
const Notification = require('../models/Notification');
const { ErrorResponse } = require('../middleware/errorHandler');
const { recalculateBookingTotals } = require('./splitController');

// @desc    Host a match from an existing booking
// @route   POST /api/matches/host
// @access  Private
const hostMatch = async (req, res, next) => {
  try {
    const { bookingId, title, description, skillLevel, maxPlayers, hostTeamCount } = req.body;

    if (!bookingId || !title || !maxPlayers || !hostTeamCount) {
      return next(new ErrorResponse('Please provide bookingId, title, maxPlayers, and hostTeamCount', 400));
    }

    const booking = await Booking.findById(bookingId).populate('turf', 'name');
    if (!booking) {
      return next(new ErrorResponse('Booking not found', 404));
    }

    // Check ownership
    if (booking.player.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to host this match', 403));
    }

    if (hostTeamCount > maxPlayers) {
      return next(new ErrorResponse('Host team count cannot exceed max players limit', 400));
    }

    // Check if match already exists
    let match = await Match.findOne({ booking: bookingId });
    if (match) {
      return next(new ErrorResponse('This booking is already listed as an open match', 400));
    }

    // Create match
    match = await Match.create({
      booking: bookingId,
      host: req.user.id,
      turf: booking.turf._id,
      title,
      description,
      sport: booking.sport,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      skillLevel: skillLevel || 'all',
      maxPlayers,
      hostTeamCount,
      joinedPlayers: [],
    });

    // Adjust the booking's playerCount and split amount to match maxPlayers
    if (booking.playerCount !== maxPlayers) {
      const splitAmount = Math.ceil(booking.totalAmount / maxPlayers);
      booking.playerCount = maxPlayers;
      booking.splitAmount = splitAmount;
      await booking.save();

      // Recalculate ledger entry share amounts
      const existingLedger = await SplitLedger.find({ booking: bookingId });
      
      // Update existing entries
      for (const entry of existingLedger) {
        entry.shareAmount = splitAmount;
        await entry.save();
      }

      // If existing entries count is less than hostTeamCount, add the missing ledger entries for host's team
      if (existingLedger.length < hostTeamCount) {
        const missingCount = hostTeamCount - existingLedger.length;
        const newEntries = [];
        for (let i = 0; i < missingCount; i++) {
          const sortOrder = existingLedger.length + i;
          newEntries.push({
            booking: bookingId,
            playerLabel: `Player ${sortOrder + 1} (Host Team)`,
            playerName: '',
            shareAmount: splitAmount,
            status: 'unpaid',
            isHost: false,
            sortOrder,
          });
        }
        await SplitLedger.insertMany(newEntries);
      }
      
      // Recalculate totals
      await recalculateBookingTotals(bookingId);
    }

    // Notify host followers
    const followers = await User.find({ following: req.user.id });
    const notifications = followers.map((f) => ({
      recipient: f._id,
      sender: req.user.id,
      message: `${req.user.name} just hosted a match at ${booking.turf.name}! Tap to join.`,
      type: 'match_hosted',
      link: `/matches/${match._id}`,
    }));
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    res.status(201).json({
      success: true,
      match,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all open matches
// @route   GET /api/matches
// @access  Public
const getOpenMatches = async (req, res, next) => {
  try {
    let queryObj = {
      status: 'open',
      date: { $gte: new Date().setUTCHours(0, 0, 0, 0) },
    };

    if (req.query.sport) {
      queryObj.sport = req.query.sport;
    }

    if (req.query.skillLevel && req.query.skillLevel !== 'all') {
      queryObj.skillLevel = req.query.skillLevel;
    }

    if (req.query.city) {
      const turfs = await Turf.find({ city: req.query.city.toLowerCase() }).select('_id');
      queryObj.turf = { $in: turfs.map((t) => t._id) };
    }

    const matches = await Match.find(queryObj)
      .populate('turf', 'name city address photos pricePerHour')
      .populate('host', 'name avatar skillLevel')
      .sort('date startTime');

    res.status(200).json({
      success: true,
      count: matches.length,
      matches,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get match details
// @route   GET /api/matches/:id
// @access  Private
const getMatchDetails = async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('turf', 'name city address photos pricePerHour upiVpa upiDisplayName')
      .populate('host', 'name avatar skillLevel phone email')
      .populate('joinedPlayers.user', 'name avatar skillLevel phone email');

    if (!match) {
      return next(new ErrorResponse('Match not found', 404));
    }

    const booking = await Booking.findById(match.booking);

    res.status(200).json({
      success: true,
      match,
      booking,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Join an open match
// @route   POST /api/matches/:id/join
// @access  Private
const joinMatch = async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return next(new ErrorResponse('Match not found', 404));
    }

    if (match.status !== 'open') {
      return next(new ErrorResponse('This match is no longer open', 400));
    }

    // Check if player is already host
    if (match.host.toString() === req.user.id) {
      return next(new ErrorResponse('You are the host of this match', 400));
    }

    // Check if player already joined
    const alreadyJoined = match.joinedPlayers.some(
      (p) => p.user.toString() === req.user.id
    );
    if (alreadyJoined) {
      return next(new ErrorResponse('You have already joined this match', 400));
    }

    // Check headcount
    const currentHeadcount = match.hostTeamCount + match.joinedPlayers.length;
    if (currentHeadcount >= match.maxPlayers) {
      return next(new ErrorResponse('Match is already full', 400));
    }

    // Join match
    match.joinedPlayers.push({ user: req.user.id, joinedAt: new Date() });
    await match.save();

    // Create split ledger entry if booking uses upi_split
    const booking = await Booking.findById(match.booking);
    if (booking) {
      const existingLedger = await SplitLedger.find({ booking: booking._id });
      
      // We need to find or create a ledger entry for this player
      // Find an empty slot in the ledger first
      let emptyEntry = existingLedger.find(
        (entry) => !entry.isHost && !entry.playerName && entry.status === 'unpaid'
      );

      if (emptyEntry) {
        emptyEntry.playerName = req.user.name;
        emptyEntry.playerLabel = `${req.user.name} (Joined)`;
        await emptyEntry.save();
      } else {
        // Create a new entry
        const sortOrder = existingLedger.length;
        await SplitLedger.create({
          booking: booking._id,
          playerLabel: `${req.user.name} (Joined)`,
          playerName: req.user.name,
          shareAmount: booking.splitAmount,
          status: 'unpaid',
          isHost: false,
          sortOrder,
        });
      }

      await recalculateBookingTotals(booking._id);
    }

    // Send notification to host
    await Notification.create({
      recipient: match.host,
      sender: req.user.id,
      message: `${req.user.name} joined your match "${match.title}"!`,
      type: 'player_joined',
      link: `/matches/${match._id}`,
    });

    res.status(200).json({
      success: true,
      message: 'Successfully joined match',
      match,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Leave a match
// @route   POST /api/matches/:id/leave
// @access  Private
const leaveMatch = async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return next(new ErrorResponse('Match not found', 404));
    }

    const playerIndex = match.joinedPlayers.findIndex(
      (p) => p.user.toString() === req.user.id
    );

    if (playerIndex === -1) {
      return next(new ErrorResponse('You are not a participant in this match', 400));
    }

    // Leave match
    match.joinedPlayers.splice(playerIndex, 1);
    await match.save();

    // Remove or reset their ledger entry
    const booking = await Booking.findById(match.booking);
    if (booking) {
      const ledgerEntry = await SplitLedger.findOne({
        booking: booking._id,
        playerName: req.user.name,
      });
      if (ledgerEntry) {
        // If unpaid or pay_at_turf, reset to unpaid/empty
        ledgerEntry.playerName = '';
        ledgerEntry.playerLabel = `Player ${ledgerEntry.sortOrder + 1}`;
        ledgerEntry.status = 'unpaid';
        ledgerEntry.utrNumber = undefined;
        await ledgerEntry.save();
      }
      await recalculateBookingTotals(booking._id);
    }

    res.status(200).json({
      success: true,
      message: 'Successfully left match',
      match,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  hostMatch,
  getOpenMatches,
  getMatchDetails,
  joinMatch,
  leaveMatch,
};
