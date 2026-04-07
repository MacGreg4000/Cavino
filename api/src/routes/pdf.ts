import type { FastifyInstance } from 'fastify';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { wines } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// ─── Palette (thème clair, style carte de restaurant) ────────────────────────
const C = {
  bg:       '#FFFFFF',
  pageBg:   '#F8F6F1',   // parchemin très léger pour l'extérieur
  text:     '#111827',   // gray-900
  textSec:  '#6B7280',   // gray-500
  textMut:  '#9CA3AF',   // gray-400
  mustard:  '#B58D3D',   // accent or
  wineRed:  '#8B1A1A',   // bordeaux
  divider:  '#E5E7EB',   // gray-200
  surface:  '#F9FAFB',   // gray-50
  // Badges
  badgeRed: { bg: '#FEE2E2', fg: '#991B1B' },
  badgeGold:{ bg: '#FEF3C7', fg: '#92400E' },
  badgeGrn: { bg: '#D1FAE5', fg: '#065F46' },
  badgeGray:{ bg: '#F3F4F6', fg: '#374151' },
  badgeBlue:{ bg: '#DBEAFE', fg: '#1E40AF' },
  badgePurp:{ bg: '#EDE9FE', fg: '#5B21B6' },
};

const TYPE_COLORS: Record<string, typeof C.badgeRed> = {
  rouge:      { bg: '#FEE2E2', fg: '#991B1B' },
  blanc:      { bg: '#FEF3C7', fg: '#92400E' },
  rosé:       { bg: '#FCE7F3', fg: '#9D174D' },
  rose:       { bg: '#FCE7F3', fg: '#9D174D' },
  champagne:  { bg: '#FEF9C3', fg: '#78350F' },
  mousseux:   { bg: '#FEF9C3', fg: '#78350F' },
  pétillant:  { bg: '#ECFDF5', fg: '#065F46' },
  moelleux:   { bg: '#EDE9FE', fg: '#5B21B6' },
  fortifié:   { bg: '#E0E7FF', fg: '#3730A3' },
  spiritueux: { bg: '#F0F9FF', fg: '#0C4A6E' },
};

const TYPE_LABELS: Record<string, string> = {
  rouge: 'Vins Rouges', blanc: 'Vins Blancs', rosé: 'Vins Rosés',
  rose: 'Vins Rosés', champagne: 'Champagnes & Crémants',
  mousseux: 'Vins Mousseux', pétillant: 'Pétillants Naturels',
  moelleux: 'Vins Moelleux & Liquoreux', fortifié: 'Vins Fortifiés',
  spiritueux: 'Spiritueux', autre: 'Autres',
};

function typeBadge(t?: string | null) {
  if (!t) return C.badgeGray;
  const k = t.toLowerCase();
  for (const [key, col] of Object.entries(TYPE_COLORS)) if (k.includes(key)) return col;
  return C.badgeGray;
}

function drinkStatus(w: Record<string, any>): { label: string; badge: typeof C.badgeGrn } | null {
  const year = new Date().getFullYear();
  const from  = w.drink_from  as number | null;
  const until = w.drink_until as number | null;
  const pf    = w.peak_from   as number | null;
  const pu    = w.peak_until  as number | null;
  if (!from && !until && !pf && !pu) return null;
  if (from  && year < from)  return { label: 'Trop tôt',  badge: C.badgeBlue };
  if (until && year > until) return { label: 'Passé',     badge: C.badgeGray };
  if (pf && pu && year >= pf && year <= pu) return { label: 'Apogée', badge: C.badgeGold };
  return { label: 'À boire', badge: C.badgeGrn };
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ─── Layout ───────────────────────────────────────────────────────────────────
const A4W      = 595.28;
const A4H      = 841.89;
const ML       = 45;          // left margin
const MR       = 45;          // right margin
const CW       = A4W - ML - MR;
const HEADER_H = 60;
const FOOTER_H = 28;
const AVAIL    = A4H - HEADER_H - FOOTER_H;

const PHOTO_W   = 52;         // photo column
const PHOTO_GAP = 20;         // gap photo → text
const TX_X      = ML + PHOTO_W + PHOTO_GAP;
const TX_W      = CW - PHOTO_W - PHOTO_GAP;

const CARD_H    = 92;         // ~8 per page
const SECTION_H = 32;

// ─── Primitives ───────────────────────────────────────────────────────────────
function fillRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, hex: string) {
  doc.save().rect(x, y, w, h).fill(hexRgb(hex)).restore();
}

function drawLine(doc: PDFKit.PDFDocument, x1: number, y1: number, x2: number, y2: number, hex: string, lw = 0.5) {
  doc.save().moveTo(x1, y1).lineTo(x2, y2).strokeColor(hexRgb(hex)).lineWidth(lw).stroke().restore();
}

function txt(
  doc: PDFKit.PDFDocument,
  str: string,
  x: number, y: number,
  opts: {
    font?: string; size?: number; color?: string;
    width?: number; align?: 'left' | 'center' | 'right';
    lineBreak?: boolean; ellipsis?: boolean;
  } = {}
) {
  const { font='Helvetica', size=9, color=C.text, width, align='left', lineBreak=false, ellipsis=false } = opts;
  const o: PDFKit.Mixins.TextOptions = { lineBreak, align };
  if (width    !== undefined) o.width    = width;
  if (ellipsis)               o.ellipsis = true;
  doc.save().font(font).fontSize(size).fillColor(hexRgb(color)).text(str, x, y, o).restore();
}

function trunc(s: string, n: number) { return s.length <= n ? s : s.slice(0, n - 1) + '…'; }

// Badge → returns x offset after badge
function badge(doc: PDFKit.PDFDocument, label: string, x: number, y: number, bg: string, fg: string): number {
  doc.save().font('Helvetica-Bold').fontSize(7);
  const tw = doc.widthOfString(label.toUpperCase());
  const bw = tw + 16;
  const bh = 13;
  doc.roundedRect(x, y, bw, bh, 6).fill(hexRgb(bg)).restore();
  txt(doc, label.toUpperCase(), x + 8, y + 2.5, { font: 'Helvetica-Bold', size: 7, color: fg });
  return bw + 5;
}

// ─── Page chrome ──────────────────────────────────────────────────────────────
function drawChrome(doc: PDFKit.PDFDocument, title: string, count: number, page: number) {
  // White page
  fillRect(doc, 0, 0, A4W, A4H, C.bg);

  // Header: thin top accent bar
  fillRect(doc, 0, 0, A4W, 3, C.wineRed);

  // Cave name — large light tracking
  doc.save()
    .font('Helvetica').fontSize(26)
    .fillColor(hexRgb(C.text))
    .text(title.toUpperCase(), ML, 14, { characterSpacing: 4, lineBreak: false })
    .restore();

  // Subtitle right-aligned
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  txt(doc, `${count} référence${count > 1 ? 's' : ''}  ·  ${today}`, 0, 18, {
    size: 8, color: C.textMut, width: A4W - MR, align: 'right',
  });

  // Horizontal rule
  drawLine(doc, ML, HEADER_H - 8, A4W - MR, HEADER_H - 8, C.divider, 0.8);
  txt(doc, 'Carte des Vins', ML, HEADER_H - 20, { font: 'Helvetica', size: 8, color: C.textMut });

  // Footer
  drawLine(doc, ML, A4H - FOOTER_H + 8, A4W - MR, A4H - FOOTER_H + 8, C.divider, 0.5);
  txt(doc, `${title}  —  ${new Date().getFullYear()}`, 0, A4H - FOOTER_H + 12, {
    size: 7, color: C.textMut, width: A4W, align: 'center',
  });
  txt(doc, `${page}`, 0, A4H - FOOTER_H + 12, {
    size: 7, color: C.textMut, width: A4W - MR, align: 'right',
  });
}

// ─── Section header ───────────────────────────────────────────────────────────
function drawSection(doc: PDFKit.PDFDocument, wineType: string, y: number) {
  const label = (TYPE_LABELS[wineType.toLowerCase()] || wineType).toUpperCase();
  // Very subtle background band
  fillRect(doc, ML, y + 8, CW, SECTION_H - 14, C.surface);
  drawLine(doc, ML, y + SECTION_H - 2, ML + CW, y + SECTION_H - 2, C.divider);
  // Section title
  doc.save()
    .font('Helvetica-Bold').fontSize(8).fillColor(hexRgb(C.wineRed))
    .text(label, ML + 6, y + 14, { characterSpacing: 1.5, lineBreak: false })
    .restore();
}

// ─── Wine card ────────────────────────────────────────────────────────────────
function drawCard(doc: PDFKit.PDFDocument, wine: Record<string, any>, y: number, photosPath: string) {
  const padV = 10;

  // ── Photo ──
  const photoH = CARD_H - padV * 2;
  const photoY = y + padV;
  if (wine.photo_url) {
    try {
      const file  = (wine.photo_url as string).replace('/photos/', '');
      const fpath = path.join(photosPath, file);
      if (fs.existsSync(fpath)) {
        doc.save().rect(ML, photoY, PHOTO_W, photoH).clip()
          .image(fpath, ML, photoY, { width: PHOTO_W, height: photoH, cover: [PHOTO_W, photoH] })
          .restore();
        // Subtle border around photo
        doc.save().rect(ML, photoY, PHOTO_W, photoH)
          .strokeColor(hexRgb(C.divider)).lineWidth(0.5).stroke().restore();
      } else { drawPhotoPh(doc, ML, photoY, PHOTO_W, photoH); }
    } catch { drawPhotoPh(doc, ML, photoY, PHOTO_W, photoH); }
  } else {
    drawPhotoPh(doc, ML, photoY, PHOTO_W, photoH);
  }

  // ── Text block ──
  let ty = y + padV;

  // Row 1: Name + price (right)
  const name    = (wine.name || 'Sans nom') as string;
  const vintage = wine.vintage ? ` — ${wine.vintage}` : (wine.non_vintage ? ' — NV' : '');
  const price   = wine.purchase_price
    ? `${parseFloat(wine.purchase_price).toFixed(2).replace('.', ',')} €`
    : wine.estimated_value
    ? `≈ ${parseFloat(wine.estimated_value).toFixed(2).replace('.', ',')} €`
    : '';

  // Price right-aligned
  if (price) {
    txt(doc, price, TX_X, ty, { font: 'Helvetica-Bold', size: 11, color: C.text, width: TX_W, align: 'right' });
  }

  // Name (bold uppercase, truncated to leave room for price)
  const nameMaxW = price ? TX_W - 70 : TX_W;
  txt(doc, trunc((name + vintage).toUpperCase(), 55), TX_X, ty, {
    font: 'Helvetica-Bold', size: 10, color: C.text, width: nameMaxW, ellipsis: true,
  });
  ty += 14;

  // Row 2: Quantity (below price)
  if (wine.quantity && wine.quantity > 0) {
    txt(doc, `Qté : ${wine.quantity}`, TX_X, ty - 1, {
      size: 7, color: C.textMut, width: TX_W, align: 'right',
    });
  }

  // Row 2: Grapes · Region
  const grapes = ((wine.grapes as string[] | null) || []).join(', ');
  const region = [wine.region, wine.country].filter(Boolean).join(', ');
  const grapeLine = [grapes, region].filter(Boolean);
  if (grapeLine.length) {
    const gStr  = grapes ? `Cépage${grapes.includes(',') ? 's' : ''} : ${trunc(grapes, 40)}` : '';
    const rStr  = region ? region : '';
    if (gStr) {
      txt(doc, gStr, TX_X, ty, { font: 'Helvetica-Bold', size: 8, color: C.mustard });
      if (rStr) {
        const gW = doc.widthOfString(gStr, { font: 'Helvetica-Bold', fontSize: 8 } as any);
        txt(doc, `  |  ${rStr}`, TX_X + gW, ty, { font: 'Helvetica-Oblique', size: 8, color: C.textMut });
      }
    } else if (rStr) {
      txt(doc, rStr, TX_X, ty, { font: 'Helvetica-Oblique', size: 8, color: C.textMut });
    }
    ty += 12;
  }

  // Row 3: Appellation
  const appellation = wine.appellation || '';
  if (appellation) {
    txt(doc, trunc(appellation, 70), TX_X, ty, { size: 7.5, color: C.textSec });
    ty += 10;
  }

  // Row 4: Description (italic, max 2 lines)
  const desc = wine.description || wine.palate || '';
  if (desc) {
    txt(doc, trunc(desc, 140), TX_X, ty, {
      font: 'Helvetica-Oblique', size: 8, color: C.textSec, width: TX_W, lineBreak: true, ellipsis: true,
    });
    ty += desc.length > 80 ? 22 : 12;
  }

  // Row 5: Badges
  let bx = TX_X;
  const by = Math.min(ty, y + CARD_H - padV - 15);

  // Type badge
  if (wine.type) {
    const bc = typeBadge(wine.type);
    bx += badge(doc, wine.type, bx, by, bc.bg, bc.fg);
  }

  // Drink status badge
  const ds = drinkStatus(wine);
  if (ds) bx += badge(doc, ds.label, bx, by, ds.badge.bg, ds.badge.fg);

  // Awards
  const awards = (wine.awards as Array<{ name: string }> | null) || [];
  if (awards.length) {
    txt(doc, `★ ${awards[0].name}`, TX_X, by - 12, { size: 6.5, color: C.mustard });
  }

  // Separator
  drawLine(doc, ML, y + CARD_H, ML + CW, y + CARD_H, C.divider);
}

function drawPhotoPh(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  fillRect(doc, x, y, w, h, C.surface);
  doc.save().rect(x, y, w, h).strokeColor(hexRgb(C.divider)).lineWidth(0.5).stroke().restore();
  txt(doc, '?', x, y + h / 2 - 10, { size: 18, color: C.divider, width: w, align: 'center' });
}

// ─── Route ────────────────────────────────────────────────────────────────────
const TYPE_ORDER = ['rouge', 'blanc', 'rosé', 'rose', 'champagne', 'mousseux',
                    'pétillant', 'moelleux', 'fortifié', 'spiritueux', 'autre'];

export async function pdfRoutes(app: FastifyInstance) {
  app.get('/api/pdf/wine-list', async (req, reply) => {
    const photosPath = process.env.PHOTOS_PATH || '/photos';
    const caveTitle  = process.env.CAVE_TITLE  || 'Ma Cave';

    const allWines = await db.select().from(wines)
      .where(eq(wines.importStatus, 'available'))
      .orderBy(wines.type, wines.region, wines.appellation, wines.vintage, wines.name);

    if (!allWines.length)
      return reply.status(404).send({ error: 'Aucun vin disponible' });

    // Group by type
    const byType = new Map<string, typeof allWines>();
    for (const w of allWines) {
      const t = (w.type || 'autre').toLowerCase();
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(w);
    }
    const seen = new Set<string>();
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
      curY = HEADER_H + 4;
    }

    function need(h: number) {
      if (curY + h > A4H - FOOTER_H) newPage();
    }

    newPage();

    for (const wineType of ordered) {
      const list = byType.get(wineType)!;
      need(SECTION_H + CARD_H);
      drawSection(doc, wineType, curY);
      curY += SECTION_H;

      for (const wine of list) {
        need(CARD_H);
        drawCard(doc, wine as Record<string, any>, curY, photosPath);
        curY += CARD_H;
      }
      curY += 8;
    }

    doc.end();
    return reply;
  });
}
