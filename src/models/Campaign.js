import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      trim: true,
      maxlength: [150, 'Subject line cannot exceed 150 characters'],
      default: '',
    },
    preview: {
      type: String,
      trim: true,
      maxlength: [200, 'Preview text cannot exceed 200 characters'],
      default: '',
    },
    intro: {
      type: String,
      trim: true,
      maxlength: [2000, 'Introduction cannot exceed 2000 characters'],
      default: '',
    },
    articleIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Article',
      },
    ],
    status: {
      type: String,
      enum: ['DRAFT', 'SCHEDULED', 'SENT'],
      default: 'DRAFT',
      index: true,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    report: {
      recipients: { type: Number, default: 0 },
      excluded: { type: Number, default: 0 },
      simulated: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

export const Campaign = mongoose.model('Campaign', campaignSchema);
