import { Article } from '../models/Article.js';
import { Category } from '../models/Category.js';
import { User } from '../models/User.js';
import { Newsletter } from '../models/Newsletter.js';
import { Analytics } from '../models/Analytics.js';

export const getAnalyticsOverview = async (req, res, next) => {
  try {
    const articles = await Article.find().populate('category author').lean();
    const categories = await Category.find().lean();
    const users = await User.find().lean();
    const subscribers = await Newsletter.find().lean();

    const published = articles.filter((a) =>
      ['published', 'PUBLISHED'].includes(a.status)
    );

    const totalViews = published.reduce((sum, a) => sum + (Number(a.views) || 0), 0);
    const activeSubscribers = subscribers.filter((s) =>
      ['SUBSCRIBED', 'active'].includes(s.status)
    ).length;

    // Top 10 most-read articles
    const mostRead = [...published]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 10)
      .map((a) => ({
        id: a._id,
        _id: a._id,
        headline: a.title,
        slug: a.slug,
        views: a.views || 0,
        publishedAt: a.publishedAt,
        categoryName: a.categoryName || a.category?.name || 'General',
      }));

    // Views by category
    const viewsByCategory = categories.map((cat) => {
      const catArticles = published.filter(
        (a) =>
          String(a.category?._id || a.category) === String(cat._id) ||
          a.categoryName === cat.name
      );
      const catViews = catArticles.reduce((s, a) => s + (Number(a.views) || 0), 0);
      return {
        id: cat._id,
        name: cat.name,
        slug: cat.slug,
        articleCount: catArticles.length,
        views: catViews,
      };
    }).filter((c) => c.articleCount > 0);

    // Published articles by author
    const articlesByAuthor = users.map((u) => {
      const authorArticles = published.filter(
        (a) =>
          String(a.author?._id || a.author) === String(u._id) ||
          a.authorName === u.name
      );
      return {
        id: u._id,
        name: u.name,
        role: u.role,
        count: authorArticles.length,
      };
    }).filter((u) => u.count > 0);

    // Workflow status counts
    const statusCounts = {
      DRAFT: 0,
      UNDER_REVIEW: 0,
      APPROVED: 0,
      SCHEDULED: 0,
      PUBLISHED: 0,
    };

    for (const a of articles) {
      const st = (a.status || 'draft').toUpperCase();
      if (['DRAFT'].includes(st)) statusCounts.DRAFT++;
      else if (['UNDER_REVIEW', 'UNDER-REVIEW'].includes(st)) statusCounts.UNDER_REVIEW++;
      else if (['APPROVED'].includes(st)) statusCounts.APPROVED++;
      else if (['SCHEDULED'].includes(st)) statusCounts.SCHEDULED++;
      else if (['PUBLISHED'].includes(st)) statusCounts.PUBLISHED++;
      else statusCounts.DRAFT++;
    }

    // Daily visitor trend (last 14 days)
    const dailyTraffic = await Analytics.find()
      .sort({ date: -1 })
      .limit(14)
      .lean();

    res.status(200).json({
      success: true,
      data: {
        publishedCount: published.length,
        totalArticles: articles.length,
        totalViews,
        activeSubscribers,
        mostRead,
        viewsByCategory,
        articlesByAuthor,
        statusCounts,
        dailyTraffic: dailyTraffic.reverse(),
      },
    });
  } catch (error) {
    next(error);
  }
};
