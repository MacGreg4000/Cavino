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
      totalValue: sum(wines.estimatedValue),
    })
      .from(wines)
      .where(eq(wines.importStatus, 'available'));

    // Pending count
    const [pending] = await db.select({ count: count() })
      .from(wines)
      .where(eq(wines.importStatus, 'pending'));

    // Par type
    const byType = await db.select({
      type: wines.type,
      count: count(),
      totalQuantity: sum(wines.quantity),
    })
      .from(wines)
      .where(eq(wines.importStatus, 'available'))
      .groupBy(wines.type);

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
