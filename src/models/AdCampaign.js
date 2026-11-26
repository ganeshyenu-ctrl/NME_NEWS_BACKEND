import mongoose from 'mongoose';

const adCampaignSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Campaign title is required'],
      trim: true,
      maxlength: [180, 'Title cannot exceed 180 characters'],
    },
    advertiser: {
      type: String,
      required: [true, 'Advertiser name is required'],
      trim: true,
      maxlength: [100, 'Advertiser name cannot exceed 100 characters'],
    },
    placement: {
      type: String,
      enum: ['homepage_top', 'homepage_mid', 'article_sidebar', 'article_inline', 'all'],
      default: 'homepage_top',
      index: true,
    },
    imageUrl: {
      type: String,
      required: [true, 'Banner image URL is required'],
      trim: true,
    },
    targetUrl: {
      type: String,
      required: [true, 'Destination click URL is required'],
      trim: true,
    },
    callToAction: {
      type: String,
      default: 'Learn More',
      trim: true,
      maxlength: [50, 'CTA cannot exceed 50 characters'],
    },
    headline: {
      type: String,
      default: '',
      trim: true,
      maxlength: [200, 'Headline cannot exceed 200 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    badgeText: {
      type: String,
      enum: ['AD', 'SPONSORED', 'ADVERTISEMENT', 'PARTNER CONTENT'],
      default: 'AD',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'DRAFT', 'EXPIRED'],
      default: 'ACTIVE',
      index: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
    impressions: {
      type: Number,
      default: 0,
      min: 0,
    },
    clicks: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Helpful virtual for Click-Through Rate (CTR %)
adCampaignSchema.virtual('ctr').get(function () {
  if (!this.impressions || this.impressions === 0) return 0;
  return Number(((this.clicks / this.impressions) * 100).toFixed(2));
});

adCampaignSchema.set('toJSON', { virtuals: true });
adCampaignSchema.set('toObject', { virtuals: true });

export const AdCampaign = mongoose.model('AdCampaign', adCampaignSchema);
