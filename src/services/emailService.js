import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';

/**
 * Check if SMTP credentials are configured in environment variables
 */
export const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST || '';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || '"NME Publications" <editorial@nmepublications.com>';
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  const missing = [];
  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');

  const isConfigured = missing.length === 0;

  return {
    isConfigured,
    host: host || null,
    port,
    secure,
    user: user ? (user.includes('@') ? `${user.split('@')[0].slice(0, 3)}***@${user.split('@')[1]}` : '***') : null,
    from,
    missing,
  };
};

/**
 * Create reusable Nodemailer transporter instance
 */
const createTransporter = () => {
  const config = getSmtpConfig();
  if (!config.isConfigured) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE === 'false' ? false : (parseInt(process.env.SMTP_PORT || '465', 10) === 465),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production' && process.env.SMTP_ALLOW_SELF_SIGNED !== 'true',
    },
  });
};

/**
 * Verify SMTP connection
 */
export const verifySmtpConnection = async () => {
  const config = getSmtpConfig();
  if (!config.isConfigured) {
    return {
      connected: false,
      message: `SMTP not configured. Missing environment variables: ${config.missing.join(', ')}`,
      config,
    };
  }

  try {
    const transporter = createTransporter();
    await transporter.verify();
    return {
      connected: true,
      message: `SMTP server connection verified successfully (${config.host}:${config.port})`,
      config,
    };
  } catch (err) {
    logger.error('SMTP Connection verification failed', { error: err.message });
    return {
      connected: false,
      message: `SMTP connection failed: ${err.message}`,
      error: err.message,
      config,
    };
  }
};

/**
 * Render responsive HTML email template for curated subscriber dispatch
 */
const renderCuratedEmailHtml = ({ subscriberName, subject, customMessage, articles, siteUrl }) => {
  const articlesHtml = articles
    .map((art) => {
      const artUrl = `${siteUrl}/articles/${art.slug}`;
      const catName = typeof art.category === 'object' ? art.category?.name : art.category || 'Maritime Intelligence';
      const readTime = art.readTime || '4 min read';
      const publishedDate = art.publishedAt
        ? new Date(art.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';

      return `
        <div style="background-color: #ffffff; border: 1px solid #dfe3e8; border-radius: 8px; margin-bottom: 20px; overflow: hidden;">
          <div style="padding: 20px;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #1b4379; letter-spacing: 0.5px; margin-bottom: 6px;">
              ${catName} &bull; ${readTime} ${publishedDate ? `&bull; ${publishedDate}` : ''}
            </div>
            <h3 style="font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 700; line-height: 1.35; color: #0b1f3a; margin: 0 0 8px 0;">
              <a href="${artUrl}" style="color: #0b1f3a; text-decoration: none;" target="_blank">
                ${art.title || art.headline}
              </a>
            </h3>
            ${
              art.subtitle
                ? `<p style="font-size: 13px; line-height: 1.5; color: #5d6673; margin: 0 0 14px 0;">${art.subtitle}</p>`
                : ''
            }
            <div>
              <a href="${artUrl}" style="display: inline-block; font-size: 12px; font-weight: 600; color: #0b1f3a; text-decoration: none; border-bottom: 2px solid #0b1f3a; padding-bottom: 2px;" target="_blank">
                Read Full Dispatch &rarr;
              </a>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f7f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #23272e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f6f7f9; padding: 30px 15px;">
    <tr>
      <td align="center">
        <!-- Container Box -->
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #dcdfe4; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #0b1f3a; padding: 24px 30px; text-align: center;">
              <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: 2px;">
                NME
              </div>
              <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #dfe7f2; margin-top: 4px;">
                Navigating Marine Excellence &bull; Strategic Intelligence
              </div>
            </td>
          </tr>

          <!-- Editorial Greeting & Intro -->
          <tr>
            <td style="padding: 30px 30px 15px 30px;">
              <h2 style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: 700; color: #0b1f3a; margin: 0 0 12px 0;">
                Dear ${subscriberName || 'Valued Subscriber'},
              </h2>
              ${
                customMessage
                  ? `<div style="background-color: #f2f5fa; border-left: 4px solid #1b4379; padding: 14px 18px; border-radius: 4px; font-size: 13px; line-height: 1.6; color: #23272e; margin-bottom: 24px; white-space: pre-line;">
                      ${customMessage}
                    </div>`
                  : `<p style="font-size: 14px; line-height: 1.6; color: #5d6673; margin: 0 0 24px 0;">
                      Here is your curated maritime intelligence briefing based on your subscribed topic interests and fleet updates.
                    </p>`
              }
              
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #5d6673; margin-bottom: 16px; border-bottom: 1px solid #dfe3e8; padding-bottom: 8px;">
                Featured Intelligence (${articles.length} Dispatches)
              </div>
            </td>
          </tr>

          <!-- Articles Section -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              ${articlesHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f2f5fa; border-top: 1px solid #dcdfe4; padding: 24px 30px; text-align: center; font-size: 11px; line-height: 1.6; color: #5d6673;">
              <p style="margin: 0 0 8px 0; font-weight: 600; color: #0b1f3a;">
                NME Publications &bull; Independent Perspectives. Informed Decisions.
              </p>
              <p style="margin: 0 0 12px 0;">
                You are receiving this intelligence dispatch because you subscribed with your work email.
              </p>
              <p style="margin: 0;">
                <a href="${siteUrl}/newsletter" style="color: #1b4379; text-decoration: underline;">Update Topic Preferences</a>
                &nbsp;&bull;&nbsp;
                <a href="${siteUrl}/news" style="color: #1b4379; text-decoration: underline;">Visit Newsroom Wire</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

/**
 * Send curated email dispatch to a subscriber
 */
export const sendCuratedEmail = async ({
  to,
  subscriberName,
  subject,
  customMessage,
  articles = [],
}) => {
  const config = getSmtpConfig();
  const siteUrl = process.env.PUBLIC_FRONTEND_URL || 'https://nmepublications.com';
  const cleanSubject = subject || 'NME Strategic Intelligence: Curated Maritime Dispatches';

  // If SMTP is NOT configured, simulate dispatch safely
  if (!config.isConfigured) {
    logger.info('SMTP not configured. Email dispatch simulated.', {
      to,
      subject: cleanSubject,
      articleCount: articles.length,
      missing: config.missing,
    });

    return {
      success: true,
      simulated: true,
      recipient: to,
      subject: cleanSubject,
      articleCount: articles.length,
      reason: `SMTP credentials (${config.missing.join(', ')}) not set in backend .env`,
      message: `Simulated dispatch: SMTP is not configured in backend .env. Email was logged to audit.`,
    };
  }

  // SMTP is configured -> Send live email via Nodemailer
  try {
    const transporter = createTransporter();
    const html = renderCuratedEmailHtml({
      subscriberName,
      subject: cleanSubject,
      customMessage,
      articles,
      siteUrl,
    });

    const info = await transporter.sendMail({
      from: config.from,
      to,
      subject: cleanSubject,
      html,
      text: `${cleanSubject}\n\nDear ${subscriberName || 'Subscriber'},\n\n${customMessage || ''}\n\nArticles:\n${articles.map((a) => `- ${a.title || a.headline}: ${siteUrl}/articles/${a.slug}`).join('\n')}\n\n---\nNME Publications: ${siteUrl}`,
    });

    logger.info('Curated email sent via SMTP', {
      to,
      messageId: info.messageId,
      articleCount: articles.length,
    });

    return {
      success: true,
      simulated: false,
      recipient: to,
      subject: cleanSubject,
      messageId: info.messageId,
      articleCount: articles.length,
      message: `Live email successfully delivered to ${to} via SMTP!`,
    };
  } catch (err) {
    logger.error('Failed to send email via SMTP', { to, error: err.message });
    throw new Error(`SMTP Error: ${err.message}`);
  }
};
