import { User } from '../models/User.js';
import { Article } from '../models/Article.js';
import { AuditLog } from '../models/AuditLog.js';

export const getUsers = async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role = 'contributor', canPublish } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email address already exists',
      });
    }

    const resolvedCanPublish =
      role === 'admin'
        ? true
        : role === 'section_editor' || role === 'contributor'
        ? false
        : canPublish !== undefined
        ? Boolean(canPublish)
        : true;

    const newUser = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password,
      role,
      canPublish: resolvedCanPublish,
    });

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'user.create',
      description: `Created new staff account "${name}" (${cleanEmail}) with role '${role}'`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        canPublish: newUser.canPublish,
        status: newUser.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, role, status, canPublish, password } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    let nameChanged = false;
    if (name && name.trim() && name.trim() !== user.name) {
      user.name = name.trim();
      nameChanged = true;
    }
    if (role) user.role = role;
    if (status) user.status = status;
    if (canPublish !== undefined) user.canPublish = canPublish;
    if (password && password.length >= 8) {
      user.password = password; // Hashed by User pre-save hook
    }

    await user.save();

    // Automatically sync authorName across all authored articles
    if (nameChanged) {
      await Article.updateMany({ author: user._id }, { authorName: user.name });
    }

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'user.update',
      description: `Updated staff user ${user.email} (Role: ${user.role}, Status: ${user.status}${password ? ', Password Reset' : ''})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
};

export const directResetPassword = async (req, res, next) => {
  try {
    const { email, userId, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
    }

    let user = null;
    if (userId) {
      user = await User.findById(userId).select('+password');
    } else if (email) {
      user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Target user account not found',
      });
    }

    user.password = newPassword;
    await user.save();

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'user.password_reset',
      description: `Admin directly reset password for ${user.email} via Admin Settings`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `Password for ${user.email} has been successfully reset.`,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own administrator account',
      });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'user.delete',
      description: `Deleted staff account ${user.email}`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
