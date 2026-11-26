import mongoose from 'mongoose';

const tagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tag name is required'],
      trim: true,
      maxlength: [40, 'Tag name cannot exceed 40 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Tag slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

tagSchema.index({ name: 'text', slug: 'text' });

export const Tag = mongoose.model('Tag', tagSchema);
