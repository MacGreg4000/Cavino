import type { FastifyInstance } from 'fastify';
import { eq, sql, count, sum } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wines, tastingLogs } from '../db/schema.js';

export async function statsRoutes(app: FastifyInstance) {
  // GET /api/stats
  app.get('/api/stats', async () => {
    const currentYear = new Date().getFullYear();

    // Totaux
    const [totals] = await db.select({
      totalBottles: sum(wines.quantity),
      totalWines: count(),
      totalValue: sql<string>`coalesce(sum(coalesce(${wines.estimatedValue}, 0)::numeric * coalesce(${wines.quantity}, 1)), 0)`,
    })
      .from(wines)
      .where(eq(wines.importStatus, 'available'));

    // Pending count
    const [pending] = await db.select({ count: count() })
      .from(wines)
      .where(eq(wines.importStatus, 'pending'));

    // Par type (normalisé : trim + initcap pour regrouper "rouge"/"Rouge"/etc.)
    const byType = await db.execute(sql`
      SELECT
        INITCAP(LOWER(TRIM(type))) AS type,
        COUNT(*)::int                AS count,
        SUM(quantity)::int          AS "totalQuantity"
      FROM wines
      WHERE import_status = 'available'
        AND type IS NOT NULL AND TRIM(type) != ''
      GROUP BY INITCAP(LOWER(TRIM(type)))
      ORDER BY COUNT(*) DESC
    `);

    // Par région
    const byRegion = await db.select({
      region: wines.region,
      count: count(),
      totalQuantity: sum(wines.quantity),
    })
      .from(wines)
      .where(eq(wines.importStatus, 'available'))
      .groupBy(wines.region)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    // À boire cette année
    const [drinkThisYear] = await db.select({ count: count() })
      .from(wines)
      .where(sql`${wines.importStatus} = 'available' AND ${wines.drinkUntil} IS NOT NULL AND ${wines.drinkUntil} <= ${currentYear}`);

    // Dégustations récentes
    const recentTastings = await db.select({
      count: count(),
    }).from(tastingLogs);

    return {
      totalBottles: Number(totals.totalBottles) || 0,
      totalWines: totals.totalWines,
      totalValue: Number(totals.totalValue) || 0,
      pendingCount: pending.count,
      drinkThisYear: drinkThisYear.count,
      totalTastings: recentTastings[0].count,
      byType,
      byRegion,
    };
  });
}
