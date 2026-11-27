import { AuditLog } from '../models/AuditLog.js';

export const requireRole = (allowedRoles = []) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before checking permissions',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Record unauthorized privilege escalation attempt
      await AuditLog.create({
        userEmail: req.user.email,
        userId: req.user._id,
        action: 'security.permission_denied',
        description: `User role '${req.user.role}' attempted unauthorized access to ${req.originalUrl} requiring [${allowedRoles.join(', ')}]`,
        ipAddress: req.ip || req.connection.remoteAddress || '127.0.0.1',
        userAgent: req.headers['user-agent'] || '',
        status: 'failure',
      });

      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to roles [${allowedRoles.join(', ')}]`,
      });
    }

    next();
  };
};
