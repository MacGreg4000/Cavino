import type { FastifyInstance } from 'fastify';
import puppeteer from 'puppeteer-core';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { wines, locations } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

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
  if (from  && year < from)  return { label: 'Trop tôt',  style: 'background:#DBEAFE;color:#1E40AF' };
  if (until && year > until) return { label: 'Dépassé',   style: 'background:#F3F4F6;color:#6B7280' };
  if (pf && pu && year >= pf && year <= pu) return { label: 'Apogée', style: 'background:#FEF3C7;color:#92400E' };
  return { label: 'À boire', style: 'background:#D1FAE5;color:#065F46' };
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
  const drinkR = pct((until ?? year) + 1);
  const drinkW = `${Math.max(0, Math.min(100, ((( until ?? year) + 1 - (from ?? year)) / span) * 100)).toFixed(1)}%`;

  const peakHtml = (pf && pu)
    ? `<div class="tl-peak" style="left:${pct(pf)};width:${pct(pu + 1).replace('%','')}% - whatever"></div>`
    : '';

  // Peak bar
  const peakBar = (pf && pu) ? `
    <div style="position:absolute;top:0;bottom:0;left:${pct(pf)};width:${(((pu + 1 - pf) / span) * 100).toFixed(1)}%;background:#B58D3D;border-radius:2px;opacity:0.9;"></div>` : '';

  // Current year marker
  const nowPct  = pct(year);
  const nowBar  = `<div style="position:absolute;top:-3px;bottom:-3px;left:${nowPct};width:2px;background:#8B1A1A;border-radius:1px;"></div>`;

  // Labels
  const labelFrom  = from  ? `<span style="position:absolute;left:${drinkL};transform:translateX(-50%);font-size:7px;color:#9CA3AF;top:-11px;">${from}</span>`  : '';
  const labelUntil = until ? `<span style="position:absolute;right:0;left:${pct((until ?? year)+1)};transform:translateX(-50%);font-size:7px;color:#9CA3AF;top:-11px;">${until}</span>` : '';
  const labelNow   = `<span style="position:absolute;left:${nowPct};transform:translateX(-50%);font-size:7px;color:#8B1A1A;font-weight:700;bottom:-12px;">${year}</span>`;

  return `
  <div style="position:relative;margin:6px 0 14px 0;height:6px;background:#F3F4F6;border-radius:3px;">
    ${labelFrom}${labelUntil}
    <!-- Drink window -->
    <div style="position:absolute;top:0;bottom:0;left:${drinkL};width:${drinkW};background:#D1FAE5;border-radius:3px;"></div>
    <!-- Peak window -->
    ${peakBar}
    <!-- Now marker -->
    ${nowBar}
    ${labelNow}
  </div>`;
}

function esc(s?: string | null) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function trunc(s: string, n: number) { return s.length <= n ? s : s.slice(0, n - 1) + '…'; }

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

/** Construit le bloc HTML localisation + QR pour une carte vin. */
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
      <div class="loc-icon">📍</div>
      <div class="loc-text">
        ${locationName ? `<div class="loc-name">${esc(locationName)}</div>` : ''}
        ${slotIds.length > 0 ? `<div class="loc-slots">${slotIds.map(esc).join(' · ')}</div>` : ''}
        ${qty > 0 ? `<div class="loc-qty">${qty} bouteille${qty > 1 ? 's' : ''}</div>` : ''}
      </div>
    </div>` : (qty > 0 ? `<div class="loc-qty-bare">${qty} bouteille${qty > 1 ? 's' : ''} · non placée${qty > 1 ? 's' : ''}</div>` : '');

  const qrHtml = qrDataUrl
    ? `<img src="${qrDataUrl}" class="qr-img" alt="QR" title="Fiche publique" />`
    : '';

  return `<div class="loc-qr-row">${locHtml}<div class="qr-cell">${qrHtml}</div></div>`;
}

// ─── HTML template ────────────────────────────────────────────────────────────

function buildHTML(allWines: Record<string, any>[], photosPath: string, title: string, locMap: Map<string, string>, qrMap: Map<string, string>): string {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const year  = new Date().getFullYear();

  // Group by type
  const TYPE_ORDER = ['rouge', 'blanc', 'rosé', 'rose', 'champagne', 'mousseux',
                      'pétillant', 'moelleux', 'fortifié', 'spiritueux', 'autre'];
  const TYPE_LABELS: Record<string, string> = {
    rouge: 'Vins Rouges', blanc: 'Vins Blancs', rosé: 'Vins Rosés',
    rose: 'Vins Rosés', champagne: 'Champagnes & Crémants',
    mousseux: 'Vins Mousseux', pétillant: 'Pétillants Naturels',
    moelleux: 'Vins Moelleux & Liquoreux', fortifié: 'Vins Fortifiés',
    spiritueux: 'Spiritueux', autre: 'Autres',
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

  // Build cards HTML
  let sections = '';
  for (const wineType of ordered) {
    const list  = byType.get(wineType)!;
    const label = (TYPE_LABELS[wineType] || wineType).toUpperCase();
    sections += `<div class="section-header"><span class="section-title">${esc(label)}</span></div>\n`;

    for (const w of list) {
      const imgSrc  = photoBase64(w.photoUrl, photosPath);
      const name    = esc(trunc(w.name || 'Sans nom', 60));
      const vintage = w.vintage ? ` — ${w.vintage}` : (w.nonVintage ? ' — NV' : '');
      const grapes  = ((w.grapes as string[] | null) || []).join(', ');
      const region  = [w.region, w.country].filter(Boolean).join(', ');
      const appel   = esc(w.appellation || '');
      const desc    = esc(trunc(w.description || w.palate || '', 200));
      const awards  = (w.awards as Array<{name:string}> | null) || [];

      const qty     = w.quantity ? `Qté : ${w.quantity}` : '';

      // Timeline + Badges
      const timeline = drinkTimeline(w);
      let badges = `<span class="badge" style="${typeBadgeStyle(w.type)}">${esc(w.type || 'autre')}</span>`;
      const ds = drinkStatus(w);
      if (ds) badges += `<span class="badge" style="${ds.style}">${ds.label}</span>`;
      if (awards.length) badges += `<span class="badge" style="background:#FEF3C7;color:#92400E">★ ${esc(awards[0].name)}</span>`;

      const photoEl = imgSrc
        ? `<img src="${imgSrc}" alt="${name}" />`
        : `<div class="photo-placeholder">🍷</div>`;

      const grapeHtml = grapes
        ? `<span class="grapes">Cépage${grapes.includes(',') ? 's' : ''} : ${esc(grapes)}</span>${region ? `<span class="region"> | ${esc(region)}</span>` : ''}`
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

  body {
    font-family: 'Liberation Sans', 'Noto Sans', Arial, sans-serif;
    background: white;
    color: #111827;
    font-size: 13px;
    line-height: 1.4;
  }

  @page {
    size: A4;
    margin: 12mm 15mm 14mm 15mm;
  }

  /* ── Header ── */
  header { border-top: 3px solid #8B1A1A; padding-top: 14px; margin-bottom: 6px; }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 10px;
  }

  .cave-name {
    font-size: 26px;
    font-weight: 300;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #111827;
  }

  .header-meta { color: #9CA3AF; font-size: 10px; text-align: right; }

  .header-rule { border: none; border-top: 1px solid #E5E7EB; margin-bottom: 5px; }
  .header-sub  { color: #9CA3AF; font-size: 10px; letter-spacing: 0.05em; }

  /* ── Section ── */
  .section-header {
    background: #F9FAFB;
    border-top: 1px solid #E5E7EB;
    border-bottom: 1px solid #E5E7EB;
    padding: 5px 8px;
    margin-top: 14px;
    margin-bottom: 0;
    page-break-after: avoid;
  }

  .section-title {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #8B1A1A;
  }

  /* ── Wine card ── */
  .wine-card {
    display: flex;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid #F3F4F6;
    page-break-inside: avoid;
  }

  /* Photo */
  .wine-photo { width: 54px; flex-shrink: 0; }
  .wine-photo img {
    width: 54px;
    height: 80px;
    object-fit: contain;
    object-position: center;
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    display: block;
  }
  .photo-placeholder {
    width: 54px;
    height: 80px;
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    color: #D1D5DB;
  }

  /* Info */
  .wine-info { flex: 1; min-width: 0; }

  .wine-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 3px;
  }

  .wine-name {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: #111827;
    flex: 1;
    line-height: 1.3;
  }

  .vintage { font-weight: 400; color: #B58D3D; }

  .wine-right { text-align: right; flex-shrink: 0; }
  .wine-price { font-size: 13px; font-weight: 700; color: #111827; white-space: nowrap; }
  .wine-qty   { font-size: 9px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 1px; }

  /* Grapes + region */
  .wine-grapes-line { font-size: 11px; margin-bottom: 2px; }
  .grapes  { font-weight: 600; color: #B58D3D; }
  .region  { color: #9CA3AF; font-style: italic; }

  .wine-appellation { font-size: 10px; color: #6B7280; margin-bottom: 2px; }

  .wine-desc {
    font-size: 10px;
    color: #6B7280;
    font-style: italic;
    line-height: 1.5;
    margin-bottom: 5px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Badges */
  .wine-badges { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
  .badge {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  /* Location + QR */
  .loc-qr-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
    margin-top: 5px;
  }
  .loc-block {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .loc-icon  { font-size: 9px; flex-shrink: 0; margin-top: 1px; }
  .loc-text  { min-width: 0; }
  .loc-name  { font-size: 9px; font-weight: 700; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .loc-slots { font-size: 8px; color: #8B1A1A; font-family: monospace; letter-spacing: 0.03em; }
  .loc-qty   { font-size: 8px; color: #9CA3AF; margin-top: 1px; }
  .loc-qty-bare { font-size: 8px; color: #9CA3AF; flex: 1; }
  .qr-cell   { flex-shrink: 0; }
  .qr-img    { display: block; width: 60px; height: 60px; border: 1px solid #E5E7EB; border-radius: 3px; }

  /* Footer */
  footer {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #E5E7EB;
    text-align: center;
    color: #9CA3AF;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  /* Print */
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .wine-card     { page-break-inside: avoid; }
    .section-header{ page-break-after: avoid; }
  }
</style>
</head>
<body>

<header>
  <div class="header-top">
    <div class="cave-name">${esc(title)}</div>
    <div class="header-meta">${allWines.length} référence${allWines.length > 1 ? 's' : ''}  ·  ${today}</div>
  </div>
  <hr class="header-rule">
  <div class="header-sub">Carte des Vins</div>
</header>

${sections}

<footer>${esc(title)} — ${year}</footer>

</body>
</html>`;
}

// ─── V2 HTML template — Format Illustré Premium (3 par page + page de couverture) ──

const PAGE_SIZE = 3; // bouteilles par page

function buildHTMLv2(allWines: Record<string, any>[], photosPath: string, title: string, locMap: Map<string, string>, qrMap: Map<string, string>): string {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const year  = new Date().getFullYear();

  // ── Stats pour la couverture ──────────────────────────────────────────────────
  const totalBottles = allWines.reduce((s, w) => s + (w.quantity ?? 1), 0);
  const totalValue   = allWines.reduce((s, w) => s + ((parseFloat(w.estimatedValue || '0') || 0) * (w.quantity ?? 1)), 0);

  // ── Groupement par type ───────────────────────────────────────────────────────
  const TYPE_ORDER_V2 = ['rouge', 'blanc', 'rosé', 'rose', 'champagne', 'mousseux',
                         'pétillant', 'moelleux', 'fortifié', 'spiritueux', 'autre'];
  const TYPE_LABELS: Record<string, string> = {
    rouge: 'Vins Rouges', blanc: 'Vins Blancs', rosé: 'Vins Rosés',
    rose: 'Vins Rosés', champagne: 'Champagnes & Crémants',
    mousseux: 'Vins Mousseux', pétillant: 'Pétillants Naturels',
    moelleux: 'Vins Moelleux & Liquoreux', fortifié: 'Vins Fortifiés',
    spiritueux: 'Spiritueux', autre: 'Autres',
  };
  const TYPE_ACCENT: Record<string, string> = {
    rouge: '#7B1A1A', blanc: '#A07820', rosé: '#A8174E',
    rose: '#A8174E', champagne: '#7A3300', mousseux: '#7A3300',
    pétillant: '#044F36', moelleux: '#4A1A90', fortifié: '#2D2880',
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

    const ds = drinkStatus(w);
    const badgeParts: string[] = [];
    if (ds) badgeParts.push(`<span class="badge" style="${ds.style}">${ds.label}</span>`);
    if (awards.length) badgeParts.push(`<span class="badge" style="background:#FDF3D8;color:#7A5200;border:1px solid #E8D080;">★ ${esc(awards[0].name)}</span>`);

    const rating = w.personalRating as number | null;
    const starsHtml = (rating && rating > 0)
      ? `<div class="stars">${[1,2,3,4,5].map(s => `<span style="color:${s <= rating ? '#B8922E' : '#DDD7CE'};">★</span>`).join('')}</div>`
      : '';

    const photoEl = imgSrc
      ? `<img src="${imgSrc}" alt="${name}" />`
      : `<div class="photo-placeholder"><span>🍷</span></div>`;

    const originParts = [appel || region].filter(Boolean);
    const originLine  = originParts.length
      ? `<div class="wine-origin">${originParts.map(esc).join(' · ')}</div>`
      : '';

    const grapeHtml = grapes
      ? `<div class="wine-grapes">${esc(grapes)}${region && !appel ? ` <span class="region-tag">— ${esc(region)}</span>` : ''}</div>`
      : '';

    const qrDataUrl = qrMap.get(w.id) ?? '';

    // Localisation compacte
    const locationName = w.locationId ? locMap.get(w.locationId) ?? null : null;
    const slotIds: string[] = w.slotIds ?? [];
    const locLine = (locationName || slotIds.length)
      ? `<span class="loc-inline">📍 ${locationName ? esc(locationName) + (slotIds.length ? ' · ' : '') : ''}${slotIds.map(esc).join(' ')}</span>`
      : '';

    const qrEl = qrDataUrl
      ? `<img src="${qrDataUrl}" class="qr-img" alt="QR" />`
      : '';

    // Indicateur type (bande colorée sur la gauche de la photo)
    const typeKey  = (w.type || 'autre').toLowerCase();
    const typeClr  = TYPE_ACCENT[typeKey] || '#2C3240';

    return `
    <div class="wine-card">
      <div class="wine-photo" style="border-left:3px solid ${typeClr};">
        ${photoEl}
        ${qty > 0 ? `<div class="qty-badge">×${qty}</div>` : ''}
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
            ${badgeParts.join('')}
            ${starsHtml}
            ${locLine}
          </div>
          ${qrEl ? `<div class="qr-cell">${qrEl}</div>` : ''}
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
        // suite de section — label discret
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
        <div class="cover-stat"><span class="stat-value">${allWines.length}</span><span class="stat-label">référence${allWines.length > 1 ? 's' : ''}</span></div>
        ${totalValue > 0 ? `<div class="cover-sep">·</div><div class="cover-stat"><span class="stat-value">${totalValue.toFixed(0)} €</span><span class="stat-label">valeur estimée</span></div>` : ''}
      </div>
      <div class="cover-date">${today}</div>
    </div>
    <div class="cover-bottom-rule"></div>
  </div>`;

  // ── HTML complet ──────────────────────────────────────────────────────────────
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

  /* ══ EN-TÊTES DE SECTION ═════════════════════════════════════════════════════ */
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
    padding: 13px 0 13px 0;
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
    display: flex; align-items: flex-end; justify-content: space-between; gap: 8px;
    margin-top: auto; padding-top: 4px;
  }
  .wine-footer-left { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }

  .badge {
    display: inline-block;
    padding: 1.5px 8px; border-radius: 2px;
    font-size: 8px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .stars { font-size: 13px; letter-spacing: 1px; }

  .loc-inline {
    font-size: 8.5px; color: #7A6F64;
    font-family: 'Liberation Mono', 'Courier New', monospace;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: block;
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

// ─── Route ────────────────────────────────────────────────────────────────────
const TYPE_ORDER = ['rouge', 'blanc', 'rosé', 'rose', 'champagne', 'mousseux',
                    'pétillant', 'moelleux', 'fortifié', 'spiritueux', 'autre'];

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

    // Charger les locations pour afficher les noms (id → name)
    const allLocations = await db.select({ id: locations.id, name: locations.name }).from(locations);
    const locMap = new Map(allLocations.map((l) => [l.id, l.name]));

    // Pré-générer les QR codes en parallèle (1 par bouteille)
    const qrSize = template === 'v2' ? 90 : 60;
    const qrMap = new Map<string, string>();
    await Promise.all(
      allWines.map(async (w) => {
        const url = `${publicBase}/public/wine/${w.id}`;
        qrMap.set(w.id, await makeQR(url, qrSize));
      })
    );

    const html = template === 'v2'
      ? buildHTMLv2(allWines as Record<string, any>[], photosPath, caveTitle, locMap, qrMap)
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
        margin: { top: '12mm', right: '15mm', bottom: '14mm', left: '15mm' },
      });

      const filename = template === 'v2' ? 'carte-des-vins-illustree.pdf' : 'carte-des-vins.pdf';
      reply.raw.setHeader('Content-Type', 'application/pdf');
      reply.raw.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      reply.raw.end(pdf);
    } finally {
      await browser.close();
    }

    return reply;
  });
}
