const mongoose = require('mongoose');

const turfSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a turf name'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Please provide a description'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Turf must have an owner'],
    },
    address: {
      type: String,
      required: [true, 'Please provide an address'],
    },
    city: {
      type: String,
      required: [true, 'Please provide a city'],
      lowercase: true,
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
      },
    },
    sports: [
      {
        type: String,
        enum: [
          'cricket',
          'football',
          'badminton',
          'tennis',
          'basketball',
          'volleyball',
          'hockey',
          'other',
        ],
      },
    ],
    surfaceType: {
      type: String,
      enum: [
        'artificial-grass',
        'natural-grass',
        'clay',
        'cement',
        'synthetic',
        'mat',
        'other',
      ],
    },
    amenities: [
      {
        type: String,
        enum: [
          'parking',
          'floodlights',
          'changing-rooms',
          'canteen',
          'drinking-water',
          'washrooms',
          'first-aid',
          'equipment-rental',
          'seating-area',
          'wifi',
        ],
      },
    ],
    photos: [String],
    pricePerHour: {
      type: Number,
      required: [true, 'Please provide price per hour'],
      min: [0, 'Price cannot be negative'],
    },
    operatingHours: {
      open: {
        type: String,
        default: '06:00',
      },
      close: {
        type: String,
        default: '23:00',
      },
    },
    slotDuration: {
      type: Number,
      default: 60,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be below 0'],
      max: [5, 'Rating cannot exceed 5'],
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    adminNotes: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
turfSchema.index({ location: '2dsphere' });
turfSchema.index({ city: 1, status: 1 });
turfSchema.index({ sports: 1 });
turfSchema.index({ owner: 1 });
turfSchema.index({ slug: 1 }, { unique: true });

// Virtual for reviews
turfSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'turf',
  justOne: false,
});

// Generate slug from name before saving
turfSchema.pre('save', async function (next) {
  if (!this.isModified('name')) {
    return next();
  }

  let slug = this.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Check if slug already exists
  const existingTurf = await mongoose.model('Turf').findOne({ slug });
  if (existingTurf && existingTurf._id.toString() !== this._id.toString()) {
    const suffix = Math.random().toString(36).substring(2, 8);
    slug = `${slug}-${suffix}`;
  }

  this.slug = slug;
  next();
});

module.exports = mongoose.model('Turf', turfSchema);
