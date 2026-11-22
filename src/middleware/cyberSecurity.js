import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { AuditLog } from '../models/AuditLog.js';

// Helmet middleware for secure HTTP headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'http:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// Strict Rate Limiter for Login/Auth endpoints (Brute Force Protection)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    await AuditLog.create({
      userEmail: req.body?.email || 'unknown',
      action: 'security.rate_limit_exceeded',
      description: `Brute-force protection triggered on auth route from IP ${ip}`,
      ipAddress: ip,
      userAgent: req.headers['user-agent'] || '',
      status: 'warning',
    });

    res.status(429).json({
      success: false,
      message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
    });
  },
});

// General API Rate Limiter
export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 150, // 150 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please slow down.',
  },
});

// NoSQL Injection sanitizer middleware
export const noSqlSanitizer = async (req, res, next) => {
  // Check for malicious MongoDB query selectors in body, query, params
  const containsMongoOperator = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        return true;
      }
      if (typeof obj[key] === 'object' && containsMongoOperator(obj[key])) {
        return true;
      }
    }
    return false;
  };

  if (containsMongoOperator(req.body) || containsMongoOperator(req.query) || containsMongoOperator(req.params)) {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const emailStr = typeof req.body?.email === 'string' ? req.body.email : 'nosql-injection-attempt';

    try {
      await AuditLog.create({
        userEmail: emailStr,
        action: 'security.nosql_injection_blocked',
        description: `Blocked NoSQL injection attempt containing operators from IP ${ip} on ${req.originalUrl}`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'] || '',
        status: 'failure',
      });
    } catch (auditErr) {
      console.warn('[AuditLog] Failed to record injection event:', auditErr.message);
    }

    return res.status(400).json({
      success: false,
      message: 'Malicious payload detected: Query operators are forbidden.',
    });
  }

  // Also apply standard mongoSanitize
  mongoSanitize()(req, res, next);
};
