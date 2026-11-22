import express from 'express';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = express.Router();

router.get('/', authenticate, requireRole(['admin']), getUsers);
router.post('/', authenticate, requireRole(['admin']), createUser);
router.put('/:id', authenticate, requireRole(['admin']), updateUser);
router.delete('/:id', authenticate, requireRole(['admin']), deleteUser);

export default router;
