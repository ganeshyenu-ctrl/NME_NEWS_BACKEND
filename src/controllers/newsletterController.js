import { Newsletter } from '../models/Newsletter.js';
import { Campaign } from '../models/Campaign.js';
import { AuditLog } from '../models/AuditLog.js';
import {
  sendCuratedEmail,
  getSmtpConfig,
  verifySmtpConnection,
} from '../services/emailService.js';

// Public website subscribe
export const subscribe = async (req, res, next) => {
  try {
    const { email, firstName = '', topics = [], frequency = 'weekly', source = 'website' } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    let subscription = await Newsletter.findOne({ email: cleanEmail });

    if (subscription) {
      if (['SUPPRESSED', 'suppressed'].includes(subscription.status)) {
        return res.status(403).json({
          success: false,
          message: 'This email is suppressed and cannot be re-subscribed automatically.',
        });
      }

      if (['UNSUBSCRIBED', 'unsubscribed'].includes(subscription.status)) {
        subscription.status = 'SUBSCRIBED';
        subscription.firstName = firstName || subscription.firstName;
        subscription.topics = topics.length ? topics : subscription.topics;
        subscription.frequency = frequency;
        subscription.subscribedAt = new Date();
        subscription.consentAt = new Date();
        subscription.unsubscribedAt = null;
        await subscription.save();

        await AuditLog.create({
          userEmail: cleanEmail,
          action: 'subscriber.resubscribe',
          description: `Newsletter re-subscription: ${cleanEmail}`,
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.headers['user-agent'] || '',
          status: 'success',
        });

        return res.status(200).json({
          success: true,
          message: 'Welcome back! Your subscription has been reactivated.',
          subscription,
        });
      }

      return res.status(409).json({
        success: false,
        message: 'This email is already subscribed to the briefing.',
      });
    }

    subscription = await Newsletter.create({
      email: cleanEmail,
      firstName: firstName.trim(),
      topics,
      frequency,
      status: 'SUBSCRIBED',
      source: source || 'website',
      consentAt: new Date(),
      subscribedAt: new Date(),
    });

    await AuditLog.create({
      userEmail: cleanEmail,
      action: 'newsletter.subscribe',
      description: `New newsletter subscription: ${cleanEmail} (source: ${source})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(201).json({
      success: true,
      message: 'Thank you for subscribing to the NME Briefing.',
      subscription,
    });
  } catch (error) {
    next(error);
  }
};

// Overview stats for the /admin/newsletter dashboard
export const getNewsletterStats = async (req, res, next) => {
  try {
    const all = await Newsletter.find().lean();
    
    const subscribed = all.filter((s) => ['SUBSCRIBED', 'active'].includes(s.status)).length;
    const unsubscribed = all.filter((s) => ['UNSUBSCRIBED', 'unsubscribed'].includes(s.status)).length;
    const suppressedList = all.filter((s) => ['SUPPRESSED', 'suppressed'].includes(s.status));
    const suppressed = suppressedList.length;

    // Sources tally
    const sources = {};
    for (const s of all) {
      const src = s.source || 'website';
      sources[src] = (sources[src] || 0) + 1;
    }

    // Past 6 months subscriber growth
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const label = d.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
      
      const count = all.filter((s) => {
        const subDate = new Date(s.subscribedAt || s.createdAt);
        return subDate.getUTCFullYear() === year && subDate.getUTCMonth() === month;
      }).length;

      months.push({ label, count, year, month });
    }

    // Recent 5 campaigns
    const recentCampaigns = await Campaign.find()
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    res.status(200).json({
      success: true,
      stats: {
        total: all.length,
        subscribed,
        unsubscribed,
        suppressed,
        sources,
        growth: months,
        suppressedList: suppressedList.map((s) => ({
          _id: s._id,
          id: s._id,
          email: s.email,
          suppressReason: s.suppressReason || 'Suppressed manually',
          unsubscribedAt: s.unsubscribedAt || s.updatedAt,
        })),
        recentCampaigns,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Subscriber management table with search, filter, pagination, export
export const getSubscribers = async (req, res, next) => {
  try {
    const { q, status, page = 1, limit = 50, format } = req.query;

    const query = {};

    if (status) {
      if (status === 'SUBSCRIBED') query.status = { $in: ['SUBSCRIBED', 'active'] };
      else if (status === 'UNSUBSCRIBED') query.status = { $in: ['UNSUBSCRIBED', 'unsubscribed'] };
      else if (status === 'SUPPRESSED') query.status = { $in: ['SUPPRESSED', 'suppressed'] };
      else query.status = status;
    }

    if (q) {
      const re = new RegExp(q.trim(), 'i');
      query.$or = [{ email: re }, { firstName: re }];
    }

    // CSV Export request
    if (format === 'csv') {
      const subscribers = await Newsletter.find(query).sort({ createdAt: -1 }).lean();
      
      const safeCell = (v) => {
        const s = String(v ?? '');
        const clean = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
        return `"${clean.replace(/"/g, '""')}"`;
      };

      const header = 'first_name,email,status,source,consent_at,subscribed_at,unsubscribed_at\r\n';
      const rows = subscribers.map((s) => [
        s.firstName || '',
        s.email,
        s.status,
        s.source || 'website',
        s.consentAt ? new Date(s.consentAt).toISOString() : '',
        s.subscribedAt ? new Date(s.subscribedAt).toISOString() : '',
        s.unsubscribedAt ? new Date(s.unsubscribedAt).toISOString() : '',
      ].map(safeCell).join(',')).join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="nme-subscribers.csv"');
      return res.status(200).send(header + rows);
    }

    const currentPage = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (currentPage - 1) * pageSize;

    const total = await Newsletter.countDocuments(query);
    const subscribers = await Newsletter.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    res.status(200).json({
      success: true,
      count: subscribers.length,
      total,
      page: currentPage,
      totalPages: Math.ceil(total / pageSize) || 1,
      subscribers: subscribers.map((s) => ({
        ...s,
        id: s._id,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// Add single subscriber manually (admin/editor)
export const addSubscriber = async (req, res, next) => {
  try {
    const { email, firstName = '', consent } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required',
      });
    }

    if (!consent) {
      return res.status(400).json({
        success: false,
        message: 'Explicit consent confirmation is required to add a subscriber.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await Newsletter.findOne({ email: cleanEmail });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Already on the list (${existing.status.toLowerCase()}). Use resubscribe if previously unsubscribed.`,
      });
    }

    const subscriber = await Newsletter.create({
      email: cleanEmail,
      firstName: firstName.trim(),
      status: 'SUBSCRIBED',
      source: 'manual',
      consentAt: new Date(),
      subscribedAt: new Date(),
    });

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'subscriber.create',
      description: `Added subscriber ${cleanEmail} (consent recorded)`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(201).json({
      success: true,
      message: 'Subscriber added successfully',
      subscriber,
    });
  } catch (error) {
    next(error);
  }
};

// Bulk import subscribers from CSV
export const importSubscribers = async (req, res, next) => {
  try {
    const { rows, consent } = req.body;

    if (!consent) {
      return res.status(400).json({
        success: false,
        message: 'Consent confirmation is required for bulk imports.',
      });
    }

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({
        success: false,
        message: 'No subscriber rows provided',
      });
    }

    const results = {
      added: 0,
      existing: 0,
      suppressed: 0,
      duplicates: 0,
      invalid: [],
    };

    const seenInBatch = new Set();
    const now = new Date();

    for (const item of rows) {
      const email = (item.email || '').toLowerCase().trim();
      const firstName = (item.firstName || item.first_name || '').trim();
      const source = (item.source || 'import').trim();

      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        results.invalid.push(email || 'empty');
        continue;
      }

      if (seenInBatch.has(email)) {
        results.duplicates++;
        continue;
      }
      seenInBatch.add(email);

      const existing = await Newsletter.findOne({ email });
      if (existing) {
        if (['SUPPRESSED', 'suppressed'].includes(existing.status)) {
          results.suppressed++;
        } else {
          results.existing++;
        }
        continue;
      }

      await Newsletter.create({
        email,
        firstName,
        source: source || 'import',
        status: 'SUBSCRIBED',
        consentAt: now,
        subscribedAt: now,
      });
      results.added++;
    }

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'subscriber.import',
      description: `Imported ${results.added} subscribers (batch size: ${rows.length})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `${results.added} subscribers added successfully.`,
      results,
    });
  } catch (error) {
    next(error);
  }
};

// Unsubscribe
export const unsubscribeSubscriber = async (req, res, next) => {
  try {
    const { id } = req.params;
    const subscriber = await Newsletter.findById(id);

    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    subscriber.status = 'UNSUBSCRIBED';
    subscriber.unsubscribedAt = new Date();
    await subscriber.save();

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'subscriber.unsubscribe',
      description: `Unsubscribed ${subscriber.email}`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `${subscriber.email} unsubscribed.`,
      subscriber,
    });
  } catch (error) {
    next(error);
  }
};

// Resubscribe with fresh consent
export const resubscribeSubscriber = async (req, res, next) => {
  try {
    const { id } = req.params;
    const subscriber = await Newsletter.findById(id);

    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    subscriber.status = 'SUBSCRIBED';
    subscriber.consentAt = new Date();
    subscriber.subscribedAt = new Date();
    subscriber.unsubscribedAt = null;
    subscriber.suppressReason = '';
    await subscriber.save();

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'subscriber.resubscribe',
      description: `Resubscribed ${subscriber.email} with renewed consent`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `${subscriber.email} resubscribed.`,
      subscriber,
    });
  } catch (error) {
    next(error);
  }
};

// Suppress address
export const suppressSubscriber = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason = 'Suppressed manually' } = req.body;
    const subscriber = await Newsletter.findById(id);

    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    subscriber.status = 'SUPPRESSED';
    subscriber.suppressReason = reason;
    subscriber.unsubscribedAt = subscriber.unsubscribedAt || new Date();
    await subscriber.save();

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'subscriber.suppress',
      description: `Suppressed ${subscriber.email} (${reason})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `${subscriber.email} will never be emailed.`,
      subscriber,
    });
  } catch (error) {
    next(error);
  }
};

// Direct suppress email address (e.g. from suppression list form)
export const suppressEmail = async (req, res, next) => {
  try {
    const { email, reason = 'Suppressed manually' } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    let subscriber = await Newsletter.findOne({ email: cleanEmail });

    if (!subscriber) {
      subscriber = await Newsletter.create({
        email: cleanEmail,
        status: 'SUPPRESSED',
        source: 'manual',
        suppressReason: reason,
        consentAt: new Date(),
        subscribedAt: new Date(),
        unsubscribedAt: new Date(),
      });
    } else {
      subscriber.status = 'SUPPRESSED';
      subscriber.suppressReason = reason;
      subscriber.unsubscribedAt = subscriber.unsubscribedAt || new Date();
      await subscriber.save();
    }

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'subscriber.suppress',
      description: `Suppressed ${cleanEmail} (${reason})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `${cleanEmail} will never be emailed.`,
      subscriber,
    });
  } catch (error) {
    next(error);
  }
};

// Remove from suppression list (becomes UNSUBSCRIBED)
export const unsuppressSubscriber = async (req, res, next) => {
  try {
    const { id } = req.params;
    const subscriber = await Newsletter.findById(id);

    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    subscriber.status = 'UNSUBSCRIBED';
    subscriber.suppressReason = '';
    await subscriber.save();

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'subscriber.unsuppress',
      description: `Removed ${subscriber.email} from suppression list (now unsubscribed)`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `${subscriber.email} removed from suppression list.`,
      subscriber,
    });
  } catch (error) {
    next(error);
  }
};

// Send personalized email/digest to a subscriber based on their chosen topics or custom content
export const sendSubscriberDigest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subject, customMessage, articleIds = [] } = req.body;

    const subscriber = await Newsletter.findById(id);
    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    if (['SUPPRESSED', 'suppressed'].includes(subscriber.status)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot send email: This subscriber is suppressed.',
      });
    }

    // Dynamic import Article to prevent circular dependencies
    const { Article } = await import('../models/Article.js');

    let articlesToSend = [];
    if (articleIds && articleIds.length > 0) {
      articlesToSend = await Article.find({ _id: { $in: articleIds }, status: 'published' })
        .select('title headline slug subtitle readTime publishedAt featuredImage category')
        .limit(5);
    } else if (subscriber.topics && subscriber.topics.length > 0) {
      articlesToSend = await Article.find({
        status: 'published',
        $or: [
          { tags: { $in: subscriber.topics } },
          { categoryName: { $in: subscriber.topics } },
        ],
      })
        .sort({ publishedAt: -1 })
        .limit(3)
        .select('title headline slug subtitle readTime publishedAt featuredImage category');
    }

    if (articlesToSend.length === 0) {
      articlesToSend = await Article.find({ status: 'published' })
        .sort({ publishedAt: -1 })
        .limit(3)
        .select('title headline slug subtitle readTime publishedAt featuredImage category');
    }

    // Dispatch email via Nodemailer SMTP service (or safely simulate if SMTP credentials are not set)
    const dispatchResult = await sendCuratedEmail({
      to: subscriber.email,
      subscriberName: subscriber.firstName || (subscriber.email ? subscriber.email.split('@')[0] : 'Subscriber'),
      subject: subject || 'NME Strategic Intelligence: Curated Maritime Dispatches',
      customMessage: customMessage || '',
      articles: articlesToSend,
    });

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'newsletter.send_digest',
      description: dispatchResult.simulated
        ? `Simulated email dispatch to ${subscriber.email} (${articlesToSend.length} articles, SMTP credentials not set)`
        : `Sent real email via SMTP to ${subscriber.email} (${articlesToSend.length} articles, MessageID: ${dispatchResult.messageId})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: dispatchResult.message,
      simulated: dispatchResult.simulated,
      smtpConfigured: !dispatchResult.simulated,
      dispatch: {
        to: subscriber.email,
        subject: dispatchResult.subject,
        articleCount: articlesToSend.length,
        articles: articlesToSend,
        simulated: dispatchResult.simulated,
        messageId: dispatchResult.messageId || null,
        reason: dispatchResult.reason || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Check live SMTP configuration status for frontend client
export const getSmtpStatus = async (req, res, next) => {
  try {
    const config = getSmtpConfig();
    res.status(200).json({
      success: true,
      smtpConfigured: config.isConfigured,
      details: config,
      message: config.isConfigured
        ? `SMTP is configured and active (${config.host}:${config.port}).`
        : `SMTP is not configured in backend .env. Missing: ${config.missing.join(', ')}.`,
    });
  } catch (error) {
    next(error);
  }
};

// Test SMTP connection from admin CRM
export const testSmtpConnection = async (req, res, next) => {
  try {
    const result = await verifySmtpConnection();
    res.status(result.connected ? 200 : 400).json({
      success: result.connected,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// Delete subscriber permanently (GDPR / data deletion requests)
export const deleteSubscriber = async (req, res, next) => {
  try {
    const { id } = req.params;
    const subscriber = await Newsletter.findById(id);

    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    const email = subscriber.email;
    await Newsletter.findByIdAndDelete(id);

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'subscriber.delete',
      description: `Permanently deleted subscriber ${email}`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `Permanently deleted subscriber ${email}.`,
    });
  } catch (error) {
    next(error);
  }
};
