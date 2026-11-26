import { Tag } from '../models/Tag.js';
import { Article } from '../models/Article.js';
import { AuditLog } from '../models/AuditLog.js';

export const getTags = async (req, res, next) => {
  try {
    const tags = await Tag.find().sort({ name: 1 });
    
    // Calculate article counts per tag
    const articles = await Article.find({}, 'tags');
    const tagCountMap = {};
    for (const art of articles) {
      if (Array.isArray(art.tags)) {
        for (const t of art.tags) {
          const norm = t.toLowerCase().trim();
          tagCountMap[norm] = (tagCountMap[norm] || 0) + 1;
        }
      }
    }

    const tagsWithCounts = tags.map((t) => ({
      _id: t._id,
      id: t._id,
      name: t.name,
      slug: t.slug,
      description: t.description || '',
      articleCount: tagCountMap[t.name.toLowerCase().trim()] || tagCountMap[t.slug] || 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    res.status(200).json({
      success: true,
      count: tagsWithCounts.length,
      tags: tagsWithCounts,
    });
  } catch (error) {
    next(error);
  }
};

export const createTag = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tag name is required',
      });
    }

    const cleanName = name.trim();
    const slug = cleanName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '');

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'A tag requires valid alphanumeric characters',
      });
    }

    const existing = await Tag.findOne({ slug });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This tag already exists',
      });
    }

    const tag = await Tag.create({
      name: cleanName,
      slug,
      description: description || '',
    });

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'tag.create',
      description: `Created tag "${cleanName}" (${slug})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(201).json({
      success: true,
      message: 'Tag created successfully',
      tag: {
        ...tag.toObject(),
        articleCount: 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateTag = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tag name is required',
      });
    }

    const tag = await Tag.findById(id);
    if (!tag) {
      return res.status(404).json({
        success: false,
        message: 'Tag not found',
      });
    }

    const oldName = tag.name;
    const newName = name.trim();
    const newSlug = newName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '');

    // Check slug collision
    const existing = await Tag.findOne({ slug: newSlug, _id: { $ne: id } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Another tag already has this name/slug',
      });
    }

    tag.name = newName;
    tag.slug = newSlug;
    if (description !== undefined) tag.description = description;
    await tag.save();

    // Update references in all articles
    await Article.updateMany(
      { tags: oldName },
      { $set: { 'tags.$': newName } }
    );

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'tag.update',
      description: `Renamed tag from "${oldName}" to "${newName}"`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: 'Tag updated successfully',
      tag,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTag = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tag = await Tag.findById(id);

    if (!tag) {
      return res.status(404).json({
        success: false,
        message: 'Tag not found',
      });
    }

    const tagName = tag.name;

    // Remove this tag from all articles
    await Article.updateMany(
      { tags: tagName },
      { $pull: { tags: tagName } }
    );

    await Tag.findByIdAndDelete(id);

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: 'tag.delete',
      description: `Deleted tag "${tagName}" and unlinked from articles`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `Tag "${tagName}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};
