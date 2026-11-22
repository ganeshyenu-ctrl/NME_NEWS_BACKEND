import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Checks if valid Cloudinary credentials are provided in the environment
 */
export const isCloudinaryConfigured = () => {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;

  return Boolean(
    name &&
      key &&
      secret &&
      !name.includes('your_') &&
      !key.includes('your_') &&
      !secret.includes('your_')
  );
};

/**
 * Uploads a file buffer directly to Cloudinary using upload_stream
 * @param {Buffer} fileBuffer - The memory buffer of the uploaded file
 * @param {Object} options - Cloudinary upload options (e.g., folder, public_id, resource_type)
 * @returns {Promise<Object>} Cloudinary upload response
 */
export const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadFolder = options.folder || process.env.CLOUDINARY_FOLDER || 'nme_news_media';
    const uploadOptions = {
      folder: uploadFolder,
      resource_type: options.resource_type || 'auto',
      ...options,
    };

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve(result);
    });

    stream.end(fileBuffer);
  });
};

/**
 * Deletes a file from Cloudinary by its public_id
 * @param {string} publicId - The Cloudinary public_id
 * @param {string} resourceType - 'image' | 'raw' | 'video'
 * @returns {Promise<Object>} Cloudinary destroy response
 */
export const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  if (!publicId) return null;
  return await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

export default cloudinary;
