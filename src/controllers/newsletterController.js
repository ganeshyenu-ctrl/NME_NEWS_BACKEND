import { Newsletter } from '../models/Newsletter.js';
import { AuditLog } from '../models/AuditLog.js';

export const subscribe = async (req, res, next) => {
  try {
    const { email, topics = [], frequency = 'weekly' } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    let subscription = await Newsletter.findOne({ email: cleanEmail });

    if (subscription) {
      if (subscription.status === 'unsubscribed') {
        subscription.status = 'active';
        subscription.topics = topics;
        subscription.frequency = frequency;
        await subscription.save();

        return res.status(200).json({
          success: true,
          message: 'Welcome back! Your subscription has been reactivated.',
        });
      }

      return res.status(409).json({
        success: false,
        message: 'This email is already subscribed to the briefing.',
      });
    }

    subscription = await Newsletter.create({
      email: cleanEmail,
      topics,
      frequency,
      status: 'active',
    });

    await AuditLog.create({
      userEmail: cleanEmail,
      action: 'newsletter.subscribe',
      description: `New newsletter subscription: ${cleanEmail}`,
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

export const getSubscribers = async (req, res, next) => {
  try {
    const subscribers = await Newsletter.find().sort({ createdAt: -1 });
    const count = await Newsletter.countDocuments({ status: 'active' });

    res.status(200).json({
      success: true,
      count,
      subscribers,
    });
  } catch (error) {
    next(error);
  }
};
