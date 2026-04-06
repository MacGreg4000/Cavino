#!/usr/bin/env python3
"""
Cavino — Carte des vins (PDF luxe)

Usage:
    python generate_wine_list.py [OPTIONS]

Options:
    --output    Fichier de sortie  (défaut: carte_des_vins.pdf)
    --db        URL PostgreSQL     (défaut: $DATABASE_URL ou localhost)
    --api       URL de l'API       (défaut: http://localhost:3010)
    --photos    Dossier photos     (si accès direct au volume Docker)
    --title     Titre de la cave   (défaut: Ma Cave)

Exemple depuis le serveur Ubuntu:
    python3 generate_wine_list.py --photos /var/lib/docker/volumes/cavino_wine_photos/_data
"""

import os
import sys
import argparse
import requests
from io import BytesIO
from datetime import date
from pathlib import Path
from collections import defaultdict

import psycopg2
import psycopg2.extras
from PIL import Image as PILImage
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, Image,
)
from reportlab.platypus.flowables import Flowable


# ── Palette Cave Noire ────────────────────────────────────────────────────────

C_PAGE_BG   = colors.HexColor('#0D0D0F')
C_CARD_BG   = colors.HexColor('#16161A')
C_CARD_ALT  = colors.HexColor('#111114')
C_CREAM     = colors.HexColor('#F2EDE4')
C_GOLD      = colors.HexColor('#C9B99A')
C_MUTED     = colors.HexColor('#6A6A72')
C_DIVIDER   = colors.HexColor('#28282E')
C_ACCENT    = colors.HexColor('#7A1A1A')
C_WHITE     = colors.HexColor('#FFFFFF')

_TYPE_PALETTE = {
    'rouge':     '#C0392B',
    'blanc':     '#C9A227',
    'rosé':      '#C45E8A',
    'rose':      '#C45E8A',
    'champagne': '#D4AF37',
    'mousseux':  '#D4AF37',
    'pétillant': '#D4AF37',
    'moelleux':  '#8E44AD',
    'fortifié':  '#884EA0',
    'spiritueux':'#5B6E8A',
}

def type_color(wine_type: str | None) -> colors.HexColor:
    if not wine_type:
        return C_MUTED
    t = wine_type.lower()
    for key, hex_col in _TYPE_PALETTE.items():
        if key in t:
            return colors.HexColor(hex_col)
    return C_MUTED


# ── Database ──────────────────────────────────────────────────────────────────

def fetch_wines(db_url: str) -> list[dict]:
    conn = psycopg2.connect(db_url)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT
            id, name, domain, appellation, vintage, non_vintage,
            type, grapes, country, region, sub_region, classification,
            alcohol, bottle_size,
            serving_temp_min, serving_temp_max, decanting, decanting_time,
            drink_from, drink_until, peak_from, peak_until,
            description, palate, style,
            pairings_ideal, pairings_good, cheese_pairings,
            awards, photo_url, quantity,
            purchase_price, estimated_value,
            personal_rating, is_favorite, mentions
        FROM wines
        WHERE import_status = 'available'
        ORDER BY
            CASE type
                WHEN 'rouge'     THEN 1
                WHEN 'blanc'     THEN 2
                WHEN 'rosé'      THEN 3
                WHEN 'champagne' THEN 4
                WHEN 'mousseux'  THEN 5
                WHEN 'moelleux'  THEN 6
                ELSE 9
            END,
            region NULLS LAST,
            appellation NULLS LAST,
            vintage DESC NULLS LAST,
            name
    """)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Photo loading ─────────────────────────────────────────────────────────────

def load_photo(photo_url: str | None, api_base: str, photos_dir: str | None) -> PILImage.Image | None:
    if not photo_url:
        return None
    try:
        if photos_dir:
            fname = photo_url.split('/photos/')[-1].lstrip('/')
            fpath = Path(photos_dir) / fname
            if fpath.exists():
                return PILImage.open(fpath).convert('RGB')

        url = (api_base.rstrip('/') + photo_url) if photo_url.startswith('/') else photo_url
        resp = requests.get(url, timeout=8)
        if resp.status_code == 200:
            return PILImage.open(BytesIO(resp.content)).convert('RGB')
    except Exception:
        pass
    return None


def pil_to_rl_image(img: PILImage.Image, max_w: float, max_h: float) -> ImageReader:
    """Resize PIL image to fit within max_w × max_h, return ReportLab ImageReader."""
    iw, ih = img.size
    scale  = min(max_w / iw, max_h / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img    = img.resize((nw, nh), PILImage.LANCZOS)
    buf    = BytesIO()
    img.save(buf, 'JPEG', quality=85)
    buf.seek(0)
    return ImageReader(buf)


# ── Text helpers ──────────────────────────────────────────────────────────────

def _style(name, **kw) -> ParagraphStyle:
    defaults = dict(fontName='Helvetica', fontSize=8, leading=10,
                    textColor=C_CREAM, spaceAfter=0, spaceBefore=0)
    defaults.update(kw)
    return ParagraphStyle(name, **defaults)

S_NAME     = _style('name',     fontName='Helvetica-Bold', fontSize=10.5,
                    leading=13, textColor=C_CREAM)
S_DOMAIN   = _style('domain',   fontSize=8.5, leading=11, textColor=C_GOLD)
S_REGION   = _style('region',   fontSize=7.5, leading=10, textColor=C_MUTED)
S_GRAPES   = _style('grapes',   fontName='Helvetica-Oblique', fontSize=7.5,
                    leading=10, textColor=C_MUTED)
S_DESC     = _style('desc',     fontSize=7.5, leading=10,
                    textColor=colors.HexColor('#8A8A94'))
S_SERVICE  = _style('service',  fontSize=7, leading=9, textColor=C_MUTED)
S_AWARD    = _style('award',    fontName='Helvetica-Oblique', fontSize=7,
                    leading=9,  textColor=colors.HexColor('#D4AF37'))
S_SECTION  = _style('section',  fontName='Helvetica-Bold', fontSize=9,
                    leading=12, textColor=C_GOLD, spaceBefore=4*mm)

MAX_INFO_W = 107 * mm   # info column width (A4 - margins - photo col - gap)


def _trunc(text: str, max_chars: int) -> str:
    return text if len(text) <= max_chars else text[:max_chars - 1] + '…'


def build_info_paragraphs(wine: dict) -> list:
    """Return a list of Paragraphs describing the wine."""
    paras = []
    tc = type_color(wine.get('type'))
    tc_hex = tc.hexval().replace('0x', '').replace('0X', '').upper().zfill(6)

    # Name + vintage
    name    = wine.get('name') or 'Sans nom'
    vintage = wine.get('vintage')
    nv      = wine.get('non_vintage')
    v_str   = '' if (nv or not vintage) else f'  <font color="#{tc_hex}"><b>{vintage}</b></font>'
    paras.append(Paragraph(f'<b>{name}</b>{v_str}', S_NAME))

    # Domain + Appellation
    parts = [p for p in [wine.get('domain'), wine.get('appellation')] if p]
    if parts:
        paras.append(Paragraph(_trunc('  ·  '.join(parts), 70), S_DOMAIN))

    # Region + Country + type chip
    region_parts = [p for p in [wine.get('region'), wine.get('country')] if p]
    wine_type    = wine.get('type') or ''
    region_str   = '  ·  '.join(region_parts) if region_parts else ''
    type_chip    = (f'  <font color="#{tc_hex}"><b>[{wine_type.upper()}]</b></font>' if wine_type else '')
    if region_str or type_chip:
        paras.append(Paragraph(f'{region_str}{type_chip}', S_REGION))

    # Grapes
    grapes = wine.get('grapes') or []
    if grapes:
        paras.append(Paragraph(_trunc('  ·  '.join(grapes), 80), S_GRAPES))

    # Description (max 2 lines ≈ 160 chars)
    desc = wine.get('description') or wine.get('palate') or ''
    if desc:
        paras.append(Paragraph(_trunc(desc, 160), S_DESC))

    # Service row
    service_parts = []
    t_min, t_max = wine.get('serving_temp_min'), wine.get('serving_temp_max')
    if t_min and t_max:
        service_parts.append(f'{t_min}–{t_max} °C')
    elif t_min:
        service_parts.append(f'{t_min} °C')
    qty = wine.get('quantity')
    if qty:
        service_parts.append(f'{qty} bouteille{"s" if qty > 1 else ""}')
    dr_from, dr_until = wine.get('drink_from'), wine.get('drink_until')
    if dr_from and dr_until:
        service_parts.append(f'à boire {dr_from}–{dr_until}')
    elif dr_until:
        service_parts.append(f'avant {dr_until}')
    if wine.get('decanting'):
        dec_t = wine.get('decanting_time')
        service_parts.append(f'décantation{f" {dec_t} min" if dec_t else ""}')
    if service_parts:
        paras.append(Paragraph('  ·  '.join(service_parts), S_SERVICE))

    # Pairings (max 3)
    pairings = (wine.get('pairings_ideal') or [])[:3]
    if pairings:
        paras.append(Paragraph(_trunc(', '.join(pairings), 100), S_SERVICE))

    # Awards
    awards = wine.get('awards') or []
    if awards:
        award_str = '  ·  '.join(
            _trunc(f"{a.get('name','?')} {a.get('year','') or ''} {a.get('medal','') or ''}".strip(), 40)
            for a in awards[:2]
        )
        paras.append(Paragraph(f'★  {award_str}', S_AWARD))

    return paras


# ── Page layout ───────────────────────────────────────────────────────────────

W_PAGE, H_PAGE = A4
MARGIN         = 13 * mm
PHOTO_W        = 52 * mm
PHOTO_H        = 72 * mm
COL_GAP        = 5  * mm
INFO_W         = W_PAGE - 2 * MARGIN - PHOTO_W - COL_GAP


def _draw_page_bg(canvas, doc):
    canvas.saveState()
    # Full dark background
    canvas.setFillColor(C_PAGE_BG)
    canvas.rect(0, 0, W_PAGE, H_PAGE, fill=1, stroke=0)

    # Header bar
    canvas.setFillColor(colors.HexColor('#13131A'))
    canvas.rect(0, H_PAGE - 20*mm, W_PAGE, 20*mm, fill=1, stroke=0)

    # Red accent line
    canvas.setFillColor(C_ACCENT)
    canvas.rect(0, H_PAGE - 20*mm, W_PAGE, 0.6*mm, fill=1, stroke=0)

    # Title
    canvas.setFillColor(C_CREAM)
    canvas.setFont('Helvetica-Bold', 15)
    canvas.drawString(MARGIN, H_PAGE - 13*mm, doc._cavino_title)

    # Subtitle / date
    canvas.setFillColor(C_GOLD)
    canvas.setFont('Helvetica', 7.5)
    canvas.drawString(MARGIN, H_PAGE - 17.5*mm,
                      f'Carte des vins  ·  {date.today().strftime("%d %B %Y")}  ·  {doc._cavino_count} référence{"s" if doc._cavino_count > 1 else ""}')

    # Page number
    canvas.setFillColor(C_MUTED)
    canvas.setFont('Helvetica', 7)
    canvas.drawCentredString(W_PAGE / 2, 8*mm, f'— {doc.page} —')

    canvas.restoreState()


# ── Wine card flowable ────────────────────────────────────────────────────────

CARD_PAD   = 4  * mm
CARD_INNER = PHOTO_W + COL_GAP + INFO_W
CARD_TOTAL = CARD_INNER + 2 * CARD_PAD  # should match available frame width


class WineCard(Flowable):
    """Luxury wine card: photo left + info right, dark background."""

    def __init__(self, wine: dict, photo_img: PILImage.Image | None, card_w: float):
        super().__init__()
        self.wine      = wine
        self.photo_img = photo_img
        self.card_w    = card_w
        self.paras     = build_info_paragraphs(wine)
        self._h        = None

    def _info_height(self) -> float:
        available = INFO_W - 2 * mm
        total     = 0.0
        for p in self.paras:
            w, h = p.wrapOn(self.canv, available, 9999)
            total += h + 1.5*mm
        return total

    def wrap(self, aw, ah):
        info_h = self._info_height()
        card_h = max(PHOTO_H + 2 * CARD_PAD, info_h + 2 * CARD_PAD)
        self._h = card_h
        return self.card_w, card_h

    def draw(self):
        c   = self.canv
        w   = self.wine
        h   = self._h
        tc  = type_color(w.get('type'))

        # Card background
        c.saveState()
        c.setFillColor(C_CARD_BG)
        c.roundRect(0, 0, self.card_w, h, 3*mm, fill=1, stroke=0)

        # Left accent bar
        c.setFillColor(tc)
        c.roundRect(0, 0, 2.5*mm, h, 1.5*mm, fill=1, stroke=0)
        # Cover right half of rounded rect to get sharp right edge on bar
        c.setFillColor(tc)
        c.rect(1.5*mm, 0, 1*mm, h, fill=1, stroke=0)

        # Photo zone
        px = CARD_PAD + 2.5*mm
        py = (h - PHOTO_H) / 2        # vertically centred

        if self.photo_img:
            try:
                ir = pil_to_rl_image(self.photo_img, PHOTO_W - 2*mm, PHOTO_H)
                iw, ih = self.photo_img.size
                scale  = min((PHOTO_W - 2*mm) / iw, PHOTO_H / ih)
                dw, dh = iw * scale, ih * scale
                dx = px + ((PHOTO_W - 2*mm) - dw) / 2
                dy = py + (PHOTO_H - dh) / 2
                c.drawImage(ir, dx, dy, dw, dh, preserveAspectRatio=True, mask='auto')
            except Exception:
                self._draw_photo_placeholder(c, px, py)
        else:
            self._draw_photo_placeholder(c, px, py)

        # Info block — rendered from top of card
        ix = CARD_PAD + PHOTO_W + COL_GAP
        iy = h - CARD_PAD            # start at top, go down
        available_w = INFO_W - 2*mm

        for para in self.paras:
            pw, ph = para.wrapOn(c, available_w, 9999)
            iy -= ph
            para.drawOn(c, ix, iy)
            iy -= 1.5*mm

        c.restoreState()

    def _draw_photo_placeholder(self, c, px, py):
        c.setFillColor(colors.HexColor('#1C1C22'))
        c.roundRect(px, py, PHOTO_W - 2*mm, PHOTO_H, 2*mm, fill=1, stroke=0)
        c.setFillColor(C_MUTED)
        c.setFont('Helvetica', 22)
        c.drawCentredString(px + (PHOTO_W - 2*mm) / 2, py + PHOTO_H / 2 - 8, '?')


# ── Section header flowable ───────────────────────────────────────────────────

class SectionHeader(Flowable):
    """Type section header (e.g. ROUGE, BLANC…) with colored accent line."""

    def __init__(self, label: str, wine_type: str, width: float):
        super().__init__()
        self.label     = label
        self.tc        = type_color(wine_type)
        self.card_w    = width
        self.height    = 9*mm

    def wrap(self, aw, ah):
        return self.card_w, self.height

    def draw(self):
        c = self.canv
        c.saveState()

        # Background banner
        c.setFillColor(colors.HexColor('#13131A'))
        c.rect(0, 0, self.card_w, self.height, fill=1, stroke=0)

        # Bottom accent line
        c.setFillColor(self.tc)
        c.rect(0, 0, self.card_w, 0.7*mm, fill=1, stroke=0)

        # Label
        c.setFillColor(self.tc)
        c.setFont('Helvetica-Bold', 9)
        c.drawString(3*mm, 3.2*mm, self.label.upper())

        c.restoreStore = c.restoreState
        c.restoreState()


# ── Build PDF ─────────────────────────────────────────────────────────────────

def generate_pdf(wines_data: list[dict], output_path: str,
                 api_base: str, photos_dir: str | None, title: str):

    print(f'   Chargement des photos…')
    card_w   = W_PAGE - 2 * MARGIN
    story    = []
    count    = len(wines_data)

    # Group by type
    by_type  = defaultdict(list)
    for w in wines_data:
        t = (w.get('type') or 'autre').lower()
        by_type[t].append(w)

    TYPE_ORDER = ['rouge', 'blanc', 'rosé', 'rose', 'champagne', 'mousseux',
                  'pétillant', 'moelleux', 'fortifié', 'spiritueux', 'autre']
    seen_types = set()

    for wine_type in TYPE_ORDER + list(by_type.keys()):
        if wine_type in seen_types or wine_type not in by_type:
            continue
        seen_types.add(wine_type)
        wines_in_type = by_type[wine_type]

        label = wine_type.capitalize()
        story.append(Spacer(1, 3*mm))
        story.append(SectionHeader(label, wine_type, card_w))
        story.append(Spacer(1, 2*mm))

        for i, wine in enumerate(wines_in_type):
            name = wine.get('name') or '?'
            print(f'   [{wine_type}] {name}', end='', flush=True)
            photo_img = load_photo(wine.get('photo_url'), api_base, photos_dir)
            if photo_img:
                print(' 📷', end='')
            print()
            story.append(WineCard(wine, photo_img, card_w))
            story.append(Spacer(1, 2.5*mm))

    # Doc
    doc = BaseDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=23*mm,
        bottomMargin=14*mm,
        title=f'Carte des vins — {title}',
        author='Cavino',
        subject='Wine list',
    )
    doc._cavino_title = title
    doc._cavino_count = count

    frame = Frame(
        MARGIN, 14*mm,
        W_PAGE - 2*MARGIN, H_PAGE - 23*mm - 14*mm,
        leftPadding=0, rightPadding=0,
        topPadding=0, bottomPadding=0,
    )
    template = PageTemplate(id='main', frames=[frame], onPage=_draw_page_bg)
    doc.addPageTemplates([template])

    doc.build(story)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Génère la carte des vins Cavino en PDF luxe'
    )
    parser.add_argument('--output', '-o', default='carte_des_vins.pdf',
                        help='Fichier PDF de sortie (défaut: carte_des_vins.pdf)')
    parser.add_argument('--db', default=os.environ.get(
                            'DATABASE_URL',
                            'postgresql://cave:caveau2024@localhost:5432/cavemanager'),
                        help='URL PostgreSQL')
    parser.add_argument('--api', default=os.environ.get('API_BASE', 'http://localhost:3010'),
                        help="URL de base de l'API (pour les photos via HTTP)")
    parser.add_argument('--photos', default=None,
                        help='Dossier local des photos (accès direct au volume Docker)')
    parser.add_argument('--title', default='Ma Cave',
                        help='Nom de la cave affiché en en-tête')
    args = parser.parse_args()

    print()
    print('  🍷  Cavino — Carte des vins')
    print(f'       DB      : {args.db[:50]}')
    print(f'       API     : {args.api}')
    print(f'       Sortie  : {args.output}')
    print()

    try:
        wines_data = fetch_wines(args.db)
    except Exception as e:
        print(f'  ❌  Erreur connexion DB : {e}')
        print(f'       Vérifiez --db ou $DATABASE_URL')
        sys.exit(1)

    if not wines_data:
        print('  ⚠️   Aucun vin disponible dans la cave.')
        sys.exit(0)

    print(f'  ✅  {len(wines_data)} vin(s) trouvé(s)\n')

    try:
        generate_pdf(wines_data, args.output, args.api, args.photos, args.title)
    except Exception as e:
        import traceback
        print(f'\n  ❌  Erreur génération PDF : {e}')
        traceback.print_exc()
        sys.exit(1)

    print(f'\n  ✅  PDF généré : {args.output}')
    print()
