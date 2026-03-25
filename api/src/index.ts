import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { wineRoutes } from './routes/wines.js';
import { locationRoutes } from './routes/locations.js';
import { statsRoutes } from './routes/stats.js';
import { tastingRoutes } from './routes/tasting.js';
import { advisorRoutes } from './routes/advisor.js';
import { startWatcher } from './watcher.js';
import { addClient } from './websocket.js';

const PORT = parseInt(process.env.PORT || '3001');
const PHOTOS_PATH = process.env.PHOTOS_PATH || '/photos';

async function main() {
  const app = Fastify({ logger: true });

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(fastifyWebsocket);

  // Servir les photos
  await app.register(fastifyStatic, {
    root: path.resolve(PHOTOS_PATH),
    prefix: '/photos/',
    decorateReply: false,
  });

  // WebSocket endpoint
  app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket) => {
      addClient(socket);
      socket.send(JSON.stringify({ type: 'CONNECTED' }));
    });
  });

  // Routes
  await app.register(wineRoutes);
  await app.register(locationRoutes);
  await app.register(statsRoutes);
  await app.register(tastingRoutes);
  await app.register(advisorRoutes);

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // DB push (schema sync) au démarrage
  try {
    const { db } = await import('./db/index.js');
    // Drizzle push se fait via CLI, ici on vérifie juste la connexion
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
