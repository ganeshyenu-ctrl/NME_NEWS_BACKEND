import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Media } from '../models/Media.js';
import { AuditLog } from '../models/AuditLog.js';
import {
  isCloudinaryConfigured,
  uploadToCloudinary,
  deleteFromCloudinary,
} from '../config/cloudinary.js';

// Configure multer memory storage (allows direct streaming to Cloudinary or disk fallback)
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|svg|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      return cb(null, true);
    }
    cb(new Error('Only image files (jpeg, jpg, png, webp, gif, svg) and PDFs are allowed'));
  },
});

export const uploadMediaFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const { altText = '' } = req.body;
    let fileUrl = '';
    let filename = '';
    let publicId = '';
    let storageType = 'local';
    let width = 0;
    let height = 0;

    // Check if Cloudinary is configured
    if (isCloudinaryConfigured()) {
      try {
        console.log(`[Cloudinary] Uploading "${req.file.originalname}" to Cloudinary CDN...`);
        const result = await uploadToCloudinary(req.file.buffer, {
          folder: process.env.CLOUDINARY_FOLDER || 'nme_news_media',
          resource_type: req.file.mimetype === 'application/pdf' ? 'raw' : 'image',
        });

        fileUrl = result.secure_url;
        publicId = result.public_id;
        filename = result.public_id;
        storageType = 'cloudinary';
        width = result.width || 0;
        height = result.height || 0;
        console.log(`[Cloudinary] Successfully uploaded: ${fileUrl}`);
      } catch (cloudErr) {
        console.error('[Cloudinary] Upload error:', cloudErr.message);
        return res.status(500).json({
          success: false,
          message: `Cloudinary upload failed: ${cloudErr.message}`,
        });
      }
    } else {
      // Local disk fallback when Cloudinary env keys are not provided
      console.warn('[Media] Cloudinary credentials not configured in .env. Falling back to local storage.');
      const uploadDir = path.resolve('uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(req.file.originalname);
      filename = `${req.file.fieldname || 'media'}-${uniqueSuffix}${ext}`;
      const filePath = path.join(uploadDir, filename);

      fs.writeFileSync(filePath, req.file.buffer);
      fileUrl = `/uploads/${filename}`;
      storageType = 'local';
    }

    const media = await Media.create({
      filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: fileUrl,
      altText,
      publicId,
      storageType,
      dimensions: { width, height },
      uploadedBy: req.user?._id,
    });

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'media.upload',
      description: `Uploaded asset "${req.file.originalname}" (${(req.file.size / 1024).toFixed(1)} KB) via ${storageType}`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(201).json({
      success: true,
      message: `Media uploaded successfully${storageType === 'cloudinary' ? ' to Cloudinary' : ''}`,
      media,
    });
  } catch (error) {
    next(error);
  }
};

export const getMediaList = async (req, res, next) => {
  try {
    const { page = 1, limit = 24, search } = req.query;

    const query = {};
    if (search && search.trim()) {
      query.originalName = { $regex: search.trim(), $options: 'i' };
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Media.countDocuments(query);

    const items = await Media.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      media: items,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteMedia = async (req, res, next) => {
  try {
    const { id } = req.params;
    const media = await Media.findById(id);

    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media file not found',
      });
    }

    // Delete from Cloudinary if stored in Cloudinary
    if (media.storageType === 'cloudinary' || media.publicId) {
      if (isCloudinaryConfigured()) {
        try {
          const resourceType = media.mimeType === 'application/pdf' ? 'raw' : 'image';
          await deleteFromCloudinary(media.publicId, resourceType);
          console.log(`[Cloudinary] Deleted asset ${media.publicId}`);
        } catch (cloudErr) {
          console.warn(`[Cloudinary] Failed to delete from cloud:`, cloudErr.message);
        }
      }
    }

    // If local file exists, remove from disk
    const filePath = path.resolve('uploads', media.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fsErr) {
        console.warn(`[Media] Failed to delete local file:`, fsErr.message);
      }
    }

    await Media.findByIdAndDelete(id);

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'media.delete',
      description: `Deleted asset "${media.originalName}" (${media.storageType || 'local'})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: 'Media file deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
