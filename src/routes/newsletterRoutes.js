import express from 'express';
import {
  subscribe,
  getNewsletterStats,
  getSubscribers,
  addSubscriber,
  importSubscribers,
  unsubscribeSubscriber,
  resubscribeSubscriber,
  suppressSubscriber,
  suppressEmail,
  unsuppressSubscriber,
  deleteSubscriber,
  sendSubscriberDigest,
  getSmtpStatus,
  testSmtpConnection,
} from '../controllers/newsletterController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

// Public subscription endpoint
router.post('/subscribe', subscribe);

// Admin / Editor CRM management endpoints
router.get('/stats', authenticate, requireRole(['admin', 'editor', 'section_editor']), getNewsletterStats);
router.get('/smtp-status', authenticate, requireRole(['admin', 'editor', 'section_editor']), getSmtpStatus);
router.post('/test-smtp', authenticate, requireRole(['admin', 'editor', 'section_editor']), testSmtpConnection);
router.get('/subscribers', authenticate, requireRole(['admin', 'editor', 'section_editor']), getSubscribers);
router.post('/subscribers', authenticate, requireRole(['admin', 'editor', 'section_editor']), addSubscriber);
router.post('/subscribers/import', authenticate, requireRole(['admin', 'editor', 'section_editor']), importSubscribers);
router.post('/subscribers/:id/send-digest', authenticate, requireRole(['admin', 'editor', 'section_editor']), sendSubscriberDigest);
router.patch('/subscribers/:id/unsubscribe', authenticate, requireRole(['admin', 'editor', 'section_editor']), unsubscribeSubscriber);
router.patch('/subscribers/:id/resubscribe', authenticate, requireRole(['admin', 'editor', 'section_editor']), resubscribeSubscriber);
router.patch('/subscribers/:id/suppress', authenticate, requireRole(['admin', 'editor', 'section_editor']), suppressSubscriber);
router.post('/suppress', authenticate, requireRole(['admin', 'editor', 'section_editor']), suppressEmail);
router.patch('/subscribers/:id/unsuppress', authenticate, requireRole(['admin', 'editor', 'section_editor']), unsuppressSubscriber);
router.delete('/subscribers/:id', authenticate, requireRole(['admin', 'editor', 'section_editor']), deleteSubscriber);

export default router;
