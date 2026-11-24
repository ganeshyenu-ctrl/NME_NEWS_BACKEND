import express from 'express';
import { login, refreshToken, logout, getMe, changePassword, updateProfile } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/cyberSecurity.js';

const router = express.Router();

// Strict rate limit applied to login to thwart credential stuffing & brute-force attacks
router.post('/login', authRateLimiter, login);
router.post('/refresh', refreshToken);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, updateProfile);
router.post('/change-password', authenticate, changePassword);

export default router;
