import express from 'express';
import {
  getArticleComments,
  postComment,
  deleteComment,
  getAdminComments,
  updateCommentStatus,
} from '../controllers/commentController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

// Admin Moderation Endpoints (must be above dynamic param :articleId)
router.get('/admin/all', authenticate, requireRole(['admin', 'editor', 'section_editor']), getAdminComments);
router.patch('/admin/:id/status', authenticate, requireRole(['admin', 'editor', 'section_editor']), updateCommentStatus);

// Public Article Comment Endpoints
router.get('/:articleId', getArticleComments);
router.post('/:articleId', postComment);
router.delete('/:id', authenticate, requireRole(['admin', 'editor', 'section_editor']), deleteComment);

export default router;
