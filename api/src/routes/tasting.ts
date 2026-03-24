import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tastingLogs, wines } from '../db/schema.js';
import { z } from 'zod';

const createTastingSchema = z.object({
  wineId: z.string().uuid(),
  rating: z.number().int().min(0).max(100).optional(),
  aromaTags: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
  occasion: z.string().optional(),
  guests: z.array(z.string()).optional().default([]),
});

export async function tastingRoutes(app: FastifyInstance) {
  // GET /api/tasting-logs
  app.get('/api/tasting-logs', async (req) => {
    const query = req.query as Record<string, string>;

    const result = await db.select({
      log: tastingLogs,
      wine: {
        id: wines.id,
        name: wines.name,
        type: wines.type,
        vintage: wines.vintage,
        domain: wines.domain,
        photoUrl: wines.photoUrl,
      },
    })
      .from(tastingLogs)
      .leftJoin(wines, eq(tastingLogs.wineId, wines.id))
      .orderBy(desc(tastingLogs.tastedAt))
      .limit(query.limit ? parseInt(query.limit) : 50);

    return result;
  });

  // POST /api/tasting-logs
  app.post('/api/tasting-logs', async (req) => {
    const body = createTastingSchema.parse(req.body);

    const [log] = await db.insert(tastingLogs).values({
      wineId: body.wineId,
      rating: body.rating,
      aromaTags: body.aromaTags,
      notes: body.notes,
      occasion: body.occasion,
      guests: body.guests,
    }).returning();

    return log;
  });

  // GET /api/tasting-logs/wine/:wineId
  app.get('/api/tasting-logs/wine/:wineId', async (req) => {
    const { wineId } = req.params as { wineId: string };
    return db.select().from(tastingLogs)
      .where(eq(tastingLogs.wineId, wineId))
      .orderBy(desc(tastingLogs.tastedAt));
  });
}
