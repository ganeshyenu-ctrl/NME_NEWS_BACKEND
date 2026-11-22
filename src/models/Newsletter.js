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
      enum: ['active', 'unsubscribed'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

export const Newsletter = mongoose.model('Newsletter', newsletterSchema);
