import type { FastifyInstance } from 'fastify';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { wines } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

// ── Palette Cave Noire ────────────────────────────────────────────────────────

const C = {
  pageBg:   '#0D0D0F',
  cardBg:   '#16161A',
  cardAlt:  '#111114',
  cream:    '#F2EDE4',
  gold:     '#C9B99A',
  muted:    '#6A6A72',
  divider:  '#28282E',
  accent:   '#7A1A1A',
  header:   '#13131A',
};

const TYPE_COLORS: Record<string, string> = {
  rouge:      '#C0392B',
  blanc:      '#C9A227',
  rosé:       '#C45E8A',
  rose:       '#C45E8A',
  champagne:  '#D4AF37',
  mousseux:   '#D4AF37',
  pétillant:  '#D4AF37',
  moelleux:   '#8E44AD',
  fortifié:   '#884EA0',
  spiritueux: '#5B6E8A',
};

function typeColor(wineType?: string | null): string {
  if (!wineType) return C.muted;
  const t = wineType.toLowerCase();
  for (const [key, col] of Object.entries(TYPE_COLORS)) {
    if (t.includes(key)) return col;
  }
  return C.muted;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Layout constants (points, 1mm ≈ 2.835pt) ─────────────────────────────────

const MM = 2.835;
const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 13 * MM;
const PHOTO_W = 52 * MM;
const PHOTO_H = 72 * MM;
const COL_GAP = 5 * MM;
const INFO_W = A4_W - 2 * MARGIN - PHOTO_W - COL_GAP;
const CARD_PAD_V = 5 * MM;
const CARD_MIN_H = PHOTO_H + 2 * CARD_PAD_V;
const CARD_W = A4_W - 2 * MARGIN;
const HEADER_H = 20 * MM;
const FOOTER_H = 10 * MM;
const CONTENT_Y_START = HEADER_H;
const CONTENT_Y_END = A4_H - FOOTER_H;

// ── Draw helpers ──────────────────────────────────────────────────────────────

function fillRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string) {
  const [r, g, b] = hexToRgb(color);
  doc.save().rect(x, y, w, h).fill([r, g, b]).restore();
}

function drawText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: {
    font?: string;
    size?: number;
    color?: string;
    width?: number;
    lineBreak?: boolean;
    align?: 'left' | 'center' | 'right';
    ellipsis?: boolean;
  } = {}
) {
  const { font = 'Helvetica', size = 8, color = C.cream, width, lineBreak = false, align = 'left', ellipsis = false } = opts;
  const [r, g, b] = hexToRgb(color);
  doc.save()
    .font(font)
    .fontSize(size)
    .fillColor([r, g, b]);

  const textOpts: PDFKit.Mixins.TextOptions = { lineBreak };
  if (width !== undefined) textOpts.width = width;
  if (align !== 'left') textOpts.align = align;
  if (ellipsis) textOpts.ellipsis = true;

  doc.text(text, x, y, textOpts);
  doc.restore();
}

// ── Page header & footer ──────────────────────────────────────────────────────

function drawPageChrome(doc: PDFKit.PDFDocument, title: string, totalWines: number) {
  // Background header
  fillRect(doc, 0, 0, A4_W, HEADER_H, C.header);
  // Red accent line below header
  fillRect(doc, 0, HEADER_H - 1, A4_W, 1, C.accent);
  // Dark page background
  fillRect(doc, 0, HEADER_H, A4_W, A4_H - HEADER_H, C.pageBg);

  // Title
  drawText(doc, title, MARGIN, 7 * MM, { font: 'Helvetica-Bold', size: 16, color: C.cream });
  // Subtitle
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const subtitle = `Carte des vins  ·  ${today}  ·  ${totalWines} référence${totalWines > 1 ? 's' : ''}`;
  drawText(doc, subtitle, MARGIN, 13.5 * MM, { size: 7.5, color: C.gold });

  // Footer page number (will be overwritten per page, handled via addPage event)
}

function drawFooter(doc: PDFKit.PDFDocument, pageNum: number) {
  const pageStr = `— ${pageNum} —`;
  drawText(doc, pageStr, 0, A4_H - 7 * MM, { size: 7, color: C.muted, width: A4_W, align: 'center' });
}

// ── Section header ────────────────────────────────────────────────────────────

function drawSectionHeader(doc: PDFKit.PDFDocument, label: string, wineType: string, y: number): number {
  const h = 9 * MM;
  fillRect(doc, MARGIN, y, CARD_W, h, C.header);
  fillRect(doc, MARGIN, y + h - 0.8, CARD_W, 0.8, typeColor(wineType));
  drawText(doc, label.toUpperCase(), MARGIN + 3 * MM, y + 3 * MM, {
    font: 'Helvetica-Bold', size: 9, color: typeColor(wineType),
  });
  return h;
}

// ── Wine card ─────────────────────────────────────────────────────────────────

async function drawWineCard(
  doc: PDFKit.PDFDocument,
  wine: Record<string, any>,
  y: number,
  photosPath: string,
): Promise<number> {
  const tc = typeColor(wine.type);

  // Build info lines
  const lines: Array<{ text: string; font: string; size: number; color: string }> = [];

  const vintage = wine.vintage ? `  ${wine.vintage}` : '';
  lines.push({
    text: `${wine.name || 'Sans nom'}${vintage}`,
    font: 'Helvetica-Bold', size: 10.5, color: C.cream,
  });

  const domainParts = [wine.domain, wine.appellation].filter(Boolean).join('  ·  ');
  if (domainParts) lines.push({ text: trunc(domainParts, 72), font: 'Helvetica', size: 8.5, color: C.gold });

  const regionParts = [wine.region, wine.country].filter(Boolean).join('  ·  ');
  const typeStr = wine.type ? `  [${wine.type.toUpperCase()}]` : '';
  if (regionParts || typeStr) lines.push({ text: trunc(regionParts + typeStr, 72), font: 'Helvetica', size: 7.5, color: C.muted });

  const grapes = (wine.grapes as string[] | null) || [];
  if (grapes.length) lines.push({ text: trunc(grapes.join('  ·  '), 80), font: 'Helvetica-Oblique', size: 7.5, color: C.muted });

  const desc = wine.description || wine.palate || '';
  if (desc) lines.push({ text: trunc(desc, 180), font: 'Helvetica', size: 7.5, color: '#8A8A94' });

  const serviceArr: string[] = [];
  if (wine.serving_temp_min && wine.serving_temp_max) serviceArr.push(`${wine.serving_temp_min}–${wine.serving_temp_max} °C`);
  if (wine.quantity) serviceArr.push(`${wine.quantity} bouteille${wine.quantity > 1 ? 's' : ''}`);
  if (wine.drink_from && wine.drink_until) serviceArr.push(`à boire ${wine.drink_from}–${wine.drink_until}`);
  else if (wine.drink_until) serviceArr.push(`avant ${wine.drink_until}`);
  if (wine.decanting) serviceArr.push(wine.decanting_time ? `décantation ${wine.decanting_time} min` : 'décantation');
  if (serviceArr.length) lines.push({ text: serviceArr.join('  ·  '), font: 'Helvetica', size: 7, color: C.muted });

  const pairings = ((wine.pairings_ideal as string[] | null) || []).slice(0, 3);
  if (pairings.length) lines.push({ text: trunc(pairings.join(', '), 100), font: 'Helvetica-Oblique', size: 7, color: C.muted });

  const awards = (wine.awards as Array<{ name: string; year?: number; medal?: string }> | null) || [];
  if (awards.length) {
    const awardStr = awards.slice(0, 2).map(a => trunc([a.name, a.year, a.medal].filter(Boolean).join(' '), 40)).join('  ·  ');
    lines.push({ text: `★  ${awardStr}`, font: 'Helvetica-Oblique', size: 7, color: '#D4AF37' });
  }

  // Estimate card height
  const lineHeights = lines.map(l => l.size * 1.55 + 2);
  const infoH = lineHeights.reduce((a, b) => a + b, 0) + 2 * CARD_PAD_V;
  const cardH = Math.max(CARD_MIN_H, infoH);

  // Card background
  fillRect(doc, MARGIN, y, CARD_W, cardH, C.cardBg);

  // Left accent bar
  fillRect(doc, MARGIN, y, 2.5 * MM, cardH, tc);

  // Photo
  const px = MARGIN + 3.5 * MM;
  const py = y + (cardH - PHOTO_H) / 2;

  if (wine.photo_url) {
    try {
      const photoFile = wine.photo_url.replace('/photos/', '');
      const photoPath = path.join(photosPath, photoFile);
      if (fs.existsSync(photoPath)) {
        doc.save();
        doc.rect(px, py, PHOTO_W - 2 * MM, PHOTO_H).clip();
        doc.image(photoPath, px, py, { width: PHOTO_W - 2 * MM, height: PHOTO_H, cover: [PHOTO_W - 2 * MM, PHOTO_H] });
        doc.restore();
      } else {
        drawPhotoPlaceholder(doc, px, py);
      }
    } catch {
      drawPhotoPlaceholder(doc, px, py);
    }
  } else {
    drawPhotoPlaceholder(doc, px, py);
  }

  // Info block
  const ix = MARGIN + PHOTO_W + COL_GAP;
  let iy = y + CARD_PAD_V;

  for (const line of lines) {
    drawText(doc, line.text, ix, iy, {
      font: line.font,
      size: line.size,
      color: line.color,
      width: INFO_W - 2 * MM,
      lineBreak: true,
      ellipsis: true,
    });
    iy += line.size * 1.55 + 2;
  }

  return cardH;
}

function drawPhotoPlaceholder(doc: PDFKit.PDFDocument, x: number, y: number) {
  fillRect(doc, x, y, PHOTO_W - 2 * MM, PHOTO_H, '#1C1C22');
  const [mr, mg, mb] = hexToRgb(C.muted);
  doc.save().font('Helvetica').fontSize(28).fillColor([mr, mg, mb])
    .text('?', x, y + PHOTO_H / 2 - 16, { width: PHOTO_W - 2 * MM, align: 'center' })
    .restore();
}

function trunc(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

// ── PDF generation ────────────────────────────────────────────────────────────

const TYPE_ORDER = ['rouge', 'blanc', 'rosé', 'rose', 'champagne', 'mousseux',
                    'pétillant', 'moelleux', 'fortifié', 'spiritueux'];

export async function pdfRoutes(app: FastifyInstance) {
  app.get('/api/pdf/wine-list', async (req, reply) => {
    const photosPath = process.env.PHOTOS_PATH || '/photos';
    const caveTitle = process.env.CAVE_TITLE || 'Ma Cave';

    // Fetch all available wines
    const allWines = await db.select().from(wines)
      .where(eq(wines.importStatus, 'available'))
      .orderBy(wines.type, wines.region, wines.appellation, wines.vintage, wines.name);

    if (allWines.length === 0) {
      return reply.status(404).send({ error: 'Aucun vin disponible dans la cave' });
    }

    // Group by type
    const byType = new Map<string, typeof allWines>();
    for (const wine of allWines) {
      const t = (wine.type || 'autre').toLowerCase();
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(wine);
    }

    const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, compress: true });

    reply.raw.setHeader('Content-Type', 'application/pdf');
    reply.raw.setHeader('Content-Disposition', `inline; filename="carte-des-vins.pdf"`);
    doc.pipe(reply.raw);

    let pageNum = 0;
    let curY = 0;

    function newPage() {
      doc.addPage();
      pageNum++;
      drawPageChrome(doc, caveTitle, allWines.length);
      drawFooter(doc, pageNum);
      curY = CONTENT_Y_START + 4 * MM;
    }

    function ensureSpace(needed: number) {
      if (curY + needed > CONTENT_Y_END) {
        newPage();
      }
    }

    newPage();

    const seenTypes = new Set<string>();
    const orderedTypes = [...TYPE_ORDER, ...Array.from(byType.keys())].filter(t => {
      if (seenTypes.has(t) || !byType.has(t)) return false;
      seenTypes.add(t);
      return true;
    });

    for (const wineType of orderedTypes) {
      const winesInType = byType.get(wineType)!;

      // Section header
      ensureSpace(9 * MM + CARD_MIN_H + 2.5 * MM);
      const sectionH = drawSectionHeader(doc, wineType.charAt(0).toUpperCase() + wineType.slice(1), wineType, curY);
      curY += sectionH + 2 * MM;

      for (const wine of winesInType) {
        ensureSpace(CARD_MIN_H + 2.5 * MM);
        const cardH = await drawWineCard(doc, wine as Record<string, any>, curY, photosPath);
        curY += cardH + 2.5 * MM;
      }
    }

    doc.end();
    return reply;
  });
}
