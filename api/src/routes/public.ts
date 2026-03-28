import type { FastifyPluginAsync } from 'fastify';
import { eq, ilike, and, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wines } from '../db/schema.js';

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
  // Liste des vins disponibles (lecture seule, sans auth)
  fastify.get<{ Querystring: { search?: string; type?: string } }>(
    '/api/public/wines',
    async (request) => {
      const { search, type } = request.query;

      const conditions = [eq(wines.importStatus, 'available')];

      if (search) {
        conditions.push(
          or(
            ilike(wines.name, `%${search}%`),
            ilike(wines.domain, `%${search}%`),
            ilike(wines.appellation, `%${search}%`),
            ilike(wines.region, `%${search}%`)
          )!
        );
      }

      if (type) {
        conditions.push(ilike(wines.type, `%${type}%`));
      }

      const rows = await db
        .select({
          id: wines.id,
          name: wines.name,
          domain: wines.domain,
          appellation: wines.appellation,
          vintage: wines.vintage,
          nonVintage: wines.nonVintage,
          type: wines.type,
          grapes: wines.grapes,
          country: wines.country,
          region: wines.region,
          subRegion: wines.subRegion,
          classification: wines.classification,
          mentions: wines.mentions,
          alcohol: wines.alcohol,
          bottleSize: wines.bottleSize,
          servingTempMin: wines.servingTempMin,
          servingTempMax: wines.servingTempMax,
          decanting: wines.decanting,
          decantingTime: wines.decantingTime,
          glassType: wines.glassType,
          drinkFrom: wines.drinkFrom,
          drinkUntil: wines.drinkUntil,
          peakFrom: wines.peakFrom,
          peakUntil: wines.peakUntil,
          currentPhase: wines.currentPhase,
          agingNotes: wines.agingNotes,
          description: wines.description,
          vintageNotes: wines.vintageNotes,
          aromaPrimary: wines.aromaPrimary,
          aromaSecondary: wines.aromaSecondary,
          aromaTertiary: wines.aromaTertiary,
          palate: wines.palate,
          style: wines.style,
          pairingsIdeal: wines.pairingsIdeal,
          pairingsGood: wines.pairingsGood,
          pairingsAvoid: wines.pairingsAvoid,
          occasions: wines.occasions,
          cheesePairings: wines.cheesePairings,
          quantity: wines.quantity,
          slotIds: wines.slotIds,
          estimatedValue: wines.estimatedValue,
          purchasePrice: wines.purchasePrice,
          photoUrl: wines.photoUrl,
          awards: wines.awards,
          personalRating: wines.personalRating,
          tastingNotes: wines.tastingNotes,
          isFavorite: wines.isFavorite,
          createdAt: wines.createdAt,
        })
        .from(wines)
        .where(and(...conditions))
        .orderBy(wines.name);

      return rows;
    }
  );

  // Fiche complète d'un vin (lecture seule, sans auth)
  fastify.get<{ Params: { id: string } }>(
    '/api/public/wines/:id',
    async (request, reply) => {
      const { id } = request.params;

      const [wine] = await db
        .select({
          id: wines.id,
          name: wines.name,
          domain: wines.domain,
          appellation: wines.appellation,
          vintage: wines.vintage,
          nonVintage: wines.nonVintage,
          type: wines.type,
          grapes: wines.grapes,
          country: wines.country,
          region: wines.region,
          subRegion: wines.subRegion,
          classification: wines.classification,
          mentions: wines.mentions,
          alcohol: wines.alcohol,
          bottleSize: wines.bottleSize,
          servingTempMin: wines.servingTempMin,
          servingTempMax: wines.servingTempMax,
          decanting: wines.decanting,
          decantingTime: wines.decantingTime,
          glassType: wines.glassType,
          drinkFrom: wines.drinkFrom,
          drinkUntil: wines.drinkUntil,
          peakFrom: wines.peakFrom,
          peakUntil: wines.peakUntil,
          currentPhase: wines.currentPhase,
          agingNotes: wines.agingNotes,
          description: wines.description,
          vintageNotes: wines.vintageNotes,
          aromaPrimary: wines.aromaPrimary,
          aromaSecondary: wines.aromaSecondary,
          aromaTertiary: wines.aromaTertiary,
          palate: wines.palate,
          style: wines.style,
          pairingsIdeal: wines.pairingsIdeal,
          pairingsGood: wines.pairingsGood,
          pairingsAvoid: wines.pairingsAvoid,
          occasions: wines.occasions,
          cheesePairings: wines.cheesePairings,
          quantity: wines.quantity,
          slotIds: wines.slotIds,
          estimatedValue: wines.estimatedValue,
          purchasePrice: wines.purchasePrice,
          photoUrl: wines.photoUrl,
          awards: wines.awards,
          personalRating: wines.personalRating,
          tastingNotes: wines.tastingNotes,
          isFavorite: wines.isFavorite,
          createdAt: wines.createdAt,
        })
        .from(wines)
        .where(and(eq(wines.id, id), eq(wines.importStatus, 'available')));

      if (!wine) return reply.code(404).send({ error: 'Bouteille introuvable' });
      return wine;
    }
  );
};
