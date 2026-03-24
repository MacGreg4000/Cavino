import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { locations, gridSlots, wines } from '../db/schema.js';
import { z } from 'zod';

const createLocationSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['cellar', 'fridge', 'rack', 'other']),
  color: z.string().optional(),
  gridConfig: z.object({
    rows: z.number().int().min(1).max(50),
    cols: z.number().int().min(1).max(50),
    labelRows: z.array(z.string()),
    labelCols: z.array(z.string()),
    blockedSlots: z.array(z.string()).optional().default([]),
  }),
});

const updateLocationSchema = createLocationSchema.partial();

export async function locationRoutes(app: FastifyInstance) {
  // GET /api/locations
  app.get('/api/locations', async () => {
    return db.select().from(locations).orderBy(locations.name);
  });

  // POST /api/locations — Créer avec génération de slots
  app.post('/api/locations', async (req) => {
    const body = createLocationSchema.parse(req.body);

    const [location] = await db.insert(locations).values({
      name: body.name,
      type: body.type,
      color: body.color,
      gridConfig: body.gridConfig,
    }).returning();

    // Générer les slots de la grille
    const { rows, cols, labelRows, labelCols, blockedSlots } = body.gridConfig;
    const prefix = body.name.substring(0, 2).toUpperCase();

    const slotValues = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const slotId = `${prefix}-${labelRows[r]}${labelCols[c]}`;
        slotValues.push({
          id: slotId,
          locationId: location.id,
          rowIndex: r,
          colIndex: c,
          isBlocked: blockedSlots.includes(slotId),
        });
      }
    }

    if (slotValues.length > 0) {
      await db.insert(gridSlots).values(slotValues);
    }

    return location;
  });

  // PATCH /api/locations/:id
  app.patch('/api/locations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateLocationSchema.parse(req.body);

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.type !== undefined) updates.type = body.type;
    if (body.color !== undefined) updates.color = body.color;
    if (body.gridConfig !== undefined) updates.gridConfig = body.gridConfig;

    const [updated] = await db.update(locations)
      .set(updates)
      .where(eq(locations.id, id))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Location not found' });
    return updated;
  });

  // GET /api/locations/:id/grid — État de la grille avec vins
  app.get('/api/locations/:id/grid', async (req, reply) => {
    const { id } = req.params as { id: string };

    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    if (!location) return reply.status(404).send({ error: 'Location not found' });

    const slots = await db.select({
      slot: gridSlots,
      wine: {
        id: wines.id,
        name: wines.name,
        type: wines.type,
        vintage: wines.vintage,
        domain: wines.domain,
        currentPhase: wines.currentPhase,
      },
    })
      .from(gridSlots)
      .leftJoin(wines, eq(gridSlots.wineId, wines.id))
      .where(eq(gridSlots.locationId, id));

    return { location, slots };
  });
}
