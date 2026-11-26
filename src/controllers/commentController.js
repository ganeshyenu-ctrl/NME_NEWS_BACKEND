import sanitizeHtml from 'sanitize-html';
import { Comment } from '../models/Comment.js';
import { Article } from '../models/Article.js';
import { getIO } from '../config/socket.js';

export const getArticleComments = async (req, res, next) => {
  try {
    const { articleId } = req.params;

    const comments = await Comment.find({
      article: articleId,
      status: 'approved',
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      comments,
    });
  } catch (error) {
    next(error);
  }
};

export const postComment = async (req, res, next) => {
  try {
    const { articleId } = req.params;
    const { authorName, authorEmail, content } = req.body;

    if (!authorName || !authorEmail || !content) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and comment message are required',
      });
    }

    const article = await Article.findById(articleId);
    if (!article || article.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Article not found or not published',
      });
    }

    // XSS Sanitization: Strip all dangerous script tags & malicious attributes
    const cleanContent = sanitizeHtml(content.trim(), {
      allowedTags: ['b', 'i', 'em', 'strong', 'p'],
      allowedAttributes: {},
    });

    const cleanAuthorName = sanitizeHtml(authorName.trim(), {
      allowedTags: [],
      allowedAttributes: {},
    });

    // Reader comments require editorial approval before public display
    const comment = await Comment.create({
      article: articleId,
      authorName: cleanAuthorName,
      authorEmail: authorEmail.toLowerCase().trim(),
      content: cleanContent,
      status: 'pending',
      ipAddress: req.ip || req.connection.remoteAddress || '127.0.0.1',
    });

    // Notify connected admins in real-time about new comment awaiting moderation
    try {
      const io = getIO();
      io.emit('admin_new_comment', {
        articleId: article._id,
        articleTitle: article.title,
        comment: {
          _id: comment._id,
          authorName: comment.authorName,
          authorEmail: comment.authorEmail,
          content: comment.content,
          status: comment.status,
          createdAt: comment.createdAt,
        },
      });
    } catch (sockErr) {}

    res.status(201).json({
      success: true,
      message: 'Thank you! Your comment has been submitted and is awaiting editorial review.',
      pending: true,
      comment,
    });
  } catch (error) {
    next(error);
  }
};

// ADMIN: Get all comments with pagination, filters and status breakdown
export const getAdminComments = async (req, res, next) => {
  try {
    const { status = 'all', page = 1, limit = 50, search = '' } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { authorName: { $regex: term, $options: 'i' } },
        { authorEmail: { $regex: term, $options: 'i' } },
        { content: { $regex: term, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [comments, total, pendingCount, approvedCount, spamCount, allCount] = await Promise.all([
      Comment.find(query)
        .populate('article', 'title slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Comment.countDocuments(query),
      Comment.countDocuments({ status: 'pending' }),
      Comment.countDocuments({ status: 'approved' }),
      Comment.countDocuments({ status: 'spam' }),
      Comment.countDocuments({}),
    ]);

    res.status(200).json({
      success: true,
      comments,
      counts: {
        all: allCount,
        pending: pendingCount,
        approved: approvedCount,
        spam: spamCount,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ADMIN: Update comment status (approve, pending, spam)
export const updateCommentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'pending', 'spam'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be approved, pending, or spam.',
      });
    }

    const comment = await Comment.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate('article', 'title slug');

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    // If approved, broadcast live to the public article page
    if (status === 'approved' && comment.article?.slug) {
      try {
        const io = getIO();
        io.to(`article:${comment.article.slug}`).emit('new_comment', {
          articleSlug: comment.article.slug,
          comment: {
            _id: comment._id,
            authorName: comment.authorName,
            content: comment.content,
            createdAt: comment.createdAt,
          },
        });
      } catch (sockErr) {}
    }

    res.status(200).json({
      success: true,
      message: `Comment marked as ${status}`,
      comment,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Comment.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Comment removed',
    });
  } catch (error) {
    next(error);
  }
};
