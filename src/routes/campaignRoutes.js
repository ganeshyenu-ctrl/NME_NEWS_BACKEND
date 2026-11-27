import express from 'express';
import {
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  duplicateCampaign,
  deleteCampaign,
  sendCampaign,
  scheduleCampaign,
  unscheduleCampaign,
  sendTestEmail,
} from '../controllers/campaignController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole(['admin', 'editor', 'section_editor']));

router.get('/', getCampaigns);
router.get('/:id', getCampaignById);
router.post('/', createCampaign);
router.put('/:id', updateCampaign);
router.post('/:id/duplicate', duplicateCampaign);
router.delete('/:id', deleteCampaign);
router.post('/:id/send', sendCampaign);
router.post('/:id/schedule', scheduleCampaign);
router.post('/:id/unschedule', unscheduleCampaign);
router.post('/:id/test', sendTestEmail);

export default router;
