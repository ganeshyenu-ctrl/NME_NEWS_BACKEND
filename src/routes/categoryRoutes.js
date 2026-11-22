import express from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

router.get('/', getCategories);
router.post('/', authenticate, requireRole(['admin', 'editor']), createCategory);
router.put('/:id', authenticate, requireRole(['admin', 'editor']), updateCategory);
router.delete('/:id', authenticate, requireRole(['admin']), deleteCategory);

export default router;
