import express from 'express';
import {
  getPublicArticles,
  getArticleBySlug,
  getHomepageHighlights,
  getAdminArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  getDashboardStats,
} from '../controllers/articleController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

// Public routes
router.get('/public', getPublicArticles);
router.get('/highlights', getHomepageHighlights);
router.get('/public/:slug', getArticleBySlug);

// CRM / Admin protected routes
router.get('/admin/stats', authenticate, getDashboardStats);
router.get('/admin/list', authenticate, getAdminArticles);
router.post('/admin', authenticate, createArticle);
router.put('/admin/:id', authenticate, updateArticle);
router.delete('/admin/:id', authenticate, requireRole(['admin', 'editor']), deleteArticle);

export default router;
