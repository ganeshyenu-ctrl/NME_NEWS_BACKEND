import { Article } from '../models/Article.js';
import { Category } from '../models/Category.js';
import { AuditLog } from '../models/AuditLog.js';
import { getIO } from '../config/socket.js';

// Helper to generate URL safe slug
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

// PUBLIC: Get published articles (with category filter, search, pagination)
export const getPublicArticles = async (req, res, next) => {
  try {
    const { category, search, page = 1, limit = 10, sort = 'newest' } = req.query;

    const query = { status: 'published' };

    if (category) {
      const catDoc = await Category.findOne({ slug: category });
      if (catDoc) {
        query.category = catDoc._id;
      }
    }

    if (search && search.trim()) {
      query.$text = { $search: search.trim() };
    }

    const sortOptions = {};
    if (sort === 'popular') {
      sortOptions.views = -1;
    } else {
      sortOptions.publishedAt = -1;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Article.countDocuments(query);

    const articles = await Article.find(query)
      .populate('category', 'name slug color')
      .populate('author', 'name avatar')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit, 10));

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      articles,
    });
  } catch (error) {
    next(error);
  }
};

// PUBLIC: Get single article by slug
export const getArticleBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const article = await Article.findOne({ slug })
      .populate('category', 'name slug color description')
      .populate('author', 'name avatar role');

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found',
      });
    }

    // Increment views atomically
    await Article.updateOne({ _id: article._id }, { $inc: { views: 1 } });
    article.views += 1;

    // Get related articles from the same category
    const relatedArticles = await Article.find({
      category: article.category._id,
      _id: { $ne: article._id },
      status: 'published',
    })
      .limit(3)
      .select('title slug subtitle featuredImage readTime publishedAt');

    res.status(200).json({
      success: true,
      article,
      relatedArticles,
    });
  } catch (error) {
    next(error);
  }
};

// PUBLIC: Get Lead article & Breaking news ticker
export const getHomepageHighlights = async (req, res, next) => {
  try {
    const lead = await Article.findOne({ status: 'published', isLead: true })
      .populate('category', 'name slug color')
      .populate('author', 'name avatar');

    const fallbackLead =
      lead ||
      (await Article.findOne({ status: 'published' })
        .sort({ publishedAt: -1 })
        .populate('category', 'name slug color')
        .populate('author', 'name avatar'));

    const breakingNews = await Article.find({ status: 'published', isBreaking: true })
      .sort({ publishedAt: -1 })
      .limit(5)
      .select('title slug publishedAt');

    const trending = await Article.find({ status: 'published' })
      .sort({ views: -1 })
      .limit(5)
      .populate('category', 'name slug color')
      .select('title slug views publishedAt category');

    res.status(200).json({
      success: true,
      lead: fallbackLead,
      breakingNews,
      trending,
    });
  } catch (error) {
    next(error);
  }
};

// CRM / ADMIN: Get articles table list
export const getAdminArticles = async (req, res, next) => {
  try {
    const { status, category, search, page = 1, limit = 15 } = req.query;

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (category) {
      query.category = category;
    }

    if (search && search.trim()) {
      query.title = { $regex: search.trim(), $options: 'i' };
    }

    // If contributor, only see their own articles unless admin/editor
    if (req.user.role === 'contributor') {
      query.author = req.user._id;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Article.countDocuments(query);

    const articles = await Article.find(query)
      .populate('category', 'name slug color')
      .populate('author', 'name email avatar')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      articles,
    });
  } catch (error) {
    next(error);
  }
};

// CRM: Create Article
export const createArticle = async (req, res, next) => {
  try {
    const {
      title,
      slug: customSlug,
      subtitle,
      content,
      category,
      status = 'draft',
      isLead = false,
      isBreaking = false,
      featuredImage,
      readTime,
      scheduledAt,
      tags = [],
      seo,
    } = req.body;

    if (!title || !content || !category) {
      return res.status(400).json({
        success: false,
        message: 'Title, content, and category are required',
      });
    }

    const catDoc = await Category.findById(category);
    if (!catDoc) {
      return res.status(400).json({
        success: false,
        message: 'Selected category does not exist',
      });
    }

    let finalSlug = customSlug ? slugify(customSlug) : slugify(title);
    // Check slug uniqueness
    const existing = await Article.findOne({ slug: finalSlug });
    if (existing) {
      finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
    }

    // Role check: Contributors cannot publish directly
    let finalStatus = status;
    if (req.user.role === 'contributor' && status === 'published') {
      finalStatus = 'draft';
    }

    const publishedAt = finalStatus === 'published' ? new Date() : null;

    // If lead is true, unset previous lead
    if (isLead) {
      await Article.updateMany({ isLead: true }, { isLead: false });
    }

    const newArticle = await Article.create({
      title,
      slug: finalSlug,
      subtitle: subtitle || '',
      content,
      category,
      categoryName: catDoc.name,
      author: req.user._id,
      authorName: req.user.name,
      status: finalStatus,
      isLead,
      isBreaking,
      featuredImage: featuredImage || { url: '', alt: '', caption: '' },
      readTime: readTime || '3 min read',
      scheduledAt: scheduledAt || null,
      publishedAt,
      tags: Array.isArray(tags) ? tags : [],
      seo: seo || { metaTitle: title, metaDescription: subtitle || '' },
    });

    // Increment category articleCount
    await Category.findByIdAndUpdate(category, { $inc: { articleCount: 1 } });

    // Record audit log
    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'article.create',
      description: `Created article "${title}" with status '${finalStatus}'`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
      details: { articleId: newArticle._id, slug: finalSlug },
    });

    // Socket.io Real-time Broadcast
    try {
      const io = getIO();
      if (finalStatus === 'published') {
        io.emit('new_article_published', {
          id: newArticle._id,
          title: newArticle.title,
          slug: newArticle.slug,
          categoryName: catDoc.name,
          publishedAt: newArticle.publishedAt,
        });

        if (isBreaking) {
          io.emit('breaking_news_alert', {
            title: newArticle.title,
            slug: newArticle.slug,
          });
        }
      }

      // Notify CRM editorial stream
      io.to('crm_editorial').emit('editorial_activity', {
        type: 'article_created',
        user: req.user.name,
        title: newArticle.title,
        timestamp: new Date(),
      });
    } catch (sockErr) {
      console.warn('[Socket.io] Broadcast skipped:', sockErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Article created successfully',
      article: newArticle,
    });
  } catch (error) {
    next(error);
  }
};

// CRM: Update Article
export const updateArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found',
      });
    }

    // Authorization: Contributors can only edit their own drafts
    if (req.user.role === 'contributor' && article.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own articles',
      });
    }

    const {
      title,
      slug: customSlug,
      subtitle,
      content,
      category,
      status,
      isLead,
      isBreaking,
      featuredImage,
      readTime,
      scheduledAt,
      tags,
      seo,
    } = req.body;

    if (title) article.title = title;
    if (subtitle !== undefined) article.subtitle = subtitle;
    if (content) article.content = content;
    if (readTime) article.readTime = readTime;
    if (tags !== undefined) article.tags = tags;
    if (seo !== undefined) article.seo = seo;
    if (featuredImage !== undefined) article.featuredImage = featuredImage;

    if (category && category !== article.category.toString()) {
      const newCat = await Category.findById(category);
      if (newCat) {
        // adjust counts
        await Category.findByIdAndUpdate(article.category, { $inc: { articleCount: -1 } });
        await Category.findByIdAndUpdate(category, { $inc: { articleCount: 1 } });
        article.category = category;
        article.categoryName = newCat.name;
      }
    }

    if (customSlug && customSlug !== article.slug) {
      article.slug = slugify(customSlug);
    }

    if (isLead !== undefined) {
      if (isLead && !article.isLead) {
        await Article.updateMany({ isLead: true }, { isLead: false });
      }
      article.isLead = isLead;
    }

    if (isBreaking !== undefined) article.isBreaking = isBreaking;
    if (scheduledAt !== undefined) article.scheduledAt = scheduledAt;

    // Status transition
    if (status && status !== article.status) {
      if (req.user.role === 'contributor' && status === 'published') {
        // Ignored for contributor
      } else {
        article.status = status;
        if (status === 'published' && !article.publishedAt) {
          article.publishedAt = new Date();
        }
      }
    }

    await article.save();

    // Audit log
    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'article.update',
      description: `Updated article "${article.title}" (Status: ${article.status})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
      details: { articleId: article._id },
    });

    // Real-time notification
    try {
      const io = getIO();
      if (article.status === 'published' && article.isBreaking) {
        io.emit('breaking_news_alert', {
          title: article.title,
          slug: article.slug,
        });
      }

      // Real-time public refresh when published
      if (article.status === 'published') {
        io.emit('new_article_published', {
          id: article._id,
          title: article.title,
          slug: article.slug,
          categoryName: article.categoryName,
          publishedAt: article.publishedAt,
        });
      }

      io.to('crm_editorial').emit('editorial_activity', {
        type: 'article_updated',
        user: req.user.name,
        title: article.title,
        timestamp: new Date(),
      });
    } catch (sockErr) {}

    res.status(200).json({
      success: true,
      message: 'Article updated successfully',
      article,
    });
  } catch (error) {
    next(error);
  }
};

// CRM: Delete Article
export const deleteArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found',
      });
    }

    // Role check: Only admin or editor can delete articles
    if (req.user.role === 'contributor') {
      return res.status(403).json({
        success: false,
        message: 'Contributors do not have permission to delete articles',
      });
    }

    await Article.findByIdAndDelete(id);
    await Category.findByIdAndUpdate(article.category, { $inc: { articleCount: -1 } });

    await AuditLog.create({
      userEmail: req.user.email,
      userId: req.user._id,
      action: 'article.delete',
      description: `Deleted article "${article.title}"`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    // Real-time notification: trigger public refresh and CRM activity
    try {
      const io = getIO();
      io.emit('new_article_published', { id, deleted: true });
      io.to('crm_editorial').emit('editorial_activity', {
        type: 'article_deleted',
        user: req.user.name,
        title: article.title,
        timestamp: new Date(),
      });
    } catch (sockErr) {}

    res.status(200).json({
      success: true,
      message: 'Article deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// CRM: Dashboard Stats & Analytics
export const getDashboardStats = async (req, res, next) => {
  try {
    const totalArticles = await Article.countDocuments();
    const publishedCount = await Article.countDocuments({ status: 'published' });
    const draftCount = await Article.countDocuments({ status: 'draft' });
    const scheduledCount = await Article.countDocuments({ status: 'scheduled' });

    // Most-read articles
    const mostRead = await Article.find({ status: 'published' })
      .sort({ views: -1 })
      .limit(5)
      .populate('category', 'name slug')
      .select('title slug views publishedAt category');

    // Upcoming scheduled articles
    const upcomingScheduled = await Article.find({ status: 'scheduled' })
      .sort({ scheduledAt: 1 })
      .limit(5)
      .populate('category', 'name slug')
      .populate('author', 'name');

    // Recent activity audit logs
    const recentActivity = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(6)
      .select('userEmail action description timestamp status');

    res.status(200).json({
      success: true,
      stats: {
        totalArticles,
        publishedCount,
        draftCount,
        scheduledCount,
        monthlyVisitors: 38400,
        pageViews: 142900,
      },
      mostRead,
      upcomingScheduled,
      recentActivity,
    });
  } catch (error) {
    next(error);
  }
};
