import mongoose from 'mongoose';

const newsletterSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Valid email required'],
      index: true,
    },
    firstName: {
      type: String,
      trim: true,
      default: '',
    },
    topics: [
      {
        type: String,
        trim: true,
      },
    ],
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'breaking_only'],
      default: 'weekly',
    },
    status: {
      type: String,
      enum: ['SUBSCRIBED', 'UNSUBSCRIBED', 'SUPPRESSED', 'active', 'unsubscribed', 'suppressed'],
      default: 'SUBSCRIBED',
      index: true,
    },
    source: {
      type: String,
      trim: true,
      default: 'website',
    },
    consentAt: {
      type: Date,
      default: Date.now,
    },
    subscribedAt: {
      type: Date,
      default: Date.now,
    },
    unsubscribedAt: {
      type: Date,
      default: null,
    },
    suppressReason: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

newsletterSchema.index({ email: 'text', firstName: 'text' });

export const Newsletter = mongoose.model('Newsletter', newsletterSchema);
