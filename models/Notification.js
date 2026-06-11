const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification must have a recipient'],
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification must have a sender'],
    },
    message: {
      type: String,
      required: [true, 'Notification must have a message'],
    },
    type: {
      type: String,
      enum: ['match_hosted', 'player_joined'],
      required: [true, 'Notification must have a type'],
    },
    link: {
      type: String,
      required: [true, 'Notification must have a target link'],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Indexes
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
