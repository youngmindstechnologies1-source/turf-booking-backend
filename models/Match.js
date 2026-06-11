const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Match must be linked to a booking'],
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Match must have a host'],
    },
    turf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turf',
      required: [true, 'Match must be linked to a turf'],
    },
    title: {
      type: String,
      required: [true, 'Please provide a match title'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    sport: {
      type: String,
      required: [true, 'Please specify the sport'],
    },
    date: {
      type: Date,
      required: [true, 'Please specify the match date'],
    },
    startTime: {
      type: String,
      required: [true, 'Please specify starting time'],
    },
    endTime: {
      type: String,
      required: [true, 'Please specify ending time'],
    },
    skillLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'all'],
      default: 'all',
    },
    maxPlayers: {
      type: Number,
      required: [true, 'Please specify maximum players'],
      min: [2, 'Match must have at least 2 players total'],
    },
    hostTeamCount: {
      type: Number,
      default: 1,
      min: [1, 'Host team must have at least 1 player'],
    },
    joinedPlayers: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    status: {
      type: String,
      enum: ['open', 'completed', 'cancelled'],
      default: 'open',
    },
  },
  { timestamps: true }
);

// Indexes for fast feed queries
matchSchema.index({ date: 1, status: 1 });
matchSchema.index({ sport: 1, status: 1 });
matchSchema.index({ host: 1 });
matchSchema.index({ turf: 1 });

module.exports = mongoose.model('Match', matchSchema);
