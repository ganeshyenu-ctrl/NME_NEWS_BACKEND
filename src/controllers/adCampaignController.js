import mongoose from 'mongoose';
import { AdCampaign } from '../models/AdCampaign.js';
import { AuditLog } from '../models/AuditLog.js';
import { getIO } from '../config/socket.js';

const emitAdEvent = (eventName, payload) => {
  try {
    const io = getIO();
    if (io) {
      io.emit(eventName, payload);
    }
  } catch {}
};

const recordAdAudit = async (req, action, description) => {
  try {
    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action,
      description,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });
  } catch {}
};

// PUBLIC: Get active ads for website presentation
export const getPublicAds = async (req, res, next) => {
  try {
    const { placement } = req.query;

    const query = { status: 'ACTIVE' };

    if (placement && placement !== 'all') {
      query.placement = { $in: [placement, 'all'] };
    }

    // Filter out expired ads if endDate is set
    const now = new Date();
    query.$or = [{ endDate: null }, { endDate: { $gte: now } }];

    const ads = await AdCampaign.find(query).sort({ updatedAt: -1 }).lean();

    res.status(200).json({
      success: true,
      count: ads.length,
      ads,
    });
  } catch (error) {
    next(error);
  }
};

// PUBLIC: Record ad impression
export const recordImpression = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Ad campaign not found' });
    }

    const ad = await AdCampaign.findByIdAndUpdate(
      id,
      { $inc: { impressions: 1 } },
      { new: true }
    );

    if (ad) {
      emitAdEvent('ad_metrics_updated', {
        id: ad._id,
        impressions: ad.impressions,
        clicks: ad.clicks,
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// PUBLIC: Record ad click
export const recordClick = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Ad campaign not found' });
    }

    const ad = await AdCampaign.findByIdAndUpdate(
      id,
      { $inc: { clicks: 1 } },
      { new: true }
    );

    if (!ad) {
      return res.status(404).json({ success: false, message: 'Ad not found' });
    }

    emitAdEvent('ad_metrics_updated', {
      id: ad._id,
      impressions: ad.impressions,
      clicks: ad.clicks,
    });

    res.status(200).json({
      success: true,
      targetUrl: ad.targetUrl,
      clicks: ad.clicks,
    });
  } catch (error) {
    next(error);
  }
};

// ADMIN: Get all ad campaigns with full performance metrics
export const getAdminAds = async (req, res, next) => {
  try {
    const ads = await AdCampaign.find().sort({ updatedAt: -1 }).lean();

    const totalImpressions = ads.reduce((acc, ad) => acc + (ad.impressions || 0), 0);
    const totalClicks = ads.reduce((acc, ad) => acc + (ad.clicks || 0), 0);
    const overallCtr =
      totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;

    res.status(200).json({
      success: true,
      count: ads.length,
      stats: {
        total: ads.length,
        active: ads.filter((a) => a.status === 'ACTIVE').length,
        paused: ads.filter((a) => a.status === 'PAUSED').length,
        totalImpressions,
        totalClicks,
        overallCtr,
      },
      ads: ads.map((ad) => ({
        ...ad,
        ctr:
          ad.impressions > 0
            ? Number(((ad.clicks / ad.impressions) * 100).toFixed(2))
            : 0,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// ADMIN: Create new ad campaign
export const createAdminAd = async (req, res, next) => {
  try {
    const {
      title,
      advertiser,
      placement = 'homepage_top',
      imageUrl,
      targetUrl,
      callToAction = 'Learn More',
      headline = '',
      description = '',
      badgeText = 'AD',
      status = 'ACTIVE',
      startDate,
      endDate,
    } = req.body;

    if (!title?.trim() || !advertiser?.trim() || !imageUrl?.trim() || !targetUrl?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Campaign Title, Advertiser Name, Image URL, and Target URL are required.',
      });
    }

    const ad = await AdCampaign.create({
      title: title.trim(),
      advertiser: advertiser.trim(),
      placement,
      imageUrl: imageUrl.trim(),
      targetUrl: targetUrl.trim(),
      callToAction: callToAction.trim() || 'Learn More',
      headline: headline.trim(),
      description: description.trim(),
      badgeText,
      status,
      startDate: startDate || new Date(),
      endDate: endDate || null,
      createdBy: req.user?._id || null,
    });

    await recordAdAudit(
      req,
      'ad.create',
      `Created advertisement campaign "${ad.title}" for ${ad.advertiser}`
    );
    emitAdEvent('ad_metrics_updated', { id: ad._id, created: true });

    res.status(201).json({
      success: true,
      message: 'Advertisement campaign created successfully',
      ad,
    });
  } catch (error) {
    next(error);
  }
};

// ADMIN: Update existing ad campaign
export const updateAdminAd = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'title',
      'advertiser',
      'placement',
      'imageUrl',
      'targetUrl',
      'callToAction',
      'headline',
      'description',
      'badgeText',
      'status',
      'startDate',
      'endDate',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    }

    const ad = await AdCampaign.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!ad) {
      return res.status(404).json({ success: false, message: 'Ad campaign not found' });
    }

    await recordAdAudit(req, 'ad.update', `Updated advertisement campaign "${ad.title}"`);
    emitAdEvent('ad_metrics_updated', { id: ad._id, updated: true });

    res.status(200).json({
      success: true,
      message: 'Advertisement campaign updated',
      ad,
    });
  } catch (error) {
    next(error);
  }
};

// ADMIN: Toggle Ad Status (ACTIVE <-> PAUSED)
export const toggleAdminAdStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ad = await AdCampaign.findById(id);
    if (!ad) {
      return res.status(404).json({ success: false, message: 'Ad campaign not found' });
    }

    ad.status = ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    await ad.save();

    await recordAdAudit(
      req,
      'ad.status_toggle',
      `Toggled advertisement campaign "${ad.title}" status to ${ad.status}`
    );
    emitAdEvent('ad_metrics_updated', { id: ad._id, status: ad.status });

    res.status(200).json({
      success: true,
      message: `Ad campaign is now ${ad.status}`,
      ad,
    });
  } catch (error) {
    next(error);
  }
};

// ADMIN: Delete ad campaign
export const deleteAdminAd = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ad = await AdCampaign.findByIdAndDelete(id);
    if (!ad) {
      return res.status(404).json({ success: false, message: 'Ad campaign not found' });
    }

    await recordAdAudit(
      req,
      'ad.delete',
      `Deleted advertisement campaign "${ad.title}" (${ad.advertiser})`
    );
    emitAdEvent('ad_metrics_updated', { id, deleted: true });

    res.status(200).json({
      success: true,
      message: 'Ad campaign deleted from database',
    });
  } catch (error) {
    next(error);
  }
};
