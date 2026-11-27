import express from 'express';
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
} from '../controllers/tagController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

router.get('/', getTags);
router.post('/', authenticate, requireRole(['admin', 'editor', 'section_editor']), createTag);
router.put('/:id', authenticate, requireRole(['admin', 'editor', 'section_editor']), updateTag);
router.delete('/:id', authenticate, requireRole(['admin', 'editor', 'section_editor']), deleteTag);

export default router;
