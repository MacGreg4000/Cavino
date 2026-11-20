import type { FastifyInstance } from 'fastify';
import { eq, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
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

  // POST /api/walls/:id/background — image de fond personnalisée
  app.post('/api/walls/:id/background', async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = await req.file();
    if (!file) return reply.status(400).send({ error: 'Aucun fichier' });
    if (!file.mimetype.startsWith('image/')) return reply.status(400).send({ error: 'Le fichier doit être une image' });

    const [current] = await db.select().from(walls).where(eq(walls.id, id));
    if (!current) return reply.status(404).send({ error: 'Wall not found' });

    const dir = path.join(process.env.PHOTOS_PATH || '/photos', 'walls');
    await fs.mkdir(dir, { recursive: true });
    const ext = (path.extname(file.filename) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
    const filename = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(dir, filename), await file.toBuffer());

    // supprime l'ancienne image personnalisée
    if (current.background?.startsWith('/photos/walls/')) {
      await fs.unlink(path.join(dir, path.basename(current.background))).catch(() => {});
    }
    const [updated] = await db.update(walls).set({ background: `/photos/walls/${filename}` }).where(eq(walls.id, id)).returning();
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
