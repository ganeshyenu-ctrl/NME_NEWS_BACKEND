import { Category } from '../models/Category.js';
import { Article } from '../models/Article.js';
import { AuditLog } from '../models/AuditLog.js';
import { getIO } from '../config/socket.js';

export const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ order: 1, name: 1 });
    res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const { name, slug, description, color, order } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    const finalSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '');

    const existing = await Category.findOne({ slug: finalSlug });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A category with this slug already exists',
      });
    }

    const category = await Category.create({
      name,
      slug: finalSlug,
      description: description || '',
      color: color || '#0b1f3a',
      order: order || 0,
    });

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'category.create',
      description: `Created category "${name}" (/category/${finalSlug})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    try {
      getIO().emit('categories_updated');
    } catch (sockErr) {}

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, slug, description, color, order } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    if (name) category.name = name;
    if (slug) category.slug = slug.toLowerCase().trim().replace(/\s+/g, '-');
    if (description !== undefined) category.description = description;
    if (color) category.color = color;
    if (order !== undefined) category.order = order;

    await category.save();

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'category.update',
      description: `Updated category "${category.name}"`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    try {
      getIO().emit('categories_updated');
    } catch (sockErr) {}

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      category,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    const linkedArticles = await Article.countDocuments({ category: id });
    if (linkedArticles > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category: ${linkedArticles} articles are assigned to it. Reassign or delete articles first.`,
      });
    }

    await Category.findByIdAndDelete(id);

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'category.delete',
      description: `Deleted category "${category.name}"`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    try {
      getIO().emit('categories_updated');
    } catch (sockErr) {}

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
