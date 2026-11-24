import { Setting } from '../models/Setting.js';
import { AuditLog } from '../models/AuditLog.js';
import { getIO } from '../config/socket.js';

export const getSettings = async (req, res, next) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = await Setting.create({});
    }

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSettings = async (req, res, next) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting();
    }

    const {
      publicationName,
      tagline,
      contactEmail,
      linkedinUrl,
      aboutText,
      termsText,
      privacyText,
      maintenanceMode,
    } = req.body;

    if (publicationName !== undefined) settings.publicationName = publicationName;
    if (tagline !== undefined) settings.tagline = tagline;
    if (contactEmail !== undefined) settings.contactEmail = contactEmail;
    if (linkedinUrl !== undefined) settings.linkedinUrl = linkedinUrl;
    if (aboutText !== undefined) settings.aboutText = aboutText;
    if (termsText !== undefined) settings.termsText = termsText;
    if (privacyText !== undefined) settings.privacyText = privacyText;
    if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;

    await settings.save();

    // Broadcast updated settings in real time to all connected web clients
    try {
      getIO().emit('settings_updated', settings);
    } catch {}

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'settings.update',
      description: `Updated platform settings`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      settings,
    });
  } catch (error) {
    next(error);
  }
};
