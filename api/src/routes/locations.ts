import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, sql } from 'drizzle-orm';
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

    // Générer les slots — préfixe basé sur l'UUID pour éviter les collisions entre emplacements
    const { rows, cols, labelRows, labelCols, blockedSlots } = body.gridConfig;
    const prefix = location.id.substring(0, 8).toUpperCase();

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

  // GET /api/locations/:id
  app.get('/api/locations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    if (!location) return reply.status(404).send({ error: 'Location not found' });
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

    // Si gridConfig a changé, régénérer les slots
    if (body.gridConfig) {
      const { rows, cols, labelRows, labelCols, blockedSlots = [] } = body.gridConfig;
      // Préfixe basé sur l'UUID de l'emplacement — jamais de collision entre racks
      const prefix = id.substring(0, 8).toUpperCase();

      // ── Migration : renommer les slots occupés avec l'ancien format vers le nouveau préfixe UUID ──
      // Récupérer tous les slots occupés de cet emplacement
      const occupiedSlots = await db.select()
        .from(gridSlots)
        .where(and(eq(gridSlots.locationId, id), sql`${gridSlots.wineId} IS NOT NULL`));

      for (const slot of occupiedSlots) {
        if (slot.rowIndex >= rows || slot.colIndex >= cols) continue; // hors grille
        const newId = `${prefix}-${labelRows[slot.rowIndex]}${labelCols[slot.colIndex]}`;
        if (newId === slot.id) continue; // déjà au bon format

        // Supprimer d'abord le slot vide à la même position s'il existe (évite conflit PK)
        await db.delete(gridSlots)
          .where(and(eq(gridSlots.id, newId), isNull(gridSlots.wineId)));

        // Renommer le slot occupé vers le nouvel identifiant
        await db.update(gridSlots).set({ id: newId }).where(eq(gridSlots.id, slot.id));

        // Mettre à jour wine.slotIds pour refléter le nouvel ID
        if (slot.wineId) {
          await db.execute(
            sql`UPDATE wines SET slot_ids = array_replace(slot_ids, ${slot.id}, ${newId}) WHERE id = ${slot.wineId}`
          );
        }
      }
      // ── Fin migration ──

      // Supprimer les slots non occupés de cet emplacement (libres à recréer)
      await db.delete(gridSlots)
        .where(and(eq(gridSlots.locationId, id), isNull(gridSlots.wineId)));

      const slotValues = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const slotId = `${prefix}-${labelRows[r]}${labelCols[c]}`;
          slotValues.push({
            id: slotId,
            locationId: id,
            rowIndex: r,
            colIndex: c,
            isBlocked: blockedSlots.includes(slotId),
          });
        }
      }

      if (slotValues.length > 0) {
        // ON CONFLICT DO NOTHING : les slots occupés viennent d'être renommés, plus de collision
        await db.insert(gridSlots).values(slotValues).onConflictDoNothing();
      }
    }

    return updated;
  });

  // GET /api/locations/:id/grid — État de la grille avec vins
  app.get('/api/locations/:id/grid', async (req, reply) => {
    const { id } = req.params as { id: string };

    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    if (!location) return reply.status(404).send({ error: 'Location not found' });

    const rawSlots = await db.select({
      slot: gridSlots,
      wine: {
        id: wines.id,
        name: wines.name,
        type: wines.type,
        vintage: wines.vintage,
        domain: wines.domain,
        currentPhase: wines.currentPhase,
        photoUrl: wines.photoUrl,
      },
    })
      .from(gridSlots)
      .leftJoin(wines, eq(gridSlots.wineId, wines.id))
      .where(eq(gridSlots.locationId, id));

    // Dédupliquer par position (rowIndex, colIndex) : préférer le slot occupé
    // Cas possible quand un rack a été re-sauvé après le passage aux IDs UUID,
    // laissant coexister un ancien slot occupé et un nouveau slot vide à la même case.
    const posMap = new Map<string, typeof rawSlots[0]>();
    for (const s of rawSlots) {
      const key = `${s.slot.rowIndex}-${s.slot.colIndex}`;
      const existing = posMap.get(key);
      if (!existing || (!existing.wine && s.wine)) {
        posMap.set(key, s);
      }
    }
    const slots = Array.from(posMap.values());

    return { location, slots };
  });
}
