import { Campaign } from '../models/Campaign.js';
import { Article } from '../models/Article.js';
import { Newsletter } from '../models/Newsletter.js';
import { AuditLog } from '../models/AuditLog.js';

export const getCampaigns = async (req, res, next) => {
  try {
    const campaigns = await Campaign.find()
      .populate('articleIds', 'title slug status featuredImage publishedAt subtitle')
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: campaigns.length,
      campaigns: campaigns.map((c) => ({
        ...c,
        id: c._id,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getCampaignById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id)
      .populate('articleIds', 'title slug status featuredImage publishedAt subtitle readTime')
      .lean();

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.status(200).json({
      success: true,
      campaign: {
        ...campaign,
        id: campaign._id,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createCampaign = async (req, res, next) => {
  try {
    const { subject = '', preview = '', intro = '', articleIds = [] } = req.body;

    const campaign = await Campaign.create({
      subject,
      preview,
      intro,
      articleIds,
      status: 'DRAFT',
    });

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'campaign.create',
      description: `Created campaign "${subject || 'Untitled campaign'}"`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(201).json({
      success: true,
      message: 'Campaign created',
      campaign,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subject, preview, intro, articleIds } = req.body;

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.status === 'SENT') {
      return res.status(400).json({
        success: false,
        message: 'Sent campaigns are locked and cannot be edited.',
      });
    }

    if (subject !== undefined) campaign.subject = subject;
    if (preview !== undefined) campaign.preview = preview;
    if (intro !== undefined) campaign.intro = intro;
    if (articleIds !== undefined) campaign.articleIds = articleIds;

    await campaign.save();

    res.status(200).json({
      success: true,
      message: 'Campaign saved',
      campaign,
    });
  } catch (error) {
    next(error);
  }
};

export const duplicateCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const original = await Campaign.findById(id);

    if (!original) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    const copy = await Campaign.create({
      subject: `${original.subject || 'Untitled'} (copy)`,
      preview: original.preview,
      intro: original.intro,
      articleIds: original.articleIds,
      status: 'DRAFT',
    });

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'campaign.duplicate',
      description: `Duplicated campaign "${original.subject}" to "${copy.subject}"`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(201).json({
      success: true,
      message: 'Campaign duplicated successfully',
      campaign: copy,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    const title = campaign.subject || 'Untitled campaign';
    await Campaign.findByIdAndDelete(id);

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'campaign.delete',
      description: `Deleted campaign "${title}"`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `Campaign "${title}" deleted`,
    });
  } catch (error) {
    next(error);
  }
};

export const sendCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id).populate('articleIds');

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (!campaign.subject || !campaign.subject.trim()) {
      return res.status(400).json({ success: false, message: 'Subject line is required before sending' });
    }

    const validArticles = (campaign.articleIds || []).filter(
      (a) => a && ['published', 'PUBLISHED'].includes(a.status)
    );

    if (!validArticles.length) {
      return res.status(400).json({
        success: false,
        message: 'Campaign requires at least one published article before sending',
      });
    }

    // Tally recipients
    const subscribers = await Newsletter.find().lean();
    const recipients = subscribers.filter((s) => ['SUBSCRIBED', 'active'].includes(s.status)).length;
    const excluded = subscribers.filter((s) => !['SUBSCRIBED', 'active'].includes(s.status)).length;

    campaign.status = 'SENT';
    campaign.sentAt = new Date();
    campaign.scheduledAt = null;
    campaign.report = {
      recipients,
      excluded,
      simulated: true, // As noted in provider note: Amazon SES / Resend simulated
    };
    await campaign.save();

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'campaign.send',
      description: `Sent campaign "${campaign.subject}" to ${recipients} subscribers (simulated send)`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `Campaign sent successfully to ${recipients} recipients!`,
      campaign,
    });
  } catch (error) {
    next(error);
  }
};

export const scheduleCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ success: false, message: 'Scheduled date and time is required' });
    }

    const scheduleDate = new Date(scheduledAt);
    if (isNaN(scheduleDate.getTime()) || scheduleDate.getTime() <= Date.now()) {
      return res.status(400).json({ success: false, message: 'Delivery time must be in the future' });
    }

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    campaign.status = 'SCHEDULED';
    campaign.scheduledAt = scheduleDate;
    await campaign.save();

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'campaign.schedule',
      description: `Scheduled campaign "${campaign.subject}" for ${scheduleDate.toISOString()}`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `Campaign scheduled for ${scheduleDate.toLocaleString('en-GB')}`,
      campaign,
    });
  } catch (error) {
    next(error);
  }
};

export const unscheduleCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    campaign.status = 'DRAFT';
    campaign.scheduledAt = null;
    await campaign.save();

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'campaign.unschedule',
      description: `Cancelled schedule for campaign "${campaign.subject}"`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: 'Schedule cancelled. Campaign reverted to Draft.',
      campaign,
    });
  } catch (error) {
    next(error);
  }
};

export const sendTestEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { to } = req.body;

    if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
      return res.status(400).json({ success: false, message: 'Valid recipient email required' });
    }

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'campaign.test',
      description: `Test send of campaign "${campaign.subject || 'Untitled'}" to ${to} (simulated)`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `Test email simulated successfully to ${to}`,
    });
  } catch (error) {
    next(error);
  }
};
