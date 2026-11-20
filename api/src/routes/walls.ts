import type { FastifyInstance } from 'fastify';
import { eq, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { walls } from '../db/schema.js';

const wallSchema = z.object({
  name: z.string().min(1).max(60),
  background: z.string().max(80).optional(),
});

export async function wallRoutes(app: FastifyInstance) {
  // GET /api/walls — crée un mur par défaut si aucun n'existe encore
  app.get('/api/walls', async () => {
    let list = await db.select().from(walls).orderBy(asc(walls.sortOrder), asc(walls.createdAt));
    if (list.length === 0) {
      await db.insert(walls).values({ name: 'Mur principal', background: 'pierre-eclairee', sortOrder: 0 });
      list = await db.select().from(walls).orderBy(asc(walls.sortOrder), asc(walls.createdAt));
    }
    return list;
  });

  // POST /api/walls
  app.post('/api/walls', async (req) => {
    const body = wallSchema.parse(req.body);
    const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${walls.sortOrder}), -1) + 1` }).from(walls);
    const [created] = await db.insert(walls).values({
      name: body.name,
      background: body.background ?? 'pierre-eclairee',
      sortOrder: Number(next),
    }).returning();
    return created;
  });

  // PATCH /api/walls/:id
  app.patch('/api/walls/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = wallSchema.partial().parse(req.body);
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.background !== undefined) updates.background = body.background;
    if (Object.keys(updates).length === 0) return reply.status(400).send({ error: 'Rien à modifier' });
    const [updated] = await db.update(walls).set(updates).where(eq(walls.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Wall not found' });
    return updated;
  });

  // DELETE /api/walls/:id — les racks de ce mur deviennent "non affichés"
  app.delete('/api/walls/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const all = await db.select({ id: walls.id }).from(walls);
    if (all.length <= 1) {
      return reply.status(409).send({ error: 'last_wall', message: 'Il faut garder au moins un mur.' });
    }
    await db.execute(sql`
      UPDATE locations
      SET wall_position = jsonb_set(coalesce(wall_position, '{"x":0,"y":0}'::jsonb), '{hidden}', 'true'::jsonb)
      WHERE wall_position->>'wallId' = ${id}
    `);
    const [deleted] = await db.delete(walls).where(eq(walls.id, id)).returning({ id: walls.id });
    if (!deleted) return reply.status(404).send({ error: 'Wall not found' });
    return { success: true };
  });
}
