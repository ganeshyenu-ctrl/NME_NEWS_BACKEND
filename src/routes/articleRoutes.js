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
  getCalendarArticles,
  rescheduleArticle,
  triggerAutoPublish,
} from '../controllers/articleController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

// Public routes
router.get('/', getPublicArticles);
router.get('/public', getPublicArticles);
router.get('/highlights', getHomepageHighlights);
router.get('/public/:slug', getArticleBySlug);

// CRM / Admin protected routes
router.get('/admin/stats', authenticate, getDashboardStats);
router.get('/admin/list', authenticate, getAdminArticles);
router.get('/admin/calendar', authenticate, getCalendarArticles);
router.patch('/admin/:id/reschedule', authenticate, requireRole(['admin', 'editor']), rescheduleArticle);
router.put('/admin/:id/reschedule', authenticate, requireRole(['admin', 'editor']), rescheduleArticle);
router.post('/admin/publish-scheduled', authenticate, requireRole(['admin', 'editor']), triggerAutoPublish);
router.post('/admin', authenticate, createArticle);
router.put('/admin/:id', authenticate, updateArticle);
router.delete('/admin/:id', authenticate, requireRole(['admin', 'editor']), deleteArticle);

export default router;
