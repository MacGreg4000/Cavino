import type { FastifyInstance } from 'fastify';
import { eq, ilike, and, ne, sql, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wines, gridSlots } from '../db/schema.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const wineUpdateSchema = z.object({
  name: z.string().optional(),
  domain: z.string().optional(),
  appellation: z.string().optional(),
  vintage: z.number().int().optional(),
  type: z.string().optional(),
  quantity: z.number().int().min(0).optional(),
  locationId: z.string().uuid().optional(),
  slotIds: z.array(z.string()).optional(),
  purchasePrice: z.number().optional(),
  personalRating: z.number().int().min(0).max(100).optional(),
  tastingNotes: z.string().optional(),
  personalComment: z.string().max(10000).optional().nullable(),
  isFavorite: z.boolean().optional(),
  importStatus: z.enum(['pending', 'available', 'consumed']).optional(),
}).passthrough();

const validateSchema = z.object({
  quantity: z.number().int().min(1),
  slotIds: z.array(z.string()).optional().default([]),
  locationId: z.string().uuid().optional(),
  purchasePrice: z.number().optional(),
});

export async function wineRoutes(app: FastifyInstance) {
  // GET /api/wines — Liste avec filtres
  app.get('/api/wines', async (req) => {
    const query = req.query as Record<string, string>;
    const conditions = [];

    if (query.type) conditions.push(eq(wines.type, query.type));
    if (query.region) conditions.push(ilike(wines.region, `%${query.region}%`));
    if (query.search) {
      conditions.push(
        sql`(${wines.name} ILIKE ${'%' + query.search + '%'} OR ${wines.domain} ILIKE ${'%' + query.search + '%'} OR ${wines.appellation} ILIKE ${'%' + query.search + '%'})`
      );
    }
    if (query.status) conditions.push(eq(wines.importStatus, query.status as 'pending' | 'available' | 'consumed'));

    // Par défaut, exclure les pending de la liste principale
    if (!query.status && !query.includePending) {
      conditions.push(eq(wines.importStatus, 'available'));
    }

    const result = await db.select().from(wines)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(wines.createdAt));

    return result;
  });

  // POST /api/wines — Création manuelle
  app.post('/api/wines', async (req, reply) => {
    const body = wineUpdateSchema.parse(req.body);

    const insert: Record<string, unknown> = {
      ...body,
      importStatus: 'available',
    };
    if (body.purchasePrice !== undefined) insert.purchasePrice = body.purchasePrice.toString();
    if ((body as Record<string, unknown>).bottleSize !== undefined) insert.bottleSize = String((body as Record<string, unknown>).bottleSize);

    if (!insert.name) return reply.status(400).send({ error: 'Le nom est requis' });

    const [created] = await db.insert(wines).values(insert as typeof wines.$inferInsert).returning();
    return reply.status(201).send(created);
  });

  // POST /api/wines/:id/photo — Upload photo
  app.post('/api/wines/:id/photo', async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = await req.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });

    const photosPath = process.env.PHOTOS_PATH || '/photos';
    const ext = path.extname(file.filename) || '.jpg';
    const filename = `${crypto.randomUUID()}${ext}`;
    const filepath = path.join(photosPath, filename);

    await fs.mkdir(photosPath, { recursive: true });
    const buffer = await file.toBuffer();
    await fs.writeFile(filepath, buffer);

    const photoUrl = `/photos/${filename}`;
    const [updated] = await db.update(wines)
      .set({ photoUrl, updatedAt: new Date() })
      .where(eq(wines.id, id))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Wine not found' });
    return updated;
  });

  // GET /api/wines/pending — Bouteilles en attente
  app.get('/api/wines/pending', async () => {
    return db.select().from(wines)
      .where(eq(wines.importStatus, 'pending'))
      .orderBy(desc(wines.createdAt));
  });

  // GET /api/wines/:id — Détail
  app.get('/api/wines/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [wine] = await db.select().from(wines).where(eq(wines.id, id));
    if (!wine) return reply.status(404).send({ error: 'Wine not found' });
    return wine;
  });

  // PATCH /api/wines/:id — Mise à jour
  app.patch('/api/wines/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = wineUpdateSchema.parse(req.body);

    // Handle slot reassignment if slotIds provided
    if (body.slotIds !== undefined) {
      // Free all slots currently assigned to this wine
      await db.update(gridSlots)
        .set({ wineId: null })
        .where(eq(gridSlots.wineId, id));

      // Assign the new slots
      if (body.slotIds.length > 0) {
        for (const slotId of body.slotIds) {
          await db.update(gridSlots)
            .set({ wineId: id })
            .where(eq(gridSlots.id, slotId));
        }
      }
    }

    const updates: Record<string, unknown> = { ...body, updatedAt: new Date() };

    // Convert numeric fields to strings for Drizzle numeric columns
    if (body.purchasePrice !== undefined) updates.purchasePrice = body.purchasePrice.toString();

    const [updated] = await db.update(wines)
      .set(updates)
      .where(eq(wines.id, id))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Wine not found' });
    return updated;
  });

  // DELETE /api/wines/:id
  app.delete('/api/wines/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    // Libérer les slots associés
    await db.update(gridSlots)
      .set({ wineId: null })
      .where(eq(gridSlots.wineId, id));

    const [deleted] = await db.delete(wines)
      .where(eq(wines.id, id))
      .returning({ id: wines.id });

    if (!deleted) return reply.status(404).send({ error: 'Wine not found' });
    return { success: true };
  });

  // POST /api/wines/:id/validate — Valider un import
  app.post('/api/wines/:id/validate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = validateSchema.parse(req.body);

    // Check for duplicate before validation
    const [current] = await db.select().from(wines).where(eq(wines.id, id));
    if (!current) return reply.status(404).send({ error: 'Wine not found' });

    const dupConditions = [
      ilike(wines.name, current.name),
      eq(wines.importStatus, 'available'),
      ne(wines.id, id),
    ];
    if (current.domain) dupConditions.push(ilike(wines.domain, current.domain));
    if (current.vintage) dupConditions.push(eq(wines.vintage, current.vintage));

    const [dup] = await db.select({ id: wines.id, name: wines.name })
      .from(wines)
      .where(and(...dupConditions))
      .limit(1);

    if (dup) {
      return reply.status(409).send({
        error: 'duplicate',
        message: `"${dup.name}" existe déjà dans votre cave`,
        existingId: dup.id,
      });
    }

    // Assigner les slots
    if (body.slotIds.length > 0) {
      for (const slotId of body.slotIds) {
        await db.update(gridSlots)
          .set({ wineId: id })
          .where(eq(gridSlots.id, slotId));
      }
    }

    const [updated] = await db.update(wines)
      .set({
        importStatus: 'available',
        quantity: body.quantity,
        slotIds: body.slotIds,
        locationId: body.locationId,
        purchasePrice: body.purchasePrice?.toString(),
        updatedAt: new Date(),
      })
      .where(eq(wines.id, id))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Wine not found' });
    return updated;
  });

  // POST /api/wines/:id/drink — Déboucher
  app.post('/api/wines/:id/drink', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [wine] = await db.select().from(wines).where(eq(wines.id, id));
    if (!wine) return reply.status(404).send({ error: 'Wine not found' });

    const newQuantity = Math.max(0, (wine.quantity || 1) - 1);

    // Libérer un slot si assigné
    if (wine.slotIds && wine.slotIds.length > 0) {
      const slotToFree = wine.slotIds[wine.slotIds.length - 1];
      await db.update(gridSlots)
        .set({ wineId: null })
        .where(eq(gridSlots.id, slotToFree));
    }

    const newSlotIds = wine.slotIds?.slice(0, -1) || [];

    const [updated] = await db.update(wines)
      .set({
        quantity: newQuantity,
        slotIds: newSlotIds,
        importStatus: newQuantity === 0 ? 'consumed' : wine.importStatus,
        updatedAt: new Date(),
      })
      .where(eq(wines.id, id))
      .returning();

    return updated;
  });
}
