import express from 'express';
import { subscribe, getSubscribers } from '../controllers/newsletterController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

router.post('/subscribe', subscribe);
router.get('/subscribers', authenticate, requireRole(['admin', 'editor']), getSubscribers);

export default router;
