import { User } from '../models/User.js';
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
      lastLogin: req.user.lastLogin,
    },
  });
};
