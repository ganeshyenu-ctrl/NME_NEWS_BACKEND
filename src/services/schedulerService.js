import { Article } from '../models/Article.js';
import { AuditLog } from '../models/AuditLog.js';
import { getIO } from '../config/socket.js';

/**
 * Checks for any articles in 'scheduled' status whose scheduledAt date/time
 * is in the past (<= now), and automatically uploads/publishes them.
 */
export const publishDueScheduledArticles = async () => {
  try {
    const now = new Date();
    
    // Find articles in scheduled status whose time has arrived
    const dueArticles = await Article.find({
      status: { $in: ['scheduled', 'SCHEDULED'] },
      scheduledAt: { $lte: now },
    });

    if (!dueArticles || dueArticles.length === 0) {
      return 0;
    }

    let publishedCount = 0;

    for (const article of dueArticles) {
      const scheduledTime = article.scheduledAt || now;
      article.status = 'published';
      article.publishedAt = scheduledTime;
      await article.save();

      publishedCount++;

      // Log to Audit trail
      try {
        await AuditLog.create({
          userEmail: 'system.scheduler@nmepublications.com',
          action: 'article.auto_publish',
          description: `Auto-published scheduled article "${article.title}" on target schedule time (${scheduledTime.toISOString()})`,
          ipAddress: '127.0.0.1',
          userAgent: 'NME Background Auto-Publisher Service',
          status: 'success',
        });
      } catch (logErr) {
        console.error('[Scheduler] Failed to write audit log:', logErr.message);
      }

      console.log(`[Auto-Publisher] Successfully published article: "${article.title}" at ${now.toISOString()}`);
    }

    // Emit live WebSocket notification so all open browser tabs update instantly
    try {
      const io = getIO();
      if (io) {
        io.emit('articles_updated', {
          action: 'auto_publish',
          count: publishedCount,
          timestamp: now.toISOString(),
        });
        io.emit('article:published', {
          count: publishedCount,
          timestamp: now.toISOString(),
        });
      }
    } catch (wsErr) {
      // Socket might not have connected clients yet; ignore safely
    }

    return publishedCount;
  } catch (error) {
    console.error('[Scheduler] Error publishing due scheduled articles:', error.message);
    return 0;
  }
};

let schedulerInterval = null;

/**
 * Starts the periodic background worker running every intervalSeconds.
 */
export const startSchedulerWorker = (intervalSeconds = 30) => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Run initial check immediately
  publishDueScheduledArticles();

  // Run periodically
  schedulerInterval = setInterval(() => {
    publishDueScheduledArticles();
  }, intervalSeconds * 1000);

  console.log(`[Scheduler] Auto-Publisher background worker started (checking every ${intervalSeconds}s).`);
  return schedulerInterval;
};

export const stopSchedulerWorker = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log(`[Scheduler] Auto-Publisher background worker stopped.`);
  }
};
