import type { FastifyInstance } from 'fastify';
import { eq, sql, asc, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wineCategories, wines } from '../db/schema.js';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().optional().nullable(),
});

const updateSchema = createSchema.partial().extend({
  sortOrder: z.number().int().optional(),
});

const bulkSchema = z.object({
  wineIds: z.array(z.string().uuid()).min(1),
  categoryId: z.string().uuid(),
  action: z.enum(['add', 'remove']),
});

export async function categoryRoutes(app: FastifyInstance) {
  // GET /api/categories
  app.get('/api/categories', async () => {
    return db.select().from(wineCategories).orderBy(asc(wineCategories.sortOrder), asc(wineCategories.name));
  });

  // POST /api/categories
  app.post('/api/categories', async (req, reply) => {
    const body = createSchema.parse(req.body);

    const existing = await db.select({ id: wineCategories.id })
      .from(wineCategories)
      .where(eq(wineCategories.name, body.name.trim()));
    if (existing.length > 0) {
      return reply.status(409).send({ error: 'Une sous-catégorie porte déjà ce nom' });
    }

    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${wineCategories.sortOrder}), -1)` }).from(wineCategories);

    const [created] = await db.insert(wineCategories).values({
      name: body.name.trim(),
      color: body.color ?? null,
      sortOrder: (max ?? -1) + 1,
    }).returning();
    return reply.status(201).send(created);
  });

  // PATCH /api/categories/:id
  app.patch('/api/categories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateSchema.parse(req.body);

    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) return reply.status(400).send({ error: 'Le nom ne peut pas être vide' });
      const existing = await db.select({ id: wineCategories.id })
        .from(wineCategories)
        .where(eq(wineCategories.name, trimmed));
      if (existing.length > 0 && existing[0].id !== id) {
        return reply.status(409).send({ error: 'Une sous-catégorie porte déjà ce nom' });
      }
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.color !== undefined) updates.color = body.color;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    const [updated] = await db.update(wineCategories)
      .set(updates)
      .where(eq(wineCategories.id, id))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Sous-catégorie introuvable' });
    return updated;
  });

  // DELETE /api/categories/:id — détache la catégorie de toutes les bouteilles avant suppression
  app.delete('/api/categories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    await db.update(wines)
      .set({ categoryIds: sql`array_remove(${wines.categoryIds}, ${id})` })
      .where(sql`${wines.categoryIds} @> ARRAY[${id}]::text[]`);

    const deleted = await db.delete(wineCategories).where(eq(wineCategories.id, id)).returning({ id: wineCategories.id });
    if (deleted.length === 0) return reply.status(404).send({ error: 'Sous-catégorie introuvable' });
    return reply.status(204).send();
  });

  // POST /api/categories/bulk-assign — ajoute/retire une sous-catégorie sur plusieurs bouteilles
  // à la fois (réattribution en masse de bouteilles déjà en cave).
  app.post('/api/categories/bulk-assign', async (req, reply) => {
    const body = bulkSchema.parse(req.body);

    const [category] = await db.select({ id: wineCategories.id }).from(wineCategories).where(eq(wineCategories.id, body.categoryId));
    if (!category) return reply.status(404).send({ error: 'Sous-catégorie introuvable' });

    const expr = body.action === 'add'
      ? sql`(
          SELECT array_agg(DISTINCT c) FROM unnest(
            coalesce(${wines.categoryIds}, ARRAY[]::text[]) || ARRAY[${body.categoryId}]::text[]
          ) AS c
        )`
      : sql`array_remove(coalesce(${wines.categoryIds}, ARRAY[]::text[]), ${body.categoryId})`;

    await db.update(wines)
      .set({ categoryIds: expr })
      .where(inArray(wines.id, body.wineIds));

    return { updated: body.wineIds.length };
  });
}
