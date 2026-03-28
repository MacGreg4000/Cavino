import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { wineRoutes } from './routes/wines.js';
import { locationRoutes } from './routes/locations.js';
import { statsRoutes } from './routes/stats.js';
import { tastingRoutes } from './routes/tasting.js';
import { advisorRoutes } from './routes/advisor.js';
import { publicRoutes } from './routes/public.js';
import { startWatcher } from './watcher.js';
import { addClient } from './websocket.js';

const PORT = parseInt(process.env.PORT || '3001');
const PHOTOS_PATH = process.env.PHOTOS_PATH || '/photos';

async function main() {
  const app = Fastify({ logger: true });

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(fastifyWebsocket);
  await app.register(authPlugin);

  // Servir les photos
  await app.register(fastifyStatic, {
    root: path.resolve(PHOTOS_PATH),
    prefix: '/photos/',
    decorateReply: false,
  });

  // WebSocket endpoint (public, pas d'auth)
  app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket) => {
      addClient(socket);
      socket.send(JSON.stringify({ type: 'CONNECTED' }));
    });
  });

  // Health check (public)
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Routes publiques (sans auth)
  await app.register(authRoutes);
  await app.register(publicRoutes);

  // Routes protégées (auth requise)
  await app.register(async (scoped) => {
    scoped.addHook('preHandler', app.requireAuth);
    await scoped.register(wineRoutes);
    await scoped.register(locationRoutes);
    await scoped.register(statsRoutes);
    await scoped.register(tastingRoutes);
    await scoped.register(advisorRoutes);
  });

  // DB connection check au démarrage
  try {
    await import('./db/index.js');
    console.log('📦 Database connection OK');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
  }

  // Démarrer le watcher
  startWatcher();

  // Démarrer le serveur
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 Caveau API running on port ${PORT}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
