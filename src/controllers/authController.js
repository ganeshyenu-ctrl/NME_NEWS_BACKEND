import { User } from '../models/User.js';
import { Article } from '../models/Article.js';
import { AuditLog } from '../models/AuditLog.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
      });
    }

    // Explicitly select password
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      await AuditLog.create({
        userEmail: email,
        action: 'auth.login_failed',
        description: `Failed login attempt: User not found for ${email}`,
        ipAddress: ip,
        userAgent,
        status: 'failure',
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (user.status !== 'active') {
      await AuditLog.create({
        userEmail: email,
        userId: user._id,
        action: 'auth.login_blocked',
        description: `Login attempt for inactive user ${email}`,
        ipAddress: ip,
        userAgent,
        status: 'warning',
      });

      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await AuditLog.create({
        userEmail: email,
        userId: user._id,
        action: 'auth.login_failed',
        description: `Failed login attempt: Password mismatch for ${email}`,
        ipAddress: ip,
        userAgent,
        status: 'failure',
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Generate JWT Tokens
    const tokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken({ id: user._id });

    user.lastLogin = new Date();
    user.refreshToken = refreshToken;
    await user.save();

    await AuditLog.create({
      userEmail: user.email,
      userId: user._id,
      action: 'auth.login_success',
      description: `Staff member ${user.name} (${user.role}) logged in successfully`,
      ipAddress: ip,
      userAgent,
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        canPublish: user.canPublish,
        avatar: user.avatar,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      });
    }

    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'User session expired or user deactivated',
      });
    }

    const newAccessToken = signAccessToken({
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    if (req.user) {
      req.user.refreshToken = null;
      await req.user.save();

      await AuditLog.create({
        userEmail: req.user.email,
        userId: req.user._id,
        action: 'auth.logout',
        description: `User ${req.user.email} logged out`,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || '',
        status: 'success',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      canPublish: req.user.canPublish,
      avatar: req.user.avatar,
      bio: req.user.bio || '',
      lastLogin: req.user.lastLogin,
      createdAt: req.user.createdAt,
    },
  });
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name, avatar, bio } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    let nameChanged = false;
    if (name && name.trim() && name.trim() !== user.name) {
      user.name = name.trim();
      nameChanged = true;
    }
    if (avatar !== undefined) user.avatar = avatar.trim();
    if (bio !== undefined) user.bio = bio.trim();

    await user.save();

    // Automatically sync authorName across all authored articles in real time
    if (nameChanged) {
      await Article.updateMany({ author: user._id }, { authorName: user.name });
    }

    await AuditLog.create({
      userEmail: user.email,
      userId: user._id,
      action: 'user.update',
      description: `User ${user.email} updated their personal profile`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        canPublish: user.canPublish,
        avatar: user.avatar,
        bio: user.bio || '',
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    // If currentPassword is provided, verify it. Admins can also reset directly without old password.
    if (currentPassword) {
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect',
        });
      }
    }

    user.password = newPassword;
    await user.save();

    await AuditLog.create({
      userEmail: user.email,
      userId: user._id,
      action: 'auth.password_change',
      description: `Password updated for ${user.email} directly from Admin Settings`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: 'Password has been successfully updated.',
    });
  } catch (error) {
    next(error);
  }
};
