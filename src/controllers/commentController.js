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

    const comment = await Comment.create({
      article: articleId,
      authorName: cleanAuthorName,
      authorEmail: authorEmail.toLowerCase().trim(),
      content: cleanContent,
      status: 'approved',
      ipAddress: req.ip || req.connection.remoteAddress || '127.0.0.1',
    });

    // Real-time broadcast to all readers on article page
    try {
      const io = getIO();
      io.to(`article:${article.slug}`).emit('new_comment', {
        articleSlug: article.slug,
        comment: {
          _id: comment._id,
          authorName: comment.authorName,
          content: comment.content,
          createdAt: comment.createdAt,
        },
      });
    } catch (sockErr) {}

    res.status(201).json({
      success: true,
      message: 'Comment posted successfully',
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
