import express from 'express';
import {
  getArticleComments,
  postComment,
  deleteComment,
} from '../controllers/commentController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

router.get('/:articleId', getArticleComments);
router.post('/:articleId', postComment);
router.delete('/:id', authenticate, requireRole(['admin', 'editor']), deleteComment);

export default router;
