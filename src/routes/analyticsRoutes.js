import express from 'express';
import { getAnalyticsOverview } from '../controllers/analyticsController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole(['admin', 'editor', 'section_editor']));

router.get('/overview', getAnalyticsOverview);

export default router;
