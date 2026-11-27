import express from 'express';
import {
  getPublicArticles,
  getArticleBySlug,
  getHomepageHighlights,
  getPublicReadershipStats,
  getAdminArticles,
  getAdminArticleById,
  createArticle,
  updateArticle,
  approveArticle,
  rejectArticle,
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
router.get('/public-stats', getPublicReadershipStats);
router.get('/highlights', getHomepageHighlights);
router.get('/public/:slug', getArticleBySlug);

// CRM / Admin protected routes
router.get('/admin/stats', authenticate, getDashboardStats);
router.get('/admin/list', authenticate, getAdminArticles);
router.get('/admin/calendar', authenticate, getCalendarArticles);
router.get('/admin/:id', authenticate, getAdminArticleById);
router.patch('/admin/:id/approve', authenticate, requireRole(['admin', 'editor', 'section_editor']), approveArticle);
router.patch('/admin/:id/reject', authenticate, requireRole(['admin', 'editor', 'section_editor']), rejectArticle);
router.patch('/admin/:id/reschedule', authenticate, requireRole(['admin', 'editor', 'section_editor']), rescheduleArticle);
router.put('/admin/:id/reschedule', authenticate, requireRole(['admin', 'editor', 'section_editor']), rescheduleArticle);
router.post('/admin/publish-scheduled', authenticate, requireRole(['admin', 'editor', 'section_editor']), triggerAutoPublish);
router.post('/admin', authenticate, requireRole(['admin', 'editor', 'section_editor', 'contributor']), createArticle);
router.put('/admin/:id', authenticate, requireRole(['admin', 'editor', 'section_editor', 'contributor']), updateArticle);
router.delete('/admin/:id', authenticate, requireRole(['admin', 'editor', 'section_editor']), deleteArticle);

export default router;
