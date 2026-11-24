import mongoose from 'mongoose';

const analyticsSchema = new mongoose.Schema(
  {
    date: {
      type: String, // Format: YYYY-MM-DD
      required: true,
      unique: true,
      index: true,
    },
    pageViews: {
      type: Number,
      default: 0,
    },
    uniqueVisitors: {
      type: Number,
      default: 0,
    },
    visitorIps: [
      {
        type: String,
      },
    ],
  },
  { timestamps: true }
);

export const Analytics = mongoose.model('Analytics', analyticsSchema);
