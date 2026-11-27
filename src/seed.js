import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB, closeDB } from './config/db.js';
import { User } from './models/User.js';
import { Category } from './models/Category.js';
import { Article } from './models/Article.js';
import { Comment } from './models/Comment.js';
import { AuditLog } from './models/AuditLog.js';
import { Setting } from './models/Setting.js';

dotenv.config();

const seedData = async () => {
  try {
    console.log('[Seed] Connecting to database...');
    await connectDB();

    console.log('[Seed] Clearing existing collections...');
    await User.deleteMany({});
    await Category.deleteMany({});
    await Article.deleteMany({});
    await Comment.deleteMany({});
    await AuditLog.deleteMany({});
    await Setting.deleteMany({});

    console.log('[Seed] Creating initial users...');
    const DEMO_PW = 'nme-demo-2026';

    const admin = await User.create({
      name: 'Administrator',
      email: 'admin@nmepublication.com',
      password: DEMO_PW,
      role: 'admin',
      canPublish: true,
      status: 'active',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    });

    const seniorEditor = await User.create({
      name: 'Senior Editor',
      email: 'editor@nmepublication.com',
      password: DEMO_PW,
      role: 'editor',
      canPublish: true,
      status: 'active',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
    });
    const editor = seniorEditor;

    const sectionEditor = await User.create({
      name: 'Section Editor',
      email: 'section.editor@nmepublication.com',
      password: DEMO_PW,
      role: 'section_editor',
      canPublish: true,
      status: 'active',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    });

    const contributor = await User.create({
      name: 'Contributor',
      email: 'contributor@nmepublication.com',
      password: DEMO_PW,
      role: 'contributor',
      canPublish: false,
      status: 'active',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    });

    // Also support local dev aliases
    await User.create({
      name: 'Local Admin',
      email: 'admin@nme.local',
      password: 'AdminSecure2026!',
      role: 'admin',
      canPublish: true,
      status: 'active',
    });

    console.log('[Seed] Creating news categories...');
    const categoriesData = [
      { name: 'Maritime News', slug: 'maritime-news', color: '#0b1f3a', order: 0 },
      { name: 'Shipping', slug: 'shipping', color: '#1b4379', order: 1 },
      { name: 'Ship Management', slug: 'ship-management', color: '#024a70', order: 2 },
      { name: 'Maritime Technology', slug: 'maritime-technology', color: '#004e3b', order: 3 },
      { name: 'Digitalisation and Innovation', slug: 'digitalisation-and-innovation', color: '#4d179a', order: 4 },
      { name: 'Offshore and Energy', slug: 'offshore-and-energy', color: '#7b3306', order: 5 },
      { name: 'Ports and Logistics', slug: 'ports-and-logistics', color: '#82181a', order: 6 },
      { name: 'Maritime Safety', slug: 'maritime-safety', color: '#9a2b1f', order: 7 },
      { name: 'Environment and Sustainability', slug: 'environment-and-sustainability', color: '#004e3b', order: 8 },
      { name: 'Leadership and Business', slug: 'leadership-and-business', color: '#12305a', order: 9 },
    ];

    const categoryMap = {};
    for (const cat of categoriesData) {
      const created = await Category.create(cat);
      categoryMap[cat.slug] = created;
    }

    console.log('[Seed] Creating articles with rich maritime journalism...');
    const articles = [
      {
        title: 'Sample headline: the lead story sits here with room for a full sentence',
        slug: 'sample-headline-the-lead-story-sits-here-with-room-for-a-full-sentence',
        subtitle:
          'A three-line deck expanding on the headline with factual context, key data points, and the immediate operational consequence for commercial vessel operators.',
        content: `
<p class="leading-relaxed">The global maritime sector faces an unprecedented convergence of regulatory deadlines, technological shifts, and geopolitical volatility. As shipowners navigate new carbon intensity measures, operational efficiency has moved from a secondary margin consideration to the central determinant of fleet viability.</p>

<blockquote class="my-6 border-l-4 border-navy-900 pl-4 italic text-navy-900 text-lg">
"The next decade will define maritime leadership not by vessel deadweight, but by data-driven operational transparency and strategic energy transition."
</blockquote>

<p class="leading-relaxed">Recent port data shows average turnaround times stretching across major transshipment hubs. Industry analysts attribute the delays to a mix of unexpected weather anomalies and staggered bunkering protocols as alternative fuel adoption accelerates.</p>

<h3 class="text-xl font-bold font-serif text-navy-900 mt-6 mb-3">Regulatory Headwinds and Fleet Decarbonisation</h3>
<p class="leading-relaxed">With the International Maritime Organization tightening emissions thresholds, commercial carriers are exploring dual-fuel configurations, wind-assisted propulsion systems, and artificial intelligence-driven route planning to trim fuel consumption by up to 14% on transatlantic voyages.</p>
`,
        category: categoryMap['shipping']._id,
        categoryName: 'Shipping',
        author: admin._id,
        authorName: 'Administrator',
        status: 'published',
        isLead: true,
        isBreaking: true,
        featuredImage: {
          url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186ef5f?w=1200',
          alt: 'Container vessel at sea at sunset',
          caption: 'Commercial container vessel proceeding through international shipping lanes.',
        },
        readTime: '4 min read',
        views: 1840,
        publishedAt: new Date(Date.now() - 3600000 * 24),
        tags: ['Decarbonisation', 'Fleet Efficiency', 'IMO Regulations', 'Commercial Shipping'],
        seo: {
          metaTitle: 'Lead Maritime Story | NME Intelligence',
          metaDescription: 'Detailed industry report on operational shifts across commercial fleets.',
        },
      },
      {
        title: 'Digital twins and sensor arrays: redefining real-time hull stress diagnostics',
        slug: 'digital-twins-and-sensor-arrays-redefining-real-time-hull-stress-diagnostics',
        subtitle: 'How automated telemetry streams are replacing scheduled drydock inspections with condition-based maintenance protocols.',
        content: `
<p>Modern bulk carriers are increasingly fitted with fiber-optic strain gauges and acoustic emission sensors that continuously broadcast hull integrity data to shoreside engineering centers. By running synchronized digital twin models in real time, fleet managers can detect micro-fissures and excessive stress concentrations long before structural failures occur.</p>
`,
        category: categoryMap['maritime-technology']._id,
        categoryName: 'Maritime Technology',
        author: editor._id,
        authorName: 'Sarah Jenkins',
        status: 'published',
        isLead: false,
        isBreaking: false,
        featuredImage: {
          url: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800',
          alt: 'Digital sensors and engineering hardware',
          caption: 'Real-time hull monitoring dashboard interface.',
        },
        readTime: '3 min read',
        views: 920,
        publishedAt: new Date(Date.now() - 3600000 * 48),
        tags: ['Digital Twins', 'Hull Stress', 'Telemetry', 'Maintenance'],
      },
      {
        title: 'Autonomous tugs and smart docking operations trial across Northern European ports',
        slug: 'autonomous-tugs-and-smart-docking-operations-trial-across-northern-european-ports',
        subtitle: 'Automated mooring winches and remote-controlled escort tugs demonstrate 30% reduction in harbour maneuvering times.',
        content: `
<p>Pilotage authorities in Antwerp and Rotterdam have concluded initial trials of remote-supervised autonomous tug fleets. Operating under strict geofencing protocols, these tugs maneuver high-tonnage container vessels with centimeter-level precision.</p>
`,
        category: categoryMap['ports-and-logistics']._id,
        categoryName: 'Ports and Logistics',
        author: editor._id,
        authorName: 'Sarah Jenkins',
        status: 'published',
        isLead: false,
        isBreaking: false,
        featuredImage: {
          url: 'https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=800',
          alt: 'Commercial harbour and shipping cranes',
          caption: 'Autonomous harbor tug maneuvers alongside berth.',
        },
        readTime: '5 min read',
        views: 1250,
        publishedAt: new Date(Date.now() - 3600000 * 72),
        tags: ['Automation', 'Smart Ports', 'Logistics', 'Tugs'],
      },
      {
        title: 'Green corridor agreements expand: Ammonia and methanol bunkering infrastructure roadmaps',
        slug: 'green-corridor-agreements-expand-ammonia-and-methanol-bunkering-infrastructure',
        subtitle: 'Port authorities and fuel consortiums finalize multi-billion dollar safety standards for next-generation zero-emission fuel corridors.',
        content: `
<p>A multilateral pact signed by fifteen leading maritime nations establishes harmonized safety guidelines for ammonia and green methanol transfers. Port operators are accelerating cryogenic storage construction to serve dual-fuel newbuilds arriving in late 2027.</p>
`,
        category: categoryMap['environment-and-sustainability']._id,
        categoryName: 'Environment and Sustainability',
        author: contributor._id,
        authorName: 'Marcus Vance',
        status: 'published',
        isLead: false,
        isBreaking: false,
        featuredImage: {
          url: 'https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?w=800',
          alt: 'Green ocean energy infrastructure',
          caption: 'Alternative fuel bunkering facility under construction.',
        },
        readTime: '4 min read',
        views: 840,
        publishedAt: new Date(Date.now() - 3600000 * 96),
        tags: ['Alternative Fuels', 'Green Corridors', 'Methanol', 'Ammonia'],
      },
      {
        title: 'Upcoming: Crew welfare guidelines in the age of long-distance autonomous voyages',
        slug: 'upcoming-crew-welfare-guidelines-autonomous-voyages',
        subtitle: 'How technical automation alters crew shift allocations and seafarer mental health.',
        content: `<p>Editorial draft reviewing international maritime labor updates.</p>`,
        category: categoryMap['ship-management']._id,
        categoryName: 'Ship Management',
        author: contributor._id,
        authorName: 'Marcus Vance',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + 3600000 * 48),
        readTime: '3 min read',
        views: 0,
        tags: ['Seafarers', 'Workforce', 'Safety'],
      },
      {
        title: 'Sample headline: a draft still being written for editorial review',
        slug: 'sample-headline-a-draft-still-being-written-for-editorial-review',
        subtitle: 'Internal notes and commentary on upcoming offshore tender awards.',
        content: `<p>Work in progress draft content for editorial evaluation.</p>`,
        category: categoryMap['offshore-and-energy']._id,
        categoryName: 'Offshore and Energy',
        author: contributor._id,
        authorName: 'Marcus Vance',
        status: 'draft',
        readTime: '2 min read',
        views: 0,
        tags: ['Offshore', 'Tenders', 'Draft'],
      },
    ];

    for (const art of articles) {
      const created = await Article.create(art);
      await Category.findByIdAndUpdate(art.category, { $inc: { articleCount: 1 } });

      // Add a comment on the lead article
      if (art.isLead) {
        await Comment.create({
          article: created._id,
          authorName: 'Capt. Jonathan Reed',
          authorEmail: 'j.reed@maritime-ops.org',
          content: 'Thorough and timely analysis. Fuel telemetry integrations have indeed reduced our voyage costs noticeably over Q3.',
          status: 'approved',
        });
      }
    }

    console.log('[Seed] Creating audit log records...');
    await AuditLog.create([
      {
        userEmail: 'admin@nme.local',
        userId: admin._id,
        action: 'auth.login_success',
        description: 'Administrator signed in to Editorial CRM',
        ipAddress: '127.0.0.1',
        status: 'success',
      },
      {
        userEmail: 'admin@nme.local',
        userId: admin._id,
        action: 'article.create',
        description: 'Created lead story "Sample headline: the lead story sits here..."',
        ipAddress: '127.0.0.1',
        status: 'success',
      },
      {
        userEmail: 'editor@nme.local',
        userId: editor._id,
        action: 'category.create',
        description: 'Initialized maritime news categories',
        ipAddress: '127.0.0.1',
        status: 'success',
      },
    ]);

    console.log('[Seed] Initializing platform settings...');
    await Setting.create({
      publicationName: 'NME',
      tagline: 'Independent Perspectives. Informed Maritime Decisions.',
      contactEmail: 'editor@nme.local',
      linkedinUrl: 'https://www.linkedin.com/company/navigating-marine-excellence',
      aboutText: 'Navigating Marine Excellence is an independent maritime news and editorial intelligence platform providing in-depth analysis on commercial shipping, ports, decarbonisation, and safety.',
    });

    console.log('[Seed] Database successfully seeded! 🎉');
    console.log('----------------------------------------------------');
    console.log('👤 Reference Accounts (Password: nme-demo-2026):');
    console.log('   - admin@nmepublication.com          (Administrator)');
    console.log('   - editor@nmepublication.com         (Senior Editor, can publish)');
    console.log('   - section.editor@nmepublication.com (Section Editor, cannot publish)');
    console.log('   - contributor@nmepublication.com    (Contributor)');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('[Seed] Error seeding database:', error);
  } finally {
    await closeDB();
  }
};

seedData();
