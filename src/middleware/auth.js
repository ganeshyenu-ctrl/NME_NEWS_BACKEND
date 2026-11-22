import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token missing or invalid format',
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      // Log suspicious token tampering / expiry
      await AuditLog.create({
        userEmail: 'unauthenticated',
        action: 'security.invalid_token',
        description: `Invalid token attempt: ${err.message}`,
        ipAddress: req.ip || req.connection.remoteAddress || '127.0.0.1',
        userAgent: req.headers['user-agent'] || '',
        status: 'failure',
      });

      return res.status(401).json({
        success: false,
        message: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token signature',
      });
    }

    const user = await User.findById(decoded.id);
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'User account not found or deactivated',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authentication internal error',
      error: error.message,
    });
  }
};
