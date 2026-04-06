import type { FastifyInstance } from 'fastify';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { wines } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:       '#0A0A0D',
  surface:  '#111116',
  surfaceAlt: '#0E0E12',
  cream:    '#EDE8DF',
  gold:     '#C5A96E',
  muted:    '#5C5C66',
  dim:      '#3A3A42',
  divider:  '#1E1E24',
  accent:   '#8B1A1A',
  white:    '#F5F0E8',
};

const TYPE_COLORS: Record<string, string> = {
  rouge:      '#C0392B',
  blanc:      '#C9A227',
  rosé:       '#D4748C',
  rose:       '#D4748C',
  champagne:  '#D4AF37',
  mousseux:   '#D4AF37',
  pétillant:  '#A8B86C',
  moelleux:   '#9B59B6',
  fortifié:   '#7D6BAE',
  spiritueux: '#5B8A9A',
};

const TYPE_LABELS: Record<string, string> = {
  rouge: 'Vins Rouges', blanc: 'Vins Blancs', rosé: 'Vins Rosés',
  rose: 'Vins Rosés', champagne: 'Champagnes & Crémants',
  mousseux: 'Vins Mousseux', pétillant: 'Pétillants',
  moelleux: 'Vins Moelleux & Liquoreux', fortifié: 'Vins Fortifiés',
  spiritueux: 'Spiritueux', autre: 'Autres',
};

function typeColor(t?: string | null) {
  if (!t) return C.muted;
  const k = t.toLowerCase();
  for (const [key, col] of Object.entries(TYPE_COLORS)) if (k.includes(key)) return col;
  return C.muted;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ─── Layout (1mm = 2.835pt) ───────────────────────────────────────────────────
const MM       = 2.835;
const A4W      = 595.28;
const A4H      = 841.89;
const ML       = 14 * MM;   // left margin
const MR       = 14 * MM;   // right margin
const CW       = A4W - ML - MR;   // content width
const HEADER_H = 15 * MM;
const FOOTER_H = 8  * MM;
const AVAIL_H  = A4H - HEADER_H - FOOTER_H;

// Card geometry — 8 per page target
const CARD_H   = 26 * MM;   // 73.7pt
const CARD_GAP = 1.8 * MM;  // thin breathing room
const PH_W     = 17 * MM;   // photo width
const PH_H     = 24 * MM;   // photo height (portrait)
const PH_GAP   = 4  * MM;   // gap between photo and text
const TX_X     = ML + PH_W + PH_GAP;
const TX_W     = CW - PH_W - PH_GAP;
const SEC_H    = 8  * MM;   // section header height

// ─── Draw primitives ──────────────────────────────────────────────────────────
function rect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string) {
  doc.save().rect(x, y, w, h).fill(hexRgb(color)).restore();
}

function line(doc: PDFKit.PDFDocument, x1: number, y1: number, x2: number, y2: number, color: string, lw = 0.4) {
  doc.save().moveTo(x1, y1).lineTo(x2, y2)
    .strokeColor(hexRgb(color)).lineWidth(lw).stroke().restore();
}

function text(
  doc: PDFKit.PDFDocument,
  str: string,
  x: number,
  y: number,
  {
    font = 'Helvetica',
    size = 8,
    color = C.cream,
    width,
    align = 'left',
    lineBreak = false,
    ellipsis = false,
  }: {
    font?: string; size?: number; color?: string;
    width?: number; align?: 'left' | 'center' | 'right';
    lineBreak?: boolean; ellipsis?: boolean;
  } = {}
) {
  const opts: PDFKit.Mixins.TextOptions = { lineBreak, align };
  if (width  !== undefined) opts.width   = width;
  if (ellipsis)             opts.ellipsis = true;
  doc.save().font(font).fontSize(size).fillColor(hexRgb(color))
    .text(str, x, y, opts).restore();
}

function trunc(s: string, n: number) { return s.length <= n ? s : s.slice(0, n - 1) + '…'; }

// ─── Page chrome ──────────────────────────────────────────────────────────────
function drawChrome(doc: PDFKit.PDFDocument, title: string, count: number, pageNum: number) {
  // Full dark page
  rect(doc, 0, 0, A4W, A4H, C.bg);
  // Header band
  rect(doc, 0, 0, A4W, HEADER_H, C.surface);
  // Thin accent line below header
  rect(doc, 0, HEADER_H - 0.8, A4W, 0.8, C.accent);

  // Left: title
  text(doc, title, ML, 4.5 * MM, { font: 'Helvetica-Bold', size: 13, color: C.cream });
  // Right: subtitle
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const sub = `${today}  ·  ${count} référence${count > 1 ? 's' : ''}`;
  text(doc, sub, 0, 5 * MM, { size: 7, color: C.gold, width: A4W - MR, align: 'right' });
  // Thin gold rule under title
  text(doc, 'Carte des Vins', ML, 9 * MM, { font: 'Helvetica-Oblique', size: 7.5, color: C.muted });

  // Footer
  text(doc, `${pageNum}`, 0, A4H - 5.5 * MM, { size: 7, color: C.muted, width: A4W, align: 'center' });
}

// ─── Section header ───────────────────────────────────────────────────────────
function drawSection(doc: PDFKit.PDFDocument, wineType: string, y: number) {
  const col   = typeColor(wineType);
  const label = (TYPE_LABELS[wineType.toLowerCase()] || wineType).toUpperCase();
  // Subtle background
  rect(doc, ML, y, CW, SEC_H, C.surfaceAlt);
  // Left color bar
  rect(doc, ML, y, 2, SEC_H, col);
  // Label
  text(doc, label, ML + 6, y + 2.4 * MM, { font: 'Helvetica-Bold', size: 7.5, color: col });
  // Bottom hairline
  line(doc, ML, y + SEC_H, ML + CW, y + SEC_H, C.dim);
}

// ─── Wine card ────────────────────────────────────────────────────────────────
function drawCard(
  doc: PDFKit.PDFDocument,
  wine: Record<string, any>,
  y: number,
  photosPath: string,
  alt: boolean,
) {
  const col = typeColor(wine.type);

  // Card background (very subtle alt)
  rect(doc, ML, y, CW, CARD_H, alt ? C.surfaceAlt : C.bg);

  // ── Photo ──
  const py = y + (CARD_H - PH_H) / 2;
  if (wine.photo_url) {
    try {
      const file  = wine.photo_url.replace('/photos/', '');
      const fpath = path.join(photosPath, file);
      if (fs.existsSync(fpath)) {
        doc.save().rect(ML, py, PH_W, PH_H).clip()
          .image(fpath, ML, py, { width: PH_W, height: PH_H, cover: [PH_W, PH_H] })
          .restore();
      } else { drawPlaceholder(doc, ML, py, col); }
    } catch { drawPlaceholder(doc, ML, py, col); }
  } else {
    drawPlaceholder(doc, ML, py, col);
  }

  // ── Text block ──
  const pad = 2.8 * MM;
  let ty = y + pad;

  // Row 1: Name (bold) + Vintage (gold) — same line
  const name    = wine.name || 'Sans nom';
  const vintage = wine.vintage ? `  ${wine.vintage}` : (wine.non_vintage ? '  NV' : '');
  const nameW   = TX_W * 0.65;
  text(doc, trunc(name, 38), TX_X, ty, { font: 'Helvetica-Bold', size: 9, color: C.cream, width: nameW, ellipsis: true });
  if (vintage) {
    text(doc, vintage.trim(), TX_X + nameW, ty, { font: 'Helvetica-Bold', size: 9, color: col });
  }

  ty += 9 * 1.35;

  // Row 2: Domain · Appellation
  const domainParts = [wine.domain, wine.appellation].filter(Boolean).join('  ·  ');
  if (domainParts) {
    text(doc, trunc(domainParts, 68), TX_X, ty, { size: 7.5, color: C.gold, width: TX_W, ellipsis: true });
    ty += 7.5 * 1.35;
  }

  // Row 3: Region · Country + type badge
  const regionParts = [wine.region, wine.country].filter(Boolean).join('  ·  ');
  const typeStr = wine.type ? `  ·  ${wine.type.toUpperCase()}` : '';
  if (regionParts || typeStr) {
    text(doc, trunc((regionParts + typeStr), 72), TX_X, ty, { size: 6.5, color: C.muted, width: TX_W, ellipsis: true });
    ty += 6.5 * 1.35;
  }

  // Row 4: Grapes
  const grapes = (wine.grapes as string[] | null) || [];
  if (grapes.length) {
    text(doc, trunc(grapes.join(', '), 72), TX_X, ty, { font: 'Helvetica-Oblique', size: 6.5, color: C.muted, width: TX_W, ellipsis: true });
    ty += 6.5 * 1.35;
  }

  // Row 5: Description (truncated, one line)
  const desc = wine.description || wine.palate || '';
  if (desc && ty < y + CARD_H - 3 * MM) {
    text(doc, trunc(desc, 110), TX_X, ty, { size: 6, color: '#5C5C6E', width: TX_W, ellipsis: true });
    ty += 6 * 1.35;
  }

  // Row 6: Service info (temp · qty · drink window)
  const svc: string[] = [];
  if (wine.serving_temp_min && wine.serving_temp_max) svc.push(`${wine.serving_temp_min}–${wine.serving_temp_max} °C`);
  const qty = wine.quantity;
  if (qty) svc.push(`${qty} btl`);
  if (wine.drink_from && wine.drink_until) svc.push(`${wine.drink_from}–${wine.drink_until}`);
  else if (wine.drink_until) svc.push(`≤ ${wine.drink_until}`);
  if (wine.decanting) svc.push('décanté');
  if (svc.length && ty < y + CARD_H - 2 * MM) {
    text(doc, svc.join('  ·  '), TX_X, ty, { size: 6, color: C.muted, width: TX_W, ellipsis: true });
  }

  // Bottom separator line
  line(doc, ML, y + CARD_H, ML + CW, y + CARD_H, C.divider);
}

function drawPlaceholder(doc: PDFKit.PDFDocument, x: number, y: number, col: string) {
  rect(doc, x, y, PH_W, PH_H, C.surfaceAlt);
  // Thin colored border
  doc.save().rect(x, y, PH_W, PH_H).strokeColor(hexRgb(col)).lineWidth(0.5).stroke().restore();
  text(doc, '?', x, y + PH_H / 2 - 8, { size: 16, color: C.dim, width: PH_W, align: 'center' });
}

// ─── Route ────────────────────────────────────────────────────────────────────
const TYPE_ORDER = ['rouge', 'blanc', 'rosé', 'rose', 'champagne', 'mousseux',
                    'pétillant', 'moelleux', 'fortifié', 'spiritueux'];

export async function pdfRoutes(app: FastifyInstance) {
  app.get('/api/pdf/wine-list', async (req, reply) => {
    const photosPath = process.env.PHOTOS_PATH || '/photos';
    const caveTitle  = process.env.CAVE_TITLE  || 'Ma Cave';

    const allWines = await db.select().from(wines)
      .where(eq(wines.importStatus, 'available'))
      .orderBy(wines.type, wines.region, wines.appellation, wines.vintage, wines.name);

    if (!allWines.length) {
      return reply.status(404).send({ error: 'Aucun vin disponible' });
    }

    // Group by type
    const byType = new Map<string, typeof allWines>();
    for (const w of allWines) {
      const t = (w.type || 'autre').toLowerCase();
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(w);
    }

    const seen   = new Set<string>();
    const ordered = [...TYPE_ORDER, ...byType.keys()].filter(t => {
      if (seen.has(t) || !byType.has(t)) return false;
      seen.add(t); return true;
    });

    const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, compress: true });
    reply.raw.setHeader('Content-Type', 'application/pdf');
    reply.raw.setHeader('Content-Disposition', 'inline; filename="carte-des-vins.pdf"');
    doc.pipe(reply.raw);

    let pageNum = 0;
    let curY    = 0;

    function newPage() {
      doc.addPage();
      pageNum++;
      drawChrome(doc, caveTitle, allWines.length, pageNum);
      curY = HEADER_H + 3 * MM;
    }

    function needsSpace(h: number) {
      if (curY + h > A4H - FOOTER_H) newPage();
    }

    newPage();

    for (const wineType of ordered) {
      const list = byType.get(wineType)!;

      // Section header: keep it with at least 2 cards
      needsSpace(SEC_H + 2 * (CARD_H + CARD_GAP));
      drawSection(doc, wineType, curY);
      curY += SEC_H + 1.5 * MM;

      let alt = false;
      for (const wine of list) {
        needsSpace(CARD_H + CARD_GAP);
        drawCard(doc, wine as Record<string, any>, curY, photosPath, alt);
        curY += CARD_H + CARD_GAP;
        alt   = !alt;
      }
      curY += 2 * MM; // extra space after each section
    }

    doc.end();
    return reply;
  });
}
