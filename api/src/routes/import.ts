import type { FastifyPluginAsync } from 'fastify';
import { scanInboxFolder } from '../inbox-import.js';

export const importRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/import/scan', async () => scanInboxFolder());
};
