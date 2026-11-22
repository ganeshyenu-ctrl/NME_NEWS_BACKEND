import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';

dotenv.config();

let memoryServer = null;

// Ensure Node DNS can resolve MongoDB Atlas SRV records reliably on Windows
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch {
  // Ignore if custom DNS cannot be set
}

// Helper to normalize and auto-encode special characters in MongoDB URI password
const normalizeMongoUri = (rawUri) => {
  if (!rawUri) return 'mongodb://127.0.0.1:27017/nme_news_db';
  try {
    const match = rawUri.match(/^(mongodb(?:\+srv)?:\/\/)([^:]+):(.*)@([^/?#]+)(.*)$/);
    if (match) {
      const [, proto, user, pass, host, rest] = match;
      // If pass contains unencoded '@', encode it as %40
      const encodedPass = pass.includes('@') ? pass.replace(/@/g, '%40') : pass;
      return `${proto}${user}:${encodedPass}@${host}${rest}`;
    }
  } catch {
    // If regex parsing fails, return raw
  }
  return rawUri;
};

// Helper to mask credentials in MongoDB URI for clean and safe logging
const getSafeMongoUri = (uri) => {
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  } catch {
    return 'mongodb://***';
  }
};

export const connectDB = async () => {
  const configuredUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nme_news_db';
  const uri = normalizeMongoUri(configuredUri);
  const safeUri = getSafeMongoUri(uri);

  try {
    console.log(`[DB] Connecting to Live MongoDB at ${safeUri}...`);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[DB] Successfully connected to Live MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return mongoose.connection;
  } catch (error) {
    console.error(`[DB] Primary Live MongoDB connection failed: ${error.message}`);

    // If Atlas failed (e.g. IP whitelist / network block) and configured URI is Atlas, attempt local MongoDB fallback
    if (uri.includes('mongodb.net')) {
      console.warn('[DB] MongoDB Atlas connection blocked or IP not whitelisted in Atlas Network Access (0.0.0.0/0).');
      console.warn('[DB] Attempting fallback to persistent Local MongoDB (mongodb://127.0.0.1:27017/nme_news_db)...');
      try {
        await mongoose.connect('mongodb://127.0.0.1:27017/nme_news_db', {
          serverSelectionTimeoutMS: 3000,
        });
        console.log('[DB] Successfully connected to persistent Local MongoDB: 127.0.0.1/nme_news_db');
        return mongoose.connection;
      } catch (localErr) {
        console.error(`[DB] Local MongoDB fallback also failed: ${localErr.message}`);
      }
    }

    // Strictly check if memory DB is explicitly enabled (disabled by default for live persistence)
    if (process.env.USE_MEMORY_DB_IF_LOCAL_FAILS === 'true') {
      try {
        console.warn('[DB] WARNING: Launching temporary in-memory MongoDB fallback...');
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        memoryServer = await MongoMemoryServer.create();
        const memUri = memoryServer.getUri();
        await mongoose.connect(memUri);
        console.log(`[DB] Connected to In-Memory MongoDB at ${memUri}`);
        return mongoose.connection;
      } catch (memError) {
        console.error('[DB] Failed to launch MongoMemoryServer:', memError.message);
        throw memError;
      }
    } else {
      console.error('[DB] In-memory fallback is DISABLED. Live database connection is strictly required.');
      throw error;
    }
  }
};

export const closeDB = async () => {
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
  }
};
