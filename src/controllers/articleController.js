import { Article } from '../models/Article.js';
import { Category } from '../models/Category.js';
import { Comment } from '../models/Comment.js';
import { AuditLog } from '../models/AuditLog.js';
import { Analytics } from '../models/Analytics.js';
import { getIO, getActiveVisitorCount } from '../config/socket.js';

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

    // Automatically ensure any due scheduled articles are published
    const now = new Date();
    await Article.updateMany(
      { status: { $in: ['scheduled', 'SCHEDULED'] }, scheduledAt: { $lte: now } },
      { $set: { status: 'published', publishedAt: now } }
    ).catch(() => {});

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
      .populate('author', 'name avatar role')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit, 10));

    const articlesWithCounts = await Promise.all(
      articles.map(async (art) => {
        const commentCount = await Comment.countDocuments({
          article: art._id,
          status: 'approved',
        });
        return {
          ...art.toObject(),
          commentCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      articles: articlesWithCounts,
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

    // Record real-time analytics & broadcast updated live readership counts
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const clientIp = req.ip || req.connection?.remoteAddress || '127.0.0.1';
      await Analytics.findOneAndUpdate(
        { date: todayStr },
        {
          $inc: { pageViews: 1 },
          $addToSet: { visitorIps: clientIp },
        },
        { upsert: true, new: true }
      );
      await Analytics.updateOne(
        { date: todayStr },
        [{ $set: { uniqueVisitors: { $size: { $ifNull: ['$visitorIps', []] } } } }]
      );

      const readership = await computeReadershipStats();
      const io = getIO();
      if (io) {
        io.emit('readership_stats_updated', {
          totalReads: readership.pageViews,
          activeToday: readership.todayViews,
          liveVisitors: readership.liveVisitors,
        });
      }
    } catch {}

    // Get related articles from the same category
    const relatedArticles = await Article.find({
      category: article.category._id,
      _id: { $ne: article._id },
      status: 'published',
    })
      .limit(3)
      .select('title slug subtitle featuredImage readTime publishedAt');

    // Count approved comments for this article
    const commentCount = await Comment.countDocuments({
      article: article._id,
      status: 'approved',
    });

    res.status(200).json({
      success: true,
      article: {
        ...article.toObject(),
        commentCount,
      },
      relatedArticles,
    });
  } catch (error) {
    next(error);
  }
};

// PUBLIC: Get Lead article & Breaking news ticker
export const getHomepageHighlights = async (req, res, next) => {
  try {
    // Find ALL published articles marked as Feature as Lead Story for carousel slider
    const leadArticles = await Article.find({ status: 'published', isLead: true })
      .sort({ publishedAt: -1, updatedAt: -1 })
      .populate('category', 'name slug color')
      .populate('author', 'name avatar');

    let finalLeadArticles = leadArticles;
    let fallbackLead = leadArticles[0] || null;

    if (finalLeadArticles.length < 2) {
      const topPublished = await Article.find({
        status: 'published',
        _id: { $nin: finalLeadArticles.map((a) => a._id) },
      })
        .sort({ publishedAt: -1 })
        .limit(3)
        .populate('category', 'name slug color')
        .populate('author', 'name avatar');

      finalLeadArticles = [...finalLeadArticles, ...topPublished];
      if (!fallbackLead && finalLeadArticles[0]) {
        fallbackLead = finalLeadArticles[0];
      }
    }

    const breakingNews = await Article.find({ status: 'published', isBreaking: true })
      .sort({ publishedAt: -1 })
      .limit(5)
      .select('title slug publishedAt');

    const trending = await Article.find({ status: 'published' })
      .sort({ views: -1 })
      .limit(5)
      .populate('category', 'name slug color')
      .select('title slug views publishedAt category');

    const leadArticlesWithCounts = await Promise.all(
      finalLeadArticles.map(async (art) => {
        const commentCount = await Comment.countDocuments({
          article: art._id,
          status: 'approved',
        });
        return {
          ...(art.toObject ? art.toObject() : art),
          commentCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      lead: leadArticlesWithCounts[0] || fallbackLead,
      leadArticles: leadArticlesWithCounts,
      breakingNews,
      trending,
    });
  } catch (error) {
    next(error);
  }
};

// CRM / ADMIN: Get articles table list with filters, pagination, and sorting
export const getAdminArticles = async (req, res, next) => {
  try {
    const {
      status,
      category,
      author,
      search,
      page = 1,
      limit = 50,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
    } = req.query;

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (author && author !== 'all') {
      query.author = author;
    }

    if (search && search.trim()) {
      query.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { subtitle: { $regex: search.trim(), $options: 'i' } },
        { authorName: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // If contributor, only see their own articles unless admin/editor
    if (req.user.role === 'contributor') {
      query.author = req.user._id;
    }

    const sortObj = {};
    const validSortFields = [
      'title',
      'status',
      'publishedAt',
      'updatedAt',
      'createdAt',
      'views',
      'categoryName',
      'authorName',
    ];
    const field = validSortFields.includes(sortBy) ? sortBy : 'updatedAt';
    sortObj[field] = sortOrder === 'asc' ? 1 : -1;

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const skip = (pageNum - 1) * limitNum;
    const total = await Article.countDocuments(query);

    const articles = await Article.find(query)
      .populate('category', 'name slug color')
      .populate('author', 'name email role avatar')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum);

    const articlesWithCounts = await Promise.all(
      articles.map(async (art) => {
        const commentCount = await Comment.countDocuments({
          article: art._id,
          status: 'approved',
        });
        return {
          ...art.toObject(),
          commentCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      limit: limitNum,
      articles: articlesWithCounts,
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

// Shared helper to compute live readership statistics from MongoDB + Socket.io
const computeReadershipStats = async () => {
  const totalViewsAgg = await Article.aggregate([
    { $group: { _id: null, totalViews: { $sum: '$views' } } },
  ]);
  const articleViews = totalViewsAgg.length > 0 ? (totalViewsAgg[0].totalViews || 0) : 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayAnalytics = await Analytics.findOne({ date: todayStr });
  const todayViews = todayAnalytics ? todayAnalytics.pageViews : 0;
  const todayVisitors = todayAnalytics ? todayAnalytics.uniqueVisitors : 0;

  const totalAnalyticsAgg = await Analytics.aggregate([
    {
      $group: {
        _id: null,
        totalPageViews: { $sum: '$pageViews' },
        totalUniqueVisitors: { $sum: '$uniqueVisitors' },
      },
    },
  ]);
  const recordedViews = totalAnalyticsAgg[0]?.totalPageViews || 0;
  const allTimeVisitors = totalAnalyticsAgg[0]?.totalUniqueVisitors || 0;

  const pageViews = Math.max(articleViews, recordedViews);
  const monthlyVisitors = Math.max(allTimeVisitors, Math.ceil(pageViews * 0.7));
  const liveVisitors = getActiveVisitorCount();

  return {
    pageViews,
    todayViews,
    todayVisitors,
    monthlyVisitors,
    liveVisitors,
  };
};

// PUBLIC: Live readership counts for website header (available logged-in and logged-out)
export const getPublicReadershipStats = async (req, res, next) => {
  try {
    const readership = await computeReadershipStats();
    res.status(200).json({
      success: true,
      stats: {
        totalReads: readership.pageViews,
        activeToday: readership.todayViews,
        pageViews: readership.pageViews,
        todayViews: readership.todayViews,
        liveVisitors: readership.liveVisitors,
      },
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

    const {
      pageViews,
      todayViews,
      todayVisitors,
      monthlyVisitors,
      liveVisitors,
    } = await computeReadershipStats();

    res.status(200).json({
      success: true,
      stats: {
        totalArticles,
        publishedCount,
        draftCount,
        scheduledCount,
        monthlyVisitors,
        pageViews,
        todayViews,
        todayVisitors,
        liveVisitors,
      },
      mostRead,
      upcomingScheduled,
      recentActivity,
    });
  } catch (error) {
    next(error);
  }
};

// Editorial Calendar: Retrieve all articles formatted for calendar grid & unscheduled sidebar
export const getCalendarArticles = async (req, res, next) => {
  try {
    const { category, author } = req.query;

    const query = {};
    if (category) query.category = category;
    if (author) query.author = author;

    const articles = await Article.find(query)
      .populate('category', 'name slug color')
      .populate('author', 'name email role')
      .sort({ updatedAt: -1 })
      .lean();

    const formatted = articles.map((a) => {
      const at = a.scheduledAt || a.publishedAt || null;
      return {
        _id: a._id,
        id: a._id,
        title: a.title,
        headline: a.title,
        slug: a.slug,
        status: (a.status || 'draft').toUpperCase(),
        scheduledAt: a.scheduledAt,
        publishedAt: a.publishedAt,
        at,
        category: a.category,
        author: a.author,
        categoryId: a.category?._id || a.category,
        authorId: a.author?._id || a.author,
        categoryName: a.categoryName || a.category?.name || 'General',
        authorName: a.authorName || a.author?.name || 'Staff',
      };
    });

    res.status(200).json({
      success: true,
      articles: formatted,
    });
  } catch (error) {
    next(error);
  }
};

// Editorial Calendar: Reschedule or schedule article
export const rescheduleArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({
        success: false,
        message: 'A valid scheduled date and time is required',
      });
    }

    const targetDate = new Date(scheduledAt);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date/time format',
      });
    }

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found',
      });
    }

    const was = article.scheduledAt;
    const isDue = targetDate <= new Date();
    article.scheduledAt = targetDate;
    article.status = isDue ? 'published' : 'scheduled';
    if (isDue) {
      article.publishedAt = targetDate;
    }
    await article.save();

    await AuditLog.create({
      userEmail: req.user?.email || 'admin@nme.com',
      userId: req.user?._id,
      action: isDue ? 'article.publish' : 'article.schedule',
      description: `${was ? 'Rescheduled' : 'Scheduled'} "${article.title}" for ${targetDate.toISOString()} (${isDue ? 'Auto-published immediately' : 'editorial calendar queued'})`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || '',
      status: 'success',
    });

    res.status(200).json({
      success: true,
      message: `${isDue ? 'Published' : was ? 'Rescheduled' : 'Scheduled'} for ${targetDate.toLocaleString('en-GB')}`,
      article,
    });
  } catch (error) {
    next(error);
  }
};

// Manually / programmatically trigger auto-publish sweep
export const triggerAutoPublish = async (req, res, next) => {
  try {
    const { publishDueScheduledArticles } = await import('../services/schedulerService.js');
    const publishedCount = await publishDueScheduledArticles();
    res.status(200).json({
      success: true,
      message: `Checked scheduled articles. ${publishedCount} published.`,
      publishedCount,
    });
  } catch (error) {
    next(error);
  }
};

