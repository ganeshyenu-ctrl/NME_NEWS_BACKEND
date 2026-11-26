import { AdCampaign } from '../models/AdCampaign.js';
import { AuditLog } from '../models/AuditLog.js';
import { getIO } from '../config/socket.js';

// Initial realistic maritime industry sponsor ads (seeded if collection is empty)
const SEED_ADS = [
  {
    title: 'Global Maritime Decarbonisation Summit 2026',
    advertiser: 'Global Maritime Forum',
    placement: 'homepage_top',
    headline: 'Navigating Net-Zero Shipping Regulations & Alternative Marine Fuels',
    description: 'Join 1,200+ shipowners, charterers, port authorities, and technology leaders in Singapore this October.',
    imageUrl: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=1200&q=80',
    targetUrl: 'https://www.globalmaritimeforum.org',
    callToAction: 'Register Delegate Pass',
    badgeText: 'AD',
    status: 'ACTIVE',
    impressions: 480,
    clicks: 34,
  },
  {
    title: 'Next-Generation Multi-Fuel Marine Engines',
    advertiser: 'Wärtsilä Power Systems',
    placement: 'homepage_mid',
    headline: 'Future-Proof Your Commercial Fleet with Methanol & Ammonia Ready Propulsion',
    description: 'Ultra-low emission marine engines designed for next-decade environmental compliance and fuel efficiency.',
    imageUrl: 'https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=1200&q=80',
    targetUrl: 'https://www.wartsila.com/marine',
    callToAction: 'Explore Engine Specifications',
    badgeText: 'AD',
    status: 'ACTIVE',
    impressions: 320,
    clicks: 22,
  },
  {
    title: 'Fleet Emissions & EU ETS Compliance Software',
    advertiser: 'DNV Maritime Intelligence',
    placement: 'article_inline',
    headline: 'Automated Carbon Intensity Indicator (CII) & FuelEU Voyage Forecasting',
    description: 'Cut operational compliance fines by up to 35% with real-time digital voyage simulation.',
    imageUrl: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1200&q=80',
    targetUrl: 'https://www.dnv.com/maritime',
    callToAction: 'Request Platform Demo',
    badgeText: 'AD',
    status: 'ACTIVE',
    impressions: 590,
    clicks: 48,
  },
];

// PUBLIC: Get active ads for website presentation
export const getPublicAds = async (req, res, next) => {
  try {
    const { placement } = req.query;

    // Seed defaults if empty
    const count = await AdCampaign.countDocuments();
    if (count === 0) {
      await AdCampaign.insertMany(SEED_ADS).catch(() => {});
    }

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
    const ad = await AdCampaign.findByIdAndUpdate(
      id,
      { $inc: { impressions: 1 } },
      { new: true }
    );
    try {
      const io = getIO();
      if (io && ad) {
        io.emit('ad_metrics_updated', {
          id: ad._id,
          impressions: ad.impressions,
          clicks: ad.clicks,
        });
      }
    } catch {}
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// PUBLIC: Record ad click
export const recordClick = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ad = await AdCampaign.findByIdAndUpdate(
      id,
      { $inc: { clicks: 1 } },
      { new: true }
    );

    if (!ad) {
      return res.status(404).json({ success: false, message: 'Ad not found' });
    }

    try {
      const io = getIO();
      if (io) {
        io.emit('ad_metrics_updated', {
          id: ad._id,
          impressions: ad.impressions,
          clicks: ad.clicks,
        });
      }
    } catch {}

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
    const count = await AdCampaign.countDocuments();
    if (count === 0) {
      await AdCampaign.insertMany(SEED_ADS).catch(() => {});
    }

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
      badgeText = 'SPONSORED',
      status = 'ACTIVE',
      startDate,
      endDate,
    } = req.body;

    if (!title || !advertiser || !imageUrl || !targetUrl) {
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

    try {
      await AuditLog.create({
        userEmail: req.user?.email || 'admin@nme.com',
        userId: req.user?._id,
        action: 'ad.create',
        description: `Created advertisement campaign "${ad.title}" for ${ad.advertiser}`,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || '',
        status: 'success',
      });
    } catch {}

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
    const updates = { ...req.body };

    const ad = await AdCampaign.findByIdAndUpdate(id, updates, { new: true });
    if (!ad) {
      return res.status(404).json({ success: false, message: 'Ad campaign not found' });
    }

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

    res.status(200).json({
      success: true,
      message: 'Ad campaign deleted',
    });
  } catch (error) {
    next(error);
  }
};
