import express from 'express';
import {
  getPublicAds,
  recordImpression,
  recordClick,
  getAdminAds,
  createAdminAd,
  updateAdminAd,
  toggleAdminAdStatus,
  deleteAdminAd,
} from '../controllers/adCampaignController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

// Public Display & Analytics endpoints (no auth required)
router.get('/public', getPublicAds);
router.post('/public/:id/impression', recordImpression);
router.post('/public/:id/click', recordClick);

// Admin Management endpoints (protected)
router.get('/admin', authenticate, requireRole(['admin', 'editor']), getAdminAds);
router.post('/admin', authenticate, requireRole(['admin', 'editor']), createAdminAd);
router.put('/admin/:id', authenticate, requireRole(['admin', 'editor']), updateAdminAd);
router.patch('/admin/:id/status', authenticate, requireRole(['admin', 'editor']), toggleAdminAdStatus);
router.delete('/admin/:id', authenticate, requireRole(['admin', 'editor']), deleteAdminAd);

export default router;
