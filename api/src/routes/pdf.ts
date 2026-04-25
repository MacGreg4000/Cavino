import type { FastifyInstance } from 'fastify';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { wines } from '../db/schema.js';
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

// ─── HTML template ────────────────────────────────────────────────────────────

function buildHTML(allWines: Record<string, any>[], photosPath: string, title: string): string {
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

      const price   = w.purchasePrice
        ? `${parseFloat(w.purchasePrice).toFixed(2).replace('.', ',')} €`
        : w.estimatedValue
        ? `≈ ${parseFloat(w.estimatedValue).toFixed(2).replace('.', ',')} €`
        : '';
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

      sections += `
      <div class="wine-card">
        <div class="wine-photo">${photoEl}</div>
        <div class="wine-info">
          <div class="wine-header">
            <div class="wine-name">${name}${vintage ? `<span class="vintage">${vintage}</span>` : ''}</div>
            ${price || qty ? `<div class="wine-right">${price ? `<div class="wine-price">${price}</div>` : ''}${qty ? `<div class="wine-qty">${qty}</div>` : ''}</div>` : ''}
          </div>
          ${grapeHtml ? `<div class="wine-grapes-line">${grapeHtml}</div>` : ''}
          ${appel ? `<div class="wine-appellation">${appel}</div>` : ''}
          ${desc ? `<div class="wine-desc">${desc}</div>` : ''}
          ${timeline}
          <div class="wine-badges">${badges}</div>
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

// ─── V2 HTML template (4 par page, grande photo + saut de page par section) ───

const PAGE_SIZE = 4; // bouteilles par page

function buildHTMLv2(allWines: Record<string, any>[], photosPath: string, title: string): string {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const year  = new Date().getFullYear();

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
    rouge: '#8B1A1A', blanc: '#B58D3D', rosé: '#C2185B',
    rose: '#C2185B', champagne: '#92400E', mousseux: '#92400E',
    pétillant: '#065F46', moelleux: '#5B21B6', fortifié: '#3730A3',
    spiritueux: '#374151', autre: '#374151',
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

  // Helper : construit le HTML d'une fiche vin
  const wineCard = (w: Record<string, any>) => {
    const imgSrc  = photoBase64(w.photoUrl, photosPath);
    const name    = esc(trunc(w.name || 'Sans nom', 60));
    const vintage = w.vintage ? ` — ${w.vintage}` : (w.nonVintage ? ' — NV' : '');
    const grapes  = ((w.grapes as string[] | null) || []).join(', ');
    const region  = [w.region, w.country].filter(Boolean).join(', ');
    const appel   = esc(w.appellation || '');
    const desc    = esc(trunc(w.description || w.palate || '', 320));
    const awards  = (w.awards as Array<{name: string}> | null) || [];

    const qty = w.quantity ? `×${w.quantity}` : '';

    const timeline = drinkTimeline(w);
    let badges = `<span class="badge" style="${typeBadgeStyle(w.type)}">${esc(w.type || 'autre')}</span>`;
    const ds = drinkStatus(w);
    if (ds) badges += `<span class="badge" style="${ds.style}">${ds.label}</span>`;
    if (awards.length) badges += `<span class="badge" style="background:#FEF3C7;color:#92400E">★ ${esc(awards[0].name)}</span>`;

    const rating = w.personalRating as number | null;
    const starsHtml = (rating && rating > 0)
      ? `<div style="margin-top:4px;">${[1,2,3,4,5].map(s =>
          `<span style="color:${s <= rating ? '#B58D3D' : '#D1D5DB'};font-size:13px;">★</span>`
        ).join('')}</div>`
      : '';

    const photoEl = imgSrc
      ? `<img src="${imgSrc}" alt="${name}" />`
      : `<div class="photo-placeholder">🍷</div>`;

    const grapeHtml = grapes
      ? `<span class="grapes">Cépage${grapes.includes(',') ? 's' : ''} : ${esc(grapes)}</span>${region ? `<span class="region"> | ${esc(region)}</span>` : ''}`
      : region ? `<span class="region">${esc(region)}</span>` : '';

    return `
    <div class="wine-card">
      <div class="wine-photo">${photoEl}</div>
      <div class="wine-info">
        <div class="wine-header">
          <div class="wine-name">${name}${vintage ? `<span class="vintage">${vintage}</span>` : ''}</div>
          ${qty ? `<div class="wine-qty">${qty}</div>` : ''}
        </div>
        ${grapeHtml ? `<div class="wine-grapes-line">${grapeHtml}</div>` : ''}
        ${appel ? `<div class="wine-appellation">${appel}</div>` : ''}
        ${desc  ? `<div class="wine-desc">${desc}</div>` : ''}
        ${timeline}
        <div class="wine-badges">${badges}</div>
        ${starsHtml}
      </div>
    </div>`;
  };

  // Construction par groupes de PAGE_SIZE avec saut de page explicite
  let pages = '';
  let isVeryFirst = true;

  for (const wineType of ordered) {
    const list   = byType.get(wineType)!;
    const label  = (TYPE_LABELS[wineType] || wineType).toUpperCase();
    const accent = TYPE_ACCENT[wineType] || '#8B1A1A';

    // Découper la section en pages de PAGE_SIZE
    for (let i = 0; i < list.length; i += PAGE_SIZE) {
      const batch      = list.slice(i, i + PAGE_SIZE);
      const isFirst    = i === 0;
      const pageBreak  = isVeryFirst ? '' : 'page-break-before:always;';
      isVeryFirst      = false;

      let pageHtml = `<div style="${pageBreak}">`;

      // En-tête de section : seulement sur la 1re page de chaque section
      if (isFirst) {
        pageHtml += `
        <div class="section-header" style="border-left:4px solid ${accent};">
          <span class="section-title" style="color:${accent};">${esc(label)}</span>
          <span class="section-count">${list.length} bouteille${list.length > 1 ? 's' : ''}</span>
        </div>`;
      }

      for (const w of batch) pageHtml += wineCard(w);

      pageHtml += `</div>`;
      pages += pageHtml;
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
  header { border-top: 3px solid #8B1A1A; padding-top: 14px; margin-bottom: 8px; }

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

  /* ── Section header ── */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #F9FAFB;
    border-top: 1px solid #E5E7EB;
    border-bottom: 1px solid #E5E7EB;
    padding: 8px 12px;
    margin-bottom: 2px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
  }

  .section-count {
    font-size: 9px;
    color: #9CA3AF;
    letter-spacing: 0.05em;
  }

  /* ── Wine card V2 — 4 par page, grande photo ── */
  .wine-card {
    display: flex;
    gap: 20px;
    padding: 14px 0;
    border-bottom: 1px solid #F0F0F0;
  }

  /* Photo 120×182px */
  .wine-photo { width: 120px; flex-shrink: 0; }
  .wine-photo img {
    width: 120px;
    height: 182px;
    object-fit: contain;
    object-position: center;
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    display: block;
  }
  .photo-placeholder {
    width: 120px;
    height: 182px;
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 38px;
    color: #D1D5DB;
  }

  /* Info */
  .wine-info { flex: 1; min-width: 0; }

  .wine-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 5px;
  }

  .wine-name {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    color: #111827;
    flex: 1;
    line-height: 1.3;
  }

  .vintage { font-weight: 400; color: #B58D3D; }

  .wine-qty { font-size: 11px; color: #9CA3AF; font-weight: 600; letter-spacing: 0.05em; flex-shrink: 0; }

  .wine-grapes-line { font-size: 12px; margin-bottom: 4px; }
  .grapes  { font-weight: 600; color: #B58D3D; }
  .region  { color: #9CA3AF; font-style: italic; }

  .wine-appellation { font-size: 11px; color: #6B7280; margin-bottom: 4px; }

  .wine-desc {
    font-size: 11px;
    color: #6B7280;
    font-style: italic;
    line-height: 1.55;
    margin-bottom: 7px;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .wine-badges { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
  .badge {
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

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

  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
  <div class="header-sub">Carte des Vins — Format Illustré</div>
</header>

${pages}

<footer>${esc(title)} — ${year}</footer>

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
    const { template } = (req.query as Record<string, string>);

    const allWines = await db.select().from(wines)
      .where(eq(wines.importStatus, 'available'))
      .orderBy(wines.type, wines.region, wines.appellation, wines.vintage, wines.name);

    if (!allWines.length)
      return reply.status(404).send({ error: 'Aucun vin disponible' });

    const html = template === 'v2'
      ? buildHTMLv2(allWines as Record<string, any>[], photosPath, caveTitle)
      : buildHTML(allWines as Record<string, any>[], photosPath, caveTitle);

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
