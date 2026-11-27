import express from 'express';
import {
  upload,
  uploadMediaFile,
  getMediaList,
  deleteMedia,
} from '../controllers/mediaController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

router.get('/', authenticate, getMediaList);
router.post('/upload', authenticate, upload.single('file'), uploadMediaFile);
router.delete('/:id', authenticate, requireRole(['admin', 'editor', 'section_editor']), deleteMedia);

export default router;
