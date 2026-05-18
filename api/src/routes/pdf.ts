import type { FastifyInstance } from 'fastify';
import puppeteer from 'puppeteer-core';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { wines, locations, gridSlots } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotRow = {
  id: string;
  locationId: string;
  rowIndex: number;
  colIndex: number;
  wineId: string | null;
  isBlocked: boolean | null;
};

type LocationGridData = {
  name: string;
  color: string | null;
  rows: number;
  cols: number;
  slotMap: Map<string, SlotRow>; // key = "rowIndex,colIndex"
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function photoBase64(photoUrl: string | null, photosPath: string): string {
  if (!photoUrl) return '';
  try {
    const file  = photoUrl.replace('/photos/', '');
    const fpath = path.join(photosPath, file);
    if (!fs.existsSync(fpath)) return '';
    const data = fs.readFileSync(fpath);
    const ext  = path.extname(fpath).slice(1).replace('jpg', 'jpeg');
    return `data:image/${ext};base64,${data.toString('base64')}`;
  } catch { return ''; }
}

function typeBadgeStyle(t?: string | null): string {
  const k = (t || '').toLowerCase();
  if (k.includes('rouge'))     return 'background:#FEE2E2;color:#991B1B';
  if (k.includes('blanc'))     return 'background:#FEF3C7;color:#92400E';
  if (k.includes('ros'))       return 'background:#FCE7F3;color:#9D174D';
  if (k.includes('champagne')) return 'background:#FEF9C3;color:#78350F';
  if (k.includes('mousseux'))  return 'background:#FEF9C3;color:#78350F';
  if (k.includes('moelleux'))  return 'background:#EDE9FE;color:#5B21B6';
  if (k.includes('fortifi'))   return 'background:#E0E7FF;color:#3730A3';
  return 'background:#F3F4F6;color:#374151';
}

function drinkStatus(w: Record<string, any>): { label: string; style: string } | null {
  const year  = new Date().getFullYear();
  const from  = w.drinkFrom  as number | null;
  const until = w.drinkUntil as number | null;
  const pf    = w.peakFrom   as number | null;
  const pu    = w.peakUntil  as number | null;
  if (!from && !until && !pf && !pu) return null;
  if (from  && year < from)  return { label: 'Trop tot',  style: 'background:#DBEAFE;color:#1E40AF' };
  if (until && year > until) return { label: 'Depasse',   style: 'background:#F3F4F6;color:#6B7280' };
  if (pf && pu && year >= pf && year <= pu) return { label: 'Apogee', style: 'background:#FEF3C7;color:#92400E' };
  return { label: 'A boire', style: 'background:#D1FAE5;color:#065F46' };
}

function drinkTimeline(w: Record<string, any>): string {
  const year   = new Date().getFullYear();
  const from   = w.drinkFrom  as number | null;
  const until  = w.drinkUntil as number | null;
  const pf     = w.peakFrom   as number | null;
  const pu     = w.peakUntil  as number | null;
  if (!from && !until) return '';

  const start  = Math.min(from ?? year, year) - 1;
  const end    = Math.max(until ?? year, year) + 2;
  const span   = end - start;
  if (span <= 0) return '';

  const pct = (y: number) => `${Math.max(0, Math.min(100, ((y - start) / span) * 100)).toFixed(1)}%`;

  const drinkL = pct(from  ?? year);
  const drinkW = `${Math.max(0, Math.min(100, (((until ?? year) + 1 - (from ?? year)) / span) * 100)).toFixed(1)}%`;

  const peakBar = (pf && pu) ? `
    <div style="position:absolute;top:0;bottom:0;left:${pct(pf)};width:${(((pu + 1 - pf) / span) * 100).toFixed(1)}%;background:#B58D3D;border-radius:2px;opacity:0.9;"></div>` : '';

  const nowPct  = pct(year);
  const nowBar  = `<div style="position:absolute;top:-3px;bottom:-3px;left:${nowPct};width:2px;background:#8B1A1A;border-radius:1px;"></div>`;

  const labelFrom  = from  ? `<span style="position:absolute;left:${drinkL};transform:translateX(-50%);font-size:7px;color:#9CA3AF;top:-11px;">${from}</span>`  : '';
  const labelUntil = until ? `<span style="position:absolute;left:${pct((until ?? year)+1)};transform:translateX(-50%);font-size:7px;color:#9CA3AF;top:-11px;">${until}</span>` : '';
  const labelNow   = `<span style="position:absolute;left:${nowPct};transform:translateX(-50%);font-size:7px;color:#8B1A1A;font-weight:700;bottom:-12px;">${year}</span>`;

  return `
  <div style="position:relative;margin:6px 0 14px 0;height:6px;background:#F3F4F6;border-radius:3px;">
    ${labelFrom}${labelUntil}
    <div style="position:absolute;top:0;bottom:0;left:${drinkL};width:${drinkW};background:#D1FAE5;border-radius:3px;"></div>
    ${peakBar}
    ${nowBar}
    ${labelNow}
  </div>`;
}

function esc(s?: string | null) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function trunc(s: string, n: number) { return s.length <= n ? s : s.slice(0, n - 1) + '...'; }

/** Génère un QR code en Data URL PNG (base64). Retourne '' en cas d'erreur. */
async function makeQR(url: string, size = 80): Promise<string> {
  try {
    return await QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      color: { dark: '#111827', light: '#FFFFFF' },
    });
  } catch { return ''; }
}

/**
 * Mini représentation SVG d'un rack avec les cases du vin mises en valeur.
 * typeColor : couleur hex du type de vin (rouge bordeaux, or, rose, etc.)
 */
function miniRackSVG(
  rows: number,
  cols: number,
  slotMap: Map<string, SlotRow>,
  wineSlots: Set<string>,
  typeColor: string,
): string {
  if (!rows || !cols) return '';

  // Taille de cellule adaptée à la grille
  const CELL = (rows > 12 || cols > 18) ? 4 : (rows > 8 || cols > 12) ? 5 : 6;
  const GAP  = 1;
  const svgW = cols * (CELL + GAP) + GAP;
  const svgH = rows * (CELL + GAP) + GAP;

  let rects = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const slot = slotMap.get(`${r},${c}`);
      const x = GAP + c * (CELL + GAP);
      const y = GAP + r * (CELL + GAP);

      let fill: string;
      if (!slot)              fill = '#EDE9E4';          // pas de slot
      else if (slot.isBlocked) fill = '#D0C8C0';          // bloqué
      else if (wineSlots.has(slot.id)) fill = typeColor;  // CE vin
      else if (slot.wineId)   fill = '#B0A89E';           // autre vin
      else                    fill = '#EDE9E4';            // vide

      rects += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="0.5" fill="${fill}"/>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="display:block;border-radius:2px;overflow:hidden;">` +
    `<rect width="${svgW}" height="${svgH}" rx="2" fill="#FAF7F3"/>` +
    rects +
    `</svg>`;
}

/** Construit le bloc HTML localisation + QR pour buildHTML (v1). */
function locationAndQR(
  wine: Record<string, any>,
  locMap: Map<string, string>,
  qrDataUrl: string,
): string {
  const locationName = wine.locationId ? locMap.get(wine.locationId) ?? null : null;
  const slotIds: string[] = wine.slotIds ?? [];
  const hasLoc = locationName || slotIds.length > 0;
  const qty: number = wine.quantity ?? 0;

  const locHtml = hasLoc ? `
    <div class="loc-block">
      <div class="loc-icon">&#x1F4CD;</div>
      <div class="loc-text">
        ${locationName ? `<div class="loc-name">${esc(locationName)}</div>` : ''}
        ${slotIds.length > 0 ? `<div class="loc-slots">${slotIds.map(esc).join(' · ')}</div>` : ''}
        ${qty > 0 ? `<div class="loc-qty">${qty} bouteille${qty > 1 ? 's' : ''}</div>` : ''}
      </div>
    </div>` : (qty > 0 ? `<div class="loc-qty-bare">${qty} bouteille${qty > 1 ? 's' : ''} · non placee${qty > 1 ? 's' : ''}</div>` : '');

  const qrHtml = qrDataUrl
    ? `<img src="${qrDataUrl}" class="qr-img" alt="QR" title="Fiche publique" />`
    : '';

  return `<div class="loc-qr-row">${locHtml}<div class="qr-cell">${qrHtml}</div></div>`;
}

// ─── V1 HTML template (liste compacte) ───────────────────────────────────────

function buildHTML(allWines: Record<string, any>[], photosPath: string, title: string, locMap: Map<string, string>, qrMap: Map<string, string>): string {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const year  = new Date().getFullYear();

  const TYPE_ORDER = ['rouge', 'blanc', 'rose', 'champagne', 'mousseux', 'petillant', 'moelleux', 'fortifie', 'spiritueux', 'autre'];
  const TYPE_LABELS: Record<string, string> = {
    rouge: 'Vins Rouges', blanc: 'Vins Blancs', rose: 'Vins Roses',
    champagne: 'Champagnes & Cremants', mousseux: 'Vins Mousseux',
    petillant: 'Petillants Naturels', moelleux: 'Vins Moelleux & Liquoreux',
    fortifie: 'Vins Fortifies', spiritueux: 'Spiritueux', autre: 'Autres',
  };

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

  let sections = '';
  for (const wineType of ordered) {
    const list  = byType.get(wineType)!;
    const label = (TYPE_LABELS[wineType] || wineType).toUpperCase();
    sections += `<div class="section-header"><span class="section-title">${esc(label)}</span></div>\n`;

    for (const w of list) {
      const imgSrc  = photoBase64(w.photoUrl, photosPath);
      const name    = esc(trunc(w.name || 'Sans nom', 60));
      const vintage = w.vintage ? ` - ${w.vintage}` : (w.nonVintage ? ' - NV' : '');
      const grapes  = ((w.grapes as string[] | null) || []).join(', ');
      const region  = [w.region, w.country].filter(Boolean).join(', ');
      const appel   = esc(w.appellation || '');
      const desc    = esc(trunc(w.description || w.palate || '', 200));
      const awards  = (w.awards as Array<{name:string}> | null) || [];
      const qty     = w.quantity ? `Qte : ${w.quantity}` : '';
      const timeline = drinkTimeline(w);
      let badges = `<span class="badge" style="${typeBadgeStyle(w.type)}">${esc(w.type || 'autre')}</span>`;
      const ds = drinkStatus(w);
      if (ds) badges += `<span class="badge" style="${ds.style}">${ds.label}</span>`;
      if (awards.length) badges += `<span class="badge" style="background:#FEF3C7;color:#92400E">&#x2605; ${esc(awards[0].name)}</span>`;

      const photoEl = imgSrc
        ? `<img src="${imgSrc}" alt="${name}" />`
        : `<div class="photo-placeholder">&#x1F377;</div>`;

      const grapeHtml = grapes
        ? `<span class="grapes">Cepage${grapes.includes(',') ? 's' : ''} : ${esc(grapes)}</span>${region ? `<span class="region"> | ${esc(region)}</span>` : ''}`
        : region ? `<span class="region">${esc(region)}</span>` : '';

      const qrDataUrl = qrMap.get(w.id) ?? '';
      sections += `
      <div class="wine-card">
        <div class="wine-photo">${photoEl}</div>
        <div class="wine-info">
          <div class="wine-header">
            <div class="wine-name">${name}${vintage ? `<span class="vintage">${vintage}</span>` : ''}</div>
            ${qty ? `<div class="wine-right"><div class="wine-qty">${qty}</div></div>` : ''}
          </div>
          ${grapeHtml ? `<div class="wine-grapes-line">${grapeHtml}</div>` : ''}
          ${appel ? `<div class="wine-appellation">${appel}</div>` : ''}
          ${desc ? `<div class="wine-desc">${desc}</div>` : ''}
          ${timeline}
          <div class="wine-badges">${badges}</div>
          ${locationAndQR(w, locMap, qrDataUrl)}
        </div>
      </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Liberation Sans', Arial, sans-serif; background: white; color: #111827; font-size: 13px; line-height: 1.4; }
  @page { size: A4; margin: 12mm 15mm 14mm 15mm; }
  header { border-top: 3px solid #8B1A1A; padding-top: 14px; margin-bottom: 6px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px; }
  .cave-name { font-size: 26px; font-weight: 300; letter-spacing: 0.18em; text-transform: uppercase; }
  .header-meta { color: #9CA3AF; font-size: 10px; text-align: right; }
  .header-rule { border: none; border-top: 1px solid #E5E7EB; margin-bottom: 5px; }
  .header-sub  { color: #9CA3AF; font-size: 10px; letter-spacing: 0.05em; }
  .section-header { background: #F9FAFB; border-top: 1px solid #E5E7EB; border-bottom: 1px solid #E5E7EB; padding: 5px 8px; margin-top: 14px; page-break-after: avoid; }
  .section-title { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; color: #8B1A1A; }
  .wine-card { display: flex; gap: 16px; padding: 12px 0; border-bottom: 1px solid #F3F4F6; page-break-inside: avoid; }
  .wine-photo { width: 54px; flex-shrink: 0; }
  .wine-photo img { width: 54px; height: 80px; object-fit: contain; background: #F9FAFB; border: 1px solid #E5E7EB; display: block; }
  .photo-placeholder { width: 54px; height: 80px; background: #F9FAFB; border: 1px solid #E5E7EB; display: flex; align-items: center; justify-content: center; font-size: 22px; }
  .wine-info { flex: 1; min-width: 0; }
  .wine-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 3px; }
  .wine-name { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #111827; flex: 1; line-height: 1.3; }
  .vintage { font-weight: 400; color: #B58D3D; }
  .wine-right { text-align: right; flex-shrink: 0; }
  .wine-qty   { font-size: 9px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; }
  .wine-grapes-line { font-size: 11px; margin-bottom: 2px; }
  .grapes { font-weight: 600; color: #B58D3D; }
  .region { color: #9CA3AF; font-style: italic; }
  .wine-appellation { font-size: 10px; color: #6B7280; margin-bottom: 2px; }
  .wine-desc { font-size: 10px; color: #6B7280; font-style: italic; line-height: 1.5; margin-bottom: 5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .wine-badges { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
  .badge { padding: 2px 8px; border-radius: 999px; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
  .loc-qr-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; margin-top: 5px; }
  .loc-block { display: flex; align-items: flex-start; gap: 4px; flex: 1; min-width: 0; }
  .loc-icon { font-size: 9px; flex-shrink: 0; margin-top: 1px; }
  .loc-text { min-width: 0; }
  .loc-name  { font-size: 9px; font-weight: 700; color: #374151; }
  .loc-slots { font-size: 8px; color: #8B1A1A; font-family: monospace; }
  .loc-qty   { font-size: 8px; color: #9CA3AF; margin-top: 1px; }
  .loc-qty-bare { font-size: 8px; color: #9CA3AF; flex: 1; }
  .qr-cell { flex-shrink: 0; }
  .qr-img  { display: block; width: 60px; height: 60px; border: 1px solid #E5E7EB; border-radius: 3px; }
  footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #E5E7EB; text-align: center; color: #9CA3AF; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; }
  @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
</style>
</head>
<body>
<header>
  <div class="header-top">
    <div class="cave-name">${esc(title)}</div>
    <div class="header-meta">${allWines.length} reference${allWines.length > 1 ? 's' : ''} &nbsp;·&nbsp; ${today}</div>
  </div>
  <hr class="header-rule">
  <div class="header-sub">Carte des Vins</div>
</header>
${sections}
<footer>${esc(title)} — ${year}</footer>
</body>
</html>`;
}

// ─── V2 HTML template — Format Illustré Premium ──────────────────────────────

const PAGE_SIZE = 3;

function buildHTMLv2(
  allWines: Record<string, any>[],
  photosPath: string,
  title: string,
  locMap: Map<string, string>,
  qrMap: Map<string, string>,
  slotLookup: Map<string, SlotRow>,
  gridsByLocation: Map<string, LocationGridData>,
): string {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const year  = new Date().getFullYear();

  const totalBottles = allWines.reduce((s, w) => s + (w.quantity ?? 1), 0);

  const TYPE_ORDER_V2 = ['rouge', 'blanc', 'rose', 'champagne', 'mousseux', 'petillant', 'moelleux', 'fortifie', 'spiritueux', 'autre'];
  const TYPE_LABELS: Record<string, string> = {
    rouge: 'Vins Rouges', blanc: 'Vins Blancs', rose: 'Vins Roses',
    champagne: 'Champagnes & Cremants', mousseux: 'Vins Mousseux',
    petillant: 'Petillants Naturels', moelleux: 'Vins Moelleux & Liquoreux',
    fortifie: 'Vins Fortifies', spiritueux: 'Spiritueux', autre: 'Autres',
  };
  const TYPE_ACCENT: Record<string, string> = {
    rouge: '#7B1A1A', blanc: '#A07820', rose: '#A8174E',
    champagne: '#7A3300', mousseux: '#7A3300',
    petillant: '#044F36', moelleux: '#4A1A90', fortifie: '#2D2880',
    spiritueux: '#2C3240', autre: '#2C3240',
  };

  const byType = new Map<string, typeof allWines>();
  for (const w of allWines) {
    const t = (w.type || 'autre').toLowerCase();
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(w);
  }
  const seen = new Set<string>();
  const ordered = [...TYPE_ORDER_V2, ...byType.keys()].filter(t => {
    if (seen.has(t) || !byType.has(t)) return false;
    seen.add(t); return true;
  });

  // ── Fiche vin ─────────────────────────────────────────────────────────────────
  const wineCard = (w: Record<string, any>) => {
    const imgSrc  = photoBase64(w.photoUrl, photosPath);
    const name    = esc(trunc(w.name || 'Sans nom', 60));
    const vintage = w.vintage ? String(w.vintage) : (w.nonVintage ? 'NV' : '');
    const grapes  = ((w.grapes as string[] | null) || []).join(', ');
    const region  = [w.region, w.country].filter(Boolean).join(', ');
    const appel   = esc(w.appellation || '');
    const desc    = esc(trunc(w.description || w.palate || '', 280));
    const awards  = (w.awards as Array<{name:string; medal?:string}> | null) || [];
    const qty     = w.quantity ?? 0;

    const timeline = drinkTimeline(w);
    const typeKey  = (w.type || 'autre').toLowerCase();
    const typeClr  = TYPE_ACCENT[typeKey] || '#2C3240';

    const ds = drinkStatus(w);
    const badgeParts: string[] = [];
    if (ds) badgeParts.push(`<span class="badge" style="${ds.style}">${ds.label}</span>`);
    if (awards.length) badgeParts.push(`<span class="badge" style="background:#FDF3D8;color:#7A5200;border:1px solid #E8D080;">&#x2605; ${esc(awards[0].name)}</span>`);

    const rating = w.personalRating as number | null;
    const starsHtml = (rating && rating > 0)
      ? `<div class="stars">${[1,2,3,4,5].map(s => `<span style="color:${s <= rating ? '#B8922E' : '#DDD7CE'};">&#x2605;</span>`).join('')}</div>`
      : '';

    const photoEl = imgSrc
      ? `<img src="${imgSrc}" alt="${name}" />`
      : `<div class="photo-placeholder"><span>&#x1F377;</span></div>`;

    const originParts = [appel || region].filter(Boolean);
    const originLine  = originParts.length
      ? `<div class="wine-origin">${originParts.map(esc).join(' · ')}</div>`
      : '';

    const grapeHtml = grapes
      ? `<div class="wine-grapes">${esc(grapes)}${region && !appel ? ` <span class="region-tag">&#x2014; ${esc(region)}</span>` : ''}</div>`
      : '';

    const qrDataUrl = qrMap.get(w.id) ?? '';
    const qrEl = qrDataUrl
      ? `<div class="qr-cell"><img src="${qrDataUrl}" class="qr-img" alt="QR" /></div>`
      : '';

    // ── Mini-rack visuel ───────────────────────────────────────────────────────
    const wineSlotIds: string[] = w.slotIds ?? [];
    const slotsByLoc = new Map<string, Set<string>>();
    for (const sid of wineSlotIds) {
      const slotData = slotLookup.get(sid);
      if (!slotData) continue;
      if (!slotsByLoc.has(slotData.locationId)) slotsByLoc.set(slotData.locationId, new Set());
      slotsByLoc.get(slotData.locationId)!.add(sid);
    }

    let miniRacksHtml = '';
    if (slotsByLoc.size > 0) {
      for (const [locId, wineSlots] of slotsByLoc) {
        const locData = gridsByLocation.get(locId);
        if (!locData || !locData.rows || !locData.cols) continue;
        const svg = miniRackSVG(locData.rows, locData.cols, locData.slotMap, wineSlots, typeClr);
        if (!svg) continue;
        miniRacksHtml += `
          <div class="mini-rack">
            <div class="mini-rack-label">${esc(locData.name)}</div>
            ${svg}
          </div>`;
      }
    } else {
      // Pas d'emplacement — affiche le nom de l'emplacement en texte
      const locationName = w.locationId ? locMap.get(w.locationId) ?? null : null;
      if (locationName) {
        miniRacksHtml = `<div class="mini-rack-text">&#x1F4CD; ${esc(locationName)}</div>`;
      }
    }

    return `
    <div class="wine-card">
      <div class="wine-photo" style="border-left:3px solid ${typeClr};">
        ${photoEl}
        ${qty > 0 ? `<div class="qty-badge">&#xD7;${qty}</div>` : ''}
      </div>
      <div class="wine-info">
        <div class="wine-name-row">
          <div class="wine-name">${name}</div>
          ${vintage ? `<div class="wine-vintage">${vintage}</div>` : ''}
        </div>
        ${originLine}
        ${grapeHtml}
        ${desc ? `<div class="wine-desc">${desc}</div>` : ''}
        ${timeline}
        <div class="wine-footer">
          <div class="wine-footer-left">
            ${badgeParts.length ? `<div class="badges-row">${badgeParts.join('')}</div>` : ''}
            ${starsHtml}
          </div>
          ${miniRacksHtml ? `<div class="mini-racks-area">${miniRacksHtml}</div>` : ''}
          ${qrEl}
        </div>
      </div>
    </div>`;
  };

  // ── Assemblage des pages ──────────────────────────────────────────────────────
  let pages = '';
  for (const wineType of ordered) {
    const list   = byType.get(wineType)!;
    const label  = TYPE_LABELS[wineType] || wineType;
    const accent = TYPE_ACCENT[wineType] || '#2C3240';

    for (let i = 0; i < list.length; i += PAGE_SIZE) {
      const batch = list.slice(i, i + PAGE_SIZE);
      pages += `<div style="page-break-before:always;">`;

      if (i === 0) {
        pages += `
        <div class="section-header">
          <div class="section-title-block">
            <span class="section-rule" style="background:${accent};"></span>
            <span class="section-title" style="color:${accent};">${esc(label.toUpperCase())}</span>
          </div>
          <span class="section-count">${list.length} bouteille${list.length > 1 ? 's' : ''}</span>
        </div>`;
      } else {
        pages += `
        <div class="section-continuation">
          <span style="color:${accent}; font-size:8px; letter-spacing:0.15em; text-transform:uppercase;">${esc(label)} <span style="color:#A89E94;">(suite)</span></span>
        </div>`;
      }

      for (const w of batch) pages += wineCard(w);
      pages += `</div>`;
    }
  }

  // ── Page de couverture ────────────────────────────────────────────────────────
  const cover = `
  <div class="cover">
    <div class="cover-top-rule"></div>
    <div class="cover-body">
      <div class="cover-subtitle-top">Collection Personnelle</div>
      <div class="cover-title">${esc(title)}</div>
      <div class="cover-rule"></div>
      <div class="cover-tagline">Carte des Vins</div>
      <div class="cover-stats">
        <div class="cover-stat"><span class="stat-value">${totalBottles}</span><span class="stat-label">bouteille${totalBottles > 1 ? 's' : ''}</span></div>
        <div class="cover-sep">·</div>
        <div class="cover-stat"><span class="stat-value">${allWines.length}</span><span class="stat-label">reference${allWines.length > 1 ? 's' : ''}</span></div>
        </div>
      <div class="cover-date">${today}</div>
    </div>
    <div class="cover-bottom-rule"></div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Liberation Sans', 'Noto Sans', Arial, sans-serif;
    background: #FFFFFF;
    color: #1A1410;
    font-size: 12px;
    line-height: 1.45;
  }

  @page { size: A4; margin: 14mm 16mm 16mm 16mm; }

  /* ══ COUVERTURE ══════════════════════════════════════════════════════════════ */
  .cover {
    height: 240mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    text-align: center;
    page-break-after: always;
  }
  .cover-top-rule {
    width: 100%;
    height: 4px;
    background: linear-gradient(90deg, transparent, #7B1A1A 20%, #7B1A1A 80%, transparent);
    margin-top: 20mm;
  }
  .cover-body { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 0; padding: 0 20mm; }
  .cover-subtitle-top { font-size: 9px; letter-spacing: 0.35em; text-transform: uppercase; color: #A89E94; margin-bottom: 14px; }
  .cover-title {
    font-family: 'Liberation Serif', Georgia, 'Times New Roman', serif;
    font-size: 36px; font-weight: 400;
    letter-spacing: 0.2em; text-transform: uppercase;
    color: #1A1410; line-height: 1.2; margin-bottom: 18px;
  }
  .cover-rule { width: 60px; height: 1px; background: #C4993A; margin: 0 auto 16px; }
  .cover-tagline { font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: #7A6F64; margin-bottom: 32px; }
  .cover-stats { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
  .cover-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .stat-value { font-family: 'Liberation Serif', Georgia, serif; font-size: 22px; color: #1A1410; font-weight: 400; }
  .stat-label { font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase; color: #A89E94; }
  .cover-sep { font-size: 18px; color: #DDD7CE; margin-top: -4px; }
  .cover-date { font-size: 9px; letter-spacing: 0.15em; color: #A89E94; text-transform: uppercase; }
  .cover-bottom-rule {
    width: 100%;
    height: 1px;
    background: linear-gradient(90deg, transparent, #DDD7CE 20%, #DDD7CE 80%, transparent);
    margin-bottom: 14mm;
  }

  /* ══ EN-TETES DE SECTION ══════════════════════════════════════════════════════ */
  .section-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 0 9px 0;
    border-bottom: 1px solid #DDD7CE;
    margin-bottom: 2px;
  }
  .section-title-block { display: flex; align-items: center; gap: 8px; }
  .section-rule { display: inline-block; width: 24px; height: 2px; border-radius: 1px; flex-shrink: 0; }
  .section-title { font-size: 10px; font-weight: 700; letter-spacing: 0.22em; }
  .section-count { font-size: 8.5px; color: #A89E94; letter-spacing: 0.08em; }
  .section-continuation {
    padding: 5px 0 7px 0;
    border-bottom: 1px solid #EDE9E4;
    margin-bottom: 2px;
  }

  /* ══ FICHE VIN ════════════════════════════════════════════════════════════════ */
  .wine-card {
    display: flex; gap: 18px;
    padding: 13px 0;
    border-bottom: 1px solid #EDE9E4;
  }

  /* Photo */
  .wine-photo { width: 96px; flex-shrink: 0; position: relative; padding-left: 6px; }
  .wine-photo img {
    width: 90px; height: 148px;
    object-fit: contain; object-position: center;
    background: #FAF7F3;
    border: 1px solid #E8E2DA;
    display: block;
  }
  .photo-placeholder {
    width: 90px; height: 148px;
    background: #FAF7F3; border: 1px solid #E8E2DA;
    display: flex; align-items: center; justify-content: center;
    font-size: 32px;
  }
  .qty-badge {
    position: absolute; bottom: 4px; right: 0;
    background: #1A1410; color: #FAF7F3;
    font-size: 8px; font-weight: 700; letter-spacing: 0.05em;
    padding: 1px 5px; border-radius: 2px;
  }

  /* Info */
  .wine-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

  .wine-name-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .wine-name {
    font-family: 'Liberation Serif', Georgia, 'Times New Roman', serif;
    font-size: 14px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: #1A1410; line-height: 1.25; flex: 1;
  }
  .wine-vintage {
    font-family: 'Liberation Serif', Georgia, serif;
    font-size: 13px; font-weight: 400; color: #B8922E;
    flex-shrink: 0; white-space: nowrap;
  }

  .wine-origin { font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #7A6F64; }
  .wine-grapes { font-size: 10.5px; color: #B8922E; font-style: italic; }
  .region-tag  { color: #A89E94; font-style: normal; }

  .wine-desc {
    font-size: 10.5px; color: #5A4F46; font-style: italic; line-height: 1.55;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }

  /* Footer de la fiche */
  .wine-footer {
    display: flex; align-items: flex-end; justify-content: space-between; gap: 10px;
    margin-top: auto; padding-top: 6px;
  }
  .wine-footer-left { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; min-width: 0; }
  .badges-row { display: flex; flex-wrap: wrap; gap: 3px; }

  .badge {
    display: inline-block;
    padding: 1.5px 8px; border-radius: 2px;
    font-size: 8px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .stars { font-size: 12px; letter-spacing: 1px; }

  /* ══ MINI-RACK ════════════════════════════════════════════════════════════════ */
  .mini-racks-area {
    display: flex; flex-wrap: wrap; gap: 8px;
    align-items: flex-end; justify-content: center;
    flex: 1;
  }
  .mini-rack {
    display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  }
  .mini-rack-label {
    font-size: 7px; letter-spacing: 0.1em; text-transform: uppercase;
    color: #A89E94; white-space: nowrap;
    font-family: 'Liberation Mono', 'Courier New', monospace;
  }
  .mini-rack-text {
    font-size: 8.5px; color: #7A6F64;
    font-family: 'Liberation Mono', 'Courier New', monospace;
  }

  .qr-cell { flex-shrink: 0; }
  .qr-img  { display: block; width: 72px; height: 72px; border: 1px solid #DDD7CE; border-radius: 3px; }

  /* Footer de page */
  footer {
    margin-top: 14px; padding-top: 8px;
    border-top: 1px solid #EDE9E4;
    display: flex; justify-content: space-between; align-items: center;
    color: #A89E94; font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase;
  }

  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .wine-card { page-break-inside: avoid; }
  }
</style>
</head>
<body>

${cover}

${pages}

<footer>
  <span>${esc(title)}</span>
  <span>Carte des Vins · ${year}</span>
</footer>

</body>
</html>`;
}

// ─── Catalogue photo (template=catalog) ──────────────────────────────────────

function buildHTMLcatalog(
  allWines: Record<string, any>[],
  photosPath: string,
  title: string,
  slotLookup: Map<string, SlotRow>,
  gridsByLocation: Map<string, LocationGridData>,
): string {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const TYPE_ACCENT_CAT: Record<string, string> = {
    rouge: '#7B1A1A', blanc: '#A07820', rose: '#A8174E',
    champagne: '#7A3300', mousseux: '#7A3300',
    petillant: '#044F36', moelleux: '#4A1A90', fortifie: '#2D2880',
    spiritueux: '#2C3240', autre: '#2C3240',
  };
  const TYPE_LABEL: Record<string, string> = {
    rouge: 'Rouge', blanc: 'Blanc', rose: 'Rosé',
    champagne: 'Champagne', mousseux: 'Mousseux',
    petillant: 'Pétillant', moelleux: 'Moelleux', fortifie: 'Fortifié',
    spiritueux: 'Spiritueux', autre: 'Autre',
  };

  const catalogCard = (w: Record<string, any>): string => {
    const imgSrc    = photoBase64(w.photoUrl, photosPath);
    const name      = esc(trunc(w.name || 'Sans nom', 42));
    const vintage   = w.vintage ? String(w.vintage) : (w.nonVintage ? 'NV' : '');
    const appel     = esc(w.appellation || w.region || '');
    const qty       = w.quantity ?? 0;
    const typeKey   = (w.type || 'autre').toLowerCase();
    const typeClr   = TYPE_ACCENT_CAT[typeKey] || '#2C3240';
    const typeLabel = TYPE_LABEL[typeKey] || esc(w.type || '');

    const photoEl = imgSrc
      ? `<img src="${imgSrc}" alt="${name}" />`
      : `<div class="cat-placeholder">🍷</div>`;

    // Mini rack — premier rack seulement (compact)
    const wineSlotIds: string[] = w.slotIds ?? [];
    const slotsByLoc = new Map<string, Set<string>>();
    for (const sid of wineSlotIds) {
      const slotData = slotLookup.get(sid);
      if (!slotData) continue;
      if (!slotsByLoc.has(slotData.locationId)) slotsByLoc.set(slotData.locationId, new Set());
      slotsByLoc.get(slotData.locationId)!.add(sid);
    }
    let rackSvg = '';
    for (const [locId, wineSlots] of slotsByLoc) {
      const locData = gridsByLocation.get(locId);
      if (!locData || !locData.rows || !locData.cols) continue;
      const svg = miniRackSVG(locData.rows, locData.cols, locData.slotMap, wineSlots, typeClr);
      if (svg) { rackSvg = svg; break; }
    }

    const subParts = [vintage ? `<strong>${vintage}</strong>` : '', appel].filter(Boolean);

    return `
    <div class="cat-card" style="--tc:${typeClr};">
      <div class="cat-photo">
        ${photoEl}
        ${qty > 0 ? `<div class="cat-qty">×${qty}</div>` : ''}
      </div>
      <div class="cat-info">
        <div class="cat-name">${name}</div>
        ${subParts.length ? `<div class="cat-sub">${subParts.join(' · ')}</div>` : ''}
        <div class="cat-footer">
          <div class="cat-type">
            <span class="cat-dot" style="background:${typeClr};"></span>
            <span class="cat-type-label">${typeLabel}</span>
          </div>
          ${rackSvg ? `<div class="cat-rack">${rackSvg}</div>` : ''}
        </div>
      </div>
    </div>`;
  };

  const cards = allWines.map(catalogCard).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Liberation Sans', 'Noto Sans', Arial, sans-serif;
    background: #ffffff;
    color: #111;
    font-size: 11px;
    line-height: 1.4;
  }

  @page { size: A4; margin: 11mm 11mm 13mm 11mm; }

  /* ── En-tête ─────────────────────────────────────────── */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-bottom: 6px;
    margin-bottom: 12px;
    border-bottom: 1px solid #111;
  }
  .doc-header-left { display: flex; flex-direction: column; gap: 1px; }
  .doc-title {
    font-family: 'Liberation Serif', Georgia, serif;
    font-size: 20px;
    font-weight: 400;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #111;
    line-height: 1;
  }
  .doc-tagline {
    font-size: 7.5px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #9CA3AF;
  }
  .doc-meta {
    font-size: 7.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9CA3AF;
    text-align: right;
    line-height: 1.7;
  }

  /* ── Grille 3 colonnes ───────────────────────────────── */
  .cat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  /* ── Carte ───────────────────────────────────────────── */
  .cat-card {
    background: #fff;
    border: 1px solid #E5E7EB;
    border-top: 3px solid var(--tc);
    overflow: hidden;
    break-inside: avoid;
  }

  /* Zone photo */
  .cat-photo {
    width: 100%;
    height: 165px;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    border-bottom: 1px solid #F3F4F6;
  }
  .cat-photo img {
    max-height: 158px;
    max-width: 86%;
    object-fit: contain;
    display: block;
  }
  .cat-placeholder {
    font-size: 30px;
    color: #D1D5DB;
  }
  .cat-qty {
    position: absolute;
    bottom: 5px;
    right: 6px;
    background: rgba(17,17,17,0.55);
    color: #fff;
    font-size: 8.5px;
    font-weight: 700;
    padding: 1px 4px;
    font-family: 'Liberation Mono', 'Courier New', monospace;
    letter-spacing: 0.03em;
  }

  /* Zone info */
  .cat-info { padding: 7px 8px 8px; }
  .cat-name {
    font-weight: 700;
    font-size: 10.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #111;
    line-height: 1.3;
    letter-spacing: 0.01em;
  }
  .cat-sub {
    font-size: 9px;
    color: #6B7280;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cat-sub strong { color: #92600E; font-weight: 600; }

  .cat-footer {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-top: 5px;
    gap: 4px;
    min-height: 0;
  }
  .cat-type { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
  .cat-dot  { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .cat-type-label { font-size: 8.5px; color: #6B7280; }

  /* Rack SVG : plafonné pour ne pas gonfler la carte */
  .cat-rack {
    flex-shrink: 0;
    line-height: 0;
    max-height: 46px;
    max-width: 66px;
    overflow: hidden;
  }
  .cat-rack svg {
    max-height: 46px !important;
    max-width: 66px !important;
    height: auto !important;
    width:  auto !important;
    display: block;
  }

  /* ── Pied de page ────────────────────────────────────── */
  .doc-footer {
    margin-top: 12px;
    padding-top: 5px;
    border-top: 1px solid #E5E7EB;
    display: flex;
    justify-content: space-between;
    color: #9CA3AF;
    font-size: 7px;
    letter-spacing: 0.10em;
    text-transform: uppercase;
  }

  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .cat-card { page-break-inside: avoid; break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="doc-header">
  <div class="doc-header-left">
    <div class="doc-title">${esc(title)}</div>
    <div class="doc-tagline">Catalogue des vins</div>
  </div>
  <div class="doc-meta">
    ${allWines.length} référence${allWines.length > 1 ? 's' : ''}<br>
    ${today}
  </div>
</div>

<div class="cat-grid">
${cards}
</div>

<div class="doc-footer">
  <span>${esc(title)}</span>
  <span>${new Date().getFullYear()}</span>
</div>

</body>
</html>`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function pdfRoutes(app: FastifyInstance) {
  app.get('/api/pdf/wine-list', async (req, reply) => {
    const photosPath = process.env.PHOTOS_PATH || '/photos';
    const caveTitle  = process.env.CAVE_TITLE  || 'Ma Cave';
    const publicBase = process.env.PUBLIC_BASE_URL || `${(req.headers['x-forwarded-proto'] ?? 'http')}://${req.headers.host}`;
    const { template } = (req.query as Record<string, string>);

    const allWines = await db.select().from(wines)
      .where(eq(wines.importStatus, 'available'))
      .orderBy(wines.type, wines.region, wines.appellation, wines.vintage, wines.name);

    if (!allWines.length)
      return reply.status(404).send({ error: 'Aucun vin disponible' });

    // Charger les locations pour afficher les noms (id -> name)
    const allLocations = await db.select({ id: locations.id, name: locations.name }).from(locations);
    const locMap = new Map(allLocations.map((l) => [l.id, l.name]));

    // ── Grilles pour la représentation visuelle (v2) ──────────────────────────
    let slotLookup     = new Map<string, SlotRow>();
    let gridsByLocation = new Map<string, LocationGridData>();

    if (template === 'v2' || template === 'catalog') {
      const allWineSlotIds = [...new Set(allWines.flatMap(w => (w.slotIds as string[] | null) ?? []))];

      if (allWineSlotIds.length > 0) {
        // Trouver les locationIds concernés via les slotIds
        const wineSlotLocRows = await db
          .select({ id: gridSlots.id, locationId: gridSlots.locationId })
          .from(gridSlots)
          .where(inArray(gridSlots.id, allWineSlotIds));

        const involvedLocIds = [...new Set([
          ...allWines.map(w => w.locationId as string | null).filter((id): id is string => Boolean(id)),
          ...wineSlotLocRows.map(r => r.locationId),
        ])];

        if (involvedLocIds.length > 0) {
          const [allGridSlotRows, gridLocations] = await Promise.all([
            db.select().from(gridSlots).where(inArray(gridSlots.locationId, involvedLocIds)),
            db.select().from(locations).where(inArray(locations.id, involvedLocIds)),
          ]);

          slotLookup = new Map(allGridSlotRows.map(s => [s.id, s as unknown as SlotRow]));

          for (const loc of gridLocations) {
            const locSlots = allGridSlotRows.filter(s => s.locationId === loc.id);
            const slotMap  = new Map(locSlots.map(s => [`${s.rowIndex},${s.colIndex}`, s as unknown as SlotRow]));
            gridsByLocation.set(loc.id, {
              name:    loc.name,
              color:   loc.color,
              rows:    (loc.gridConfig as any)?.rows ?? 0,
              cols:    (loc.gridConfig as any)?.cols ?? 0,
              slotMap,
            });
          }
        }
      }
    }

    // ── QR codes (pas nécessaire pour le catalogue) ───────────────────────────
    const qrSize = template === 'v2' ? 90 : 60;
    const qrMap = new Map<string, string>();
    if (template !== 'catalog') {
      await Promise.all(
        allWines.map(async (w) => {
          const url = `${publicBase}/public/wine/${w.id}`;
          qrMap.set(w.id, await makeQR(url, qrSize));
        })
      );
    }

    const html = template === 'v2'
      ? buildHTMLv2(allWines as Record<string, any>[], photosPath, caveTitle, locMap, qrMap, slotLookup, gridsByLocation)
      : template === 'catalog'
        ? buildHTMLcatalog(allWines as Record<string, any>[], photosPath, caveTitle, slotLookup, gridsByLocation)
        : buildHTML(allWines as Record<string, any>[], photosPath, caveTitle, locMap, qrMap);

    const browser = await puppeteer.launch({
      executablePath: CHROME,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '14mm', right: '16mm', bottom: '16mm', left: '16mm' },
      });

      const filename =
        template === 'v2'      ? 'carte-des-vins-illustree.pdf' :
        template === 'catalog' ? 'catalogue-des-vins.pdf' :
                                 'carte-des-vins.pdf';
      reply.raw.setHeader('Content-Type', 'application/pdf');
      reply.raw.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      reply.raw.end(pdf);
    } finally {
      await browser.close();
    }

    return reply;
  });
}
