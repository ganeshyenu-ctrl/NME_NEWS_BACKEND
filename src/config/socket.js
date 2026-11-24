import { Server } from 'socket.io';

let ioInstance = null;
const activeArticleReaders = new Map(); // articleSlug -> Set(socketId)

export const initSocket = (httpServer) => {
  const getAllowedOrigins = () => {
    const envOrigins = (process.env.FRONTEND_URL || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return [
      'https://nmepublications.com',
      'https://www.nmepublications.com',
      'http://localhost:3000',
      'http://localhost:5000',
      ...envOrigins,
    ];
  };

  ioInstance = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const origins = getAllowedOrigins();
        if (
          origins.includes(origin) ||
          origin.endsWith('.nmepublications.com') ||
          origin.startsWith('http://localhost:')
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  ioInstance.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);
    broadcastLiveVisitors();

    // Join article room to track active readers
    socket.on('join_article', (articleSlug) => {
      if (!articleSlug) return;
      socket.join(`article:${articleSlug}`);

      if (!activeArticleReaders.has(articleSlug)) {
        activeArticleReaders.set(articleSlug, new Set());
      }
      activeArticleReaders.get(articleSlug).add(socket.id);

      const count = activeArticleReaders.get(articleSlug).size;
      ioInstance.to(`article:${articleSlug}`).emit('reader_count_update', {
        articleSlug,
        activeReaders: count,
      });
      console.log(`[Socket.io] ${socket.id} joined article:${articleSlug} (Readers: ${count})`);
    });

    // Leave article room
    socket.on('leave_article', (articleSlug) => {
      if (!articleSlug) return;
      socket.leave(`article:${articleSlug}`);

      if (activeArticleReaders.has(articleSlug)) {
        activeArticleReaders.get(articleSlug).delete(socket.id);
        const count = activeArticleReaders.get(articleSlug).size;
        ioInstance.to(`article:${articleSlug}`).emit('reader_count_update', {
          articleSlug,
          activeReaders: count,
        });
      }
    });

    // Join CRM editorial room
    socket.on('join_crm', () => {
      socket.join('crm_editorial');
      console.log(`[Socket.io] Staff user joined crm_editorial: ${socket.id}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      // Remove from all active article counts
      for (const [slug, sockets] of activeArticleReaders.entries()) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          ioInstance.to(`article:${slug}`).emit('reader_count_update', {
            articleSlug: slug,
            activeReaders: sockets.size,
          });
        }
      }
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      broadcastLiveVisitors();
    });
  });

  return ioInstance;
};

const broadcastLiveVisitors = () => {
  if (ioInstance) {
    try {
      const liveCount = Math.max(1, ioInstance.engine?.clientsCount || 1);
      ioInstance.to('crm_editorial').emit('live_visitors_update', {
        liveVisitors: liveCount,
      });
    } catch {}
  }
};

export const getActiveVisitorCount = () => {
  if (!ioInstance || !ioInstance.engine) return 1;
  return Math.max(1, ioInstance.engine.clientsCount || 1);
};

export const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.io has not been initialized yet!');
  }
  return ioInstance;
};
