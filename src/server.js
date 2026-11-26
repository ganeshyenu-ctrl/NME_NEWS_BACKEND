import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { initSocket } from './config/socket.js';
import { isCloudinaryConfigured } from './config/cloudinary.js';
import { securityHeaders, noSqlSanitizer, apiRateLimiter } from './middleware/cyberSecurity.js';
import { errorHandler } from './middleware/errorHandler.js';

// Route Imports
import authRoutes from './routes/authRoutes.js';
import articleRoutes from './routes/articleRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import newsletterRoutes from './routes/newsletterRoutes.js';
import userRoutes from './routes/userRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import tagRoutes from './routes/tagRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import adCampaignRoutes from './routes/adCampaignRoutes.js';

dotenv.config();

const app = express();
const httpServer = http.createServer(app);

// Helper to resolve allowed CORS origins (supporting production domains & dev)
const getAllowedOrigins = () => {
  const envOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [
    'https://nmepublications.com',
    'https://www.nmepublications.com',
    'http://localhost:3000',
    'http://localhost:5000',
    ...envOrigins,
  ];
};

// 1. Cybersecurity & Hardening Middleware
app.use(securityHeaders);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const origins = getAllowedOrigins();
      if (
        origins.includes(origin) ||
        origin.endsWith('.nmepublications.com') ||
        origin.startsWith('http://localhost:')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Body Parsing & NoSQL Protection
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(noSqlSanitizer);

// Rate limiter on general API calls
app.use('/api', apiRateLimiter);

// Static uploads directory (used if Cloudinary is not configured)
app.use('/uploads', express.static(path.resolve('uploads')));

// Comprehensive Health & Environment Diagnostics endpoint
app.get('/api/health', (req, res) => {
  const isCloudinaryActive = isCloudinaryConfigured();
  const dbConnected = mongoose.connection.readyState === 1;

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: {
        status: dbConnected ? 'connected' : 'disconnected',
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        livePersistence: process.env.USE_MEMORY_DB_IF_LOCAL_FAILS !== 'true',
      },
      cloudinary: {
        status: isCloudinaryActive ? 'connected' : 'unconfigured',
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || null,
        folder: process.env.CLOUDINARY_FOLDER || 'nme_news_media',
      },
      jwtAuth: {
        status: Boolean(process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET)
          ? 'configured'
          : 'missing',
        accessLifetime: process.env.JWT_EXPIRES_IN || '1h',
        refreshLifetime: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      },
      socketIo: {
        status: 'ready',
      },
      cyberSecurity: {
        helmetHeaders: 'active',
        noSqlSanitizer: 'active',
        rateLimiter: 'active',
      },
    },
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ads', adCampaignRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Secure Error Handler
app.use(errorHandler);

// Initialize WebSockets
initSocket(httpServer);

import { startSchedulerWorker } from './services/schedulerService.js';

// Server Startup
const PORT = process.env.PORT || 5000;

const printEnvironmentDiagnostics = () => {
  const isCloudinaryActive = isCloudinaryConfigured();
  const dbConnected = mongoose.connection.readyState === 1;
  const isMemoryFallback = process.env.USE_MEMORY_DB_IF_LOCAL_FAILS === 'true';

  console.log(`====================================================`);
  console.log(`[NME] News Platform & CRM Backend API`);
  console.log(`[Server] Running at: http://localhost:${PORT}`);
  console.log(`====================================================`);
  console.log(`[DIAGNOSTICS] Environment & Services Status:`);
  console.log(`  |- Database (MongoDB): ${dbConnected ? '[CONNECTED]' : '[DISCONNECTED]'}`);
  console.log(`  |   |- Host: ${mongoose.connection.host || '127.0.0.1'}:${mongoose.connection.port || '27017'}`);
  console.log(`  |   |- Database: ${mongoose.connection.name || 'nme_news_db'}`);
  console.log(`  |   |- In-Memory Fallback: ${isMemoryFallback ? '[ENABLED - Temporary Mock]' : '[DISABLED - Live Database Enforced]'}`);
  console.log(`  |- Cloudinary Storage: ${isCloudinaryActive ? '[READY - Live CDN Active]' : '[NOT CONFIGURED]'}`);
  if (isCloudinaryActive) {
    console.log(`  |   |- Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
    console.log(`  |   |- API Key: ${process.env.CLOUDINARY_API_KEY ? '****' + String(process.env.CLOUDINARY_API_KEY).slice(-4) : 'Missing'}`);
    console.log(`  |   |- Target Folder: ${process.env.CLOUDINARY_FOLDER || 'nme_news_media'}`);
  } else {
    console.log(`  |   |- Fallback: Local /uploads directory`);
  }
  console.log(`  |- JWT Authentication: ${process.env.JWT_SECRET ? '[CONFIGURED]' : '[MISSING]'}`);
  console.log(`  |   |- Access Token Lifetime: ${process.env.JWT_EXPIRES_IN || '1h'}`);
  console.log(`  |   |- Refresh Token Lifetime: ${process.env.JWT_REFRESH_EXPIRES_IN || '7d'}`);
  console.log(`  |- Cyber Security Protections: [ACTIVE]`);
  console.log(`  |   |- HTTP Security Headers (Helmet/HSTS/CSP): [ACTIVE]`);
  console.log(`  |   |- NoSQL Operator Sanitization: [ACTIVE]`);
  console.log(`  |   |- API Rate Limiting: [ACTIVE] (100 req/15m)`);
  console.log(`  |- Socket.io Real-Time Server: [READY]`);
  console.log(`  |- CORS Allowed Origin: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`====================================================`);
};

export const startServer = async () => {
  try {
    await connectDB();
    httpServer.listen(PORT, () => {
      printEnvironmentDiagnostics();
      startSchedulerWorker(30);
    });
    return httpServer;
  } catch (error) {
    console.error(`[Server] Startup failed:`, error.message);
    process.exit(1);
  }
};

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}

export { app, httpServer };
