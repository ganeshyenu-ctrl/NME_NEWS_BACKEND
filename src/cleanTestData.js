import dotenv from 'dotenv';
import { connectDB, closeDB } from './config/db.js';
import { Article } from './models/Article.js';
import { Category } from './models/Category.js';
import { Comment } from './models/Comment.js';
import { Media } from './models/Media.js';

dotenv.config();

const cleanTestData = async () => {
  try {
    await connectDB();
    console.log('[Cleanup] Connected to database.');

    // 1. Delete all test articles created by test runs
    const artRes = await Article.deleteMany({
      $or: [
        { slug: { $regex: 'live-dynamic-vessel-sync-test' } },
        { title: { $regex: 'Autonomous Hydrogen Vessel' } },
      ],
    });
    console.log(`[Cleanup] Deleted ${artRes.deletedCount} auto test articles.`);

    // 2. Set original lead story back to isLead: true
    const leadArticle = await Article.findOne({
      slug: 'sample-headline-the-lead-story-sits-here-with-room-for-a-full-sentence',
    });
    if (leadArticle) {
      await Article.updateMany({ isLead: true }, { isLead: false });
      leadArticle.isLead = true;
      leadArticle.isBreaking = false;
      await leadArticle.save();
      console.log(`[Cleanup] Restored original editorial lead story.`);
    }

    // 3. Delete all auto test categories (autonomous-tech-* and Autonomous Fleet / Systems)
    const catRes = await Category.deleteMany({
      $or: [
        { slug: { $regex: '^autonomous-tech-' } },
        { name: { $regex: '^Autonomous' } },
      ],
    });
    console.log(`[Cleanup] Deleted ${catRes.deletedCount} auto test categories.`);

    // 4. Delete test comments
    const comRes = await Comment.deleteMany({
      $or: [
        { authorName: 'Captain James Bennett' },
        { authorEmail: 'j.bennett@pacificlines.com' },
      ],
    });
    console.log(`[Cleanup] Deleted ${comRes.deletedCount} auto test comments.`);

    // 5. Delete test media entries
    const medRes = await Media.deleteMany({
      originalName: 'dynamic-cargo-ship.jpg',
    });
    console.log(`[Cleanup] Deleted ${medRes.deletedCount} auto test media items.`);

    console.log('[Cleanup] Database is completely clean! No auto-generated test data remains.');
  } catch (err) {
    console.error('[Cleanup Error]', err);
  } finally {
    await closeDB();
  }
};

cleanTestData();
