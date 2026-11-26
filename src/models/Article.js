import mongoose from 'mongoose';

const articleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Article title is required'],
      trim: true,
      maxlength: [300, 'Title cannot exceed 300 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    subtitle: {
      type: String,
      trim: true,
      default: '',
    },
    content: {
      type: String,
      required: [true, 'Article content is required'],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    categoryName: {
      type: String,
      default: '',
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    authorName: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['draft', 'under_review', 'approved', 'scheduled', 'published', 'archived', 'DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED'],
      default: 'draft',
      index: true,
    },
    isLead: {
      type: Boolean,
      default: false,
    },
    isBreaking: {
      type: Boolean,
      default: false,
    },
    featuredImage: {
      url: { type: String, default: '' },
      alt: { type: String, default: '' },
      caption: { type: String, default: '' },
    },
    readTime: {
      type: String,
      default: '3 min read',
    },
    views: {
      type: Number,
      default: 0,
    },
    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    seo: {
      metaTitle: { type: String, default: '' },
      metaDescription: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

// Text index for search
articleSchema.index({ title: 'text', subtitle: 'text', content: 'text', tags: 'text' });

export const Article = mongoose.model('Article', articleSchema);
