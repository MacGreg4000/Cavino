#!/usr/bin/env python3
"""
Cave Scan Service
Surveillance dossier → Ollama vision (qwen2.5vl:7b) → SearXNG photo → JSON + photo
Déploiement : Docker sur NAS Synology
"""
import os
import re
import sys
import json
import time
import base64
import logging
import unicodedata
import threading
from io import BytesIO
from pathlib import Path
from datetime import date
from typing import Optional

import requests
from PIL import Image, ImageOps
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIC_SUPPORTED = True
except ImportError:
    HEIC_SUPPORTED = False

# ─── Configuration ───────────────────────────────────────────────────────────────

OLLAMA_URL   = os.getenv('OLLAMA_URL',   'http://macciolupo.tplinkdns.com:11434')
OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'qwen2.5vl:7b')
SEARXNG_URL  = os.getenv('SEARXNG_URL',  'http://macciolupo.tplinkdns.com:8888')
CAVE_BASE    = Path(os.getenv('CAVE_BASE_DIR', '/data/cave'))
SETTLE       = float(os.getenv('SETTLE_DELAY', '3.0'))

SOURCE   = CAVE_BASE / 'A analyser'
DEST     = CAVE_BASE / 'Prêt à être importé'
REF      = CAVE_BASE / 'importé'
ERRORS   = CAVE_BASE / 'Erreurs'
TEMP     = Path('/tmp/cave_previews')   # local to container — never on a volume
PROGRESS = CAVE_BASE / '.progress'

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.bmp'}
PHOTO_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
MIN_PHOTO_SIZE   = 10 * 1024  # 10 KB

# ─── Base de connaissance vin ────────────────────────────────────────────────────

WINE_KNOWLEDGE = """
═══ RÉFÉRENTIEL ŒNOLOGIQUE (à utiliser pour valider chaque champ avant de répondre) ═══

── CÉPAGES PAR APPELLATION (ne jamais utiliser un cépage hors liste pour l'appellation identifiée) ──
Valpolicella / Amarone / Ripasso / Recioto :
  Obligatoires : Corvina Veronese (45-95%), Corvinone (max 50% en substitution Corvina), Rondinella (5-30%)
  Optionnels : Molinara, Oseleta, Negrara, Dindarella — JAMAIS Nebbiolo, Sangiovese, Barbera

Barolo / Barbaresco / Langhe Nebbiolo / Gattinara : Nebbiolo uniquement

Chianti / Chianti Classico / Morellino di Scansano : Sangiovese (min 70%), Canaiolo, Colorino, Merlot, Cab. Sauv.
Brunello di Montalcino : Sangiovese Grosso (Brunello) 100%
Vino Nobile di Montepulciano : Prugnolo Gentile (Sangiovese), Canaiolo
Montepulciano d'Abruzzo : Montepulciano (≠ Vino Nobile !)

Bordeaux rouge : Cabernet Sauvignon, Merlot, Cabernet Franc, Petit Verdot, Malbec
Bordeaux blanc sec : Sauvignon Blanc, Sémillon, Muscadelle
Bordeaux liquoreux (Sauternes/Barsac) : Sémillon, Sauvignon Blanc, Muscadelle

Bourgogne rouge : Pinot Noir uniquement (sauf Beaujolais = Gamay)
Bourgogne blanc : Chardonnay uniquement
Beaujolais : Gamay uniquement

Champagne / Crémant de Bourgogne : Chardonnay, Pinot Noir, Meunier (Pinot Meunier)
Crémant d'Alsace : Pinot Blanc, Auxerrois, Pinot Gris, Pinot Noir, Riesling, Chardonnay
Crémant de Loire : Chenin Blanc, Cabernet Franc, Chardonnay, Pinot Noir

Alsace : Riesling, Gewurztraminer, Pinot Gris, Muscat, Pinot Blanc, Sylvaner, Auxerrois, Pinot Noir
Loire rouge : Cabernet Franc (Chinon, Bourgueil, Saumur-Champigny), Gamay (Touraine)
Loire blanc : Chenin Blanc (Vouvray, Savennières, Anjou), Sauvignon Blanc (Sancerre, Pouilly-Fumé, Quincy)
  Muscadet : Melon de Bourgogne uniquement

Rhône Nord rouge : Syrah uniquement (Hermitage, Côte-Rôtie, Cornas, Saint-Joseph, Crozes-Hermitage)
Rhône Nord blanc : Viognier (Condrieu), Marsanne, Roussanne
Rhône Sud rouge : Grenache, Syrah, Mourvèdre, Cinsault, Counoise (Châteauneuf-du-Pape, Gigondas, Vacqueyras)
Rhône Sud blanc : Grenache Blanc, Clairette, Roussanne, Marsanne, Bourboulenc

Rioja / Ribera del Duero : Tempranillo (Tinta Fina), Garnacha, Graciano, Mazuelo (Carignan)
Priorat : Garnacha, Cariñena (Mazuelo), Cabernet Sauvignon, Syrah, Merlot

Douro / Porto rouge : Touriga Nacional, Touriga Franca, Tinta Roriz (Tempranillo), Tinta Barroca, Tinto Cão
Vinho Verde blanc : Alvarinho (Albariño), Loureiro, Arinto, Trajadura

Allemagne Riesling : Riesling uniquement (toutes régions sauf exceptions Spätburgunder = Pinot Noir)
Autriche : Grüner Veltliner, Riesling, Blaufränkisch, Zweigelt, Saint-Laurent

Provence rosé : Grenache, Cinsault, Mourvèdre, Syrah, Carignan, Rolle (Vermentino)
Bandol rouge : Mourvèdre (min 50%), Grenache, Cinsault
Cahors : Malbec (Côt, min 70%), Merlot, Tannat
Madiran : Tannat (min 40%), Cabernet Franc, Cabernet Sauvignon

── SERVICE (températures de service indicatives) ──
Champagne / Crémant / Pétillant : 6-8°C
Blanc léger et sec (Muscadet, Alsace Pinot Blanc, Vinho Verde) : 8-10°C
Rosé léger : 8-10°C
Blanc aromatique (Sauvignon Blanc, Riesling sec, Gewurztraminer) : 9-11°C
Blanc charpenté (Chardonnay boisé, Bourgogne blanc, Viognier) : 10-13°C
Blanc liquoreux / moelleux : 8-12°C
Rouge léger (Beaujolais, Pinot Noir d'Alsace, Loire léger) : 13-15°C
Rouge moyen (Bourgogne rouge, Loire rouge, Rioja Crianza) : 15-17°C
Rouge puissant (Bordeaux, Rhône, Barolo, Amarone, Cahors) : 16-18°C
Porto tawny / vieux : 14-16°C | Porto ruby / vintage : 16-18°C
Vins doux naturels (Banyuls, Maury) : 14-16°C

── DÉCANTATION (decantingTime TOUJOURS en MINUTES) ──
Obligatoire : Amarone (120-180 min), Barolo/Barbaresco (120-240 min), Brunello (120-180 min),
              Hermitage/Cornas (90-120 min), Cahors puissant (90-120 min), Madiran (60-90 min)
Recommandée : Bordeaux rouge puissant (60-120 min), Côte-Rôtie (60-90 min),
              Châteauneuf-du-Pape (45-60 min), Bandol (60-90 min), Priorat (60 min), Ribera del Duero (45-60 min)
Courte : Bourgogne rouge de garde (30-45 min), Rioja Reserva (30-45 min), Douro rouge (30 min)
Déconseillée : Vieux Pinot Noir (> 15 ans), Vieux Bordeaux (> 20 ans), Champagne, Blanc
IMPORTANT : decantingTime est en MINUTES (ex: 2h = 120, 90 min = 90). Jamais en heures.

── CLASSIFICATIONS ──
Italie : DOCG (plus haute) > DOC > IGT > Vino da Tavola
France : AOC/AOP > IGP/VDP > Vin de France | Grand Cru > Premier Cru > Village > Régional
Espagne : DOCa (Rioja, Priorat) > DO > IGP > Vino | Gran Reserva > Reserva > Crianza > Joven
Portugal : DOC > IPR > Vinho Regional > Vinho
Allemagne : Prädikatswein (Kabinett < Spätlese < Auslese < BA < TBA < Eiswein) > QbA > Landwein
Autriche : DAC > Qualitätswein > Landwein

── ACCORDS METS-VINS (exemples de précision attendue) ──
BON : "côte de bœuf sauce bordelaise", "risotto aux truffes noires", "homard à l'américaine"
TROP VAGUE : "viande rouge", "poisson", "fromage" (toujours préciser la préparation et la sauce)

RÈGLE CRITIQUE CHAMPAGNE — les accords champagne sont TRÈS DIFFÉRENTS des vins rouges :
NE JAMAIS mettre "côte de bœuf" ou "gibier" dans les accords d'un champagne.
Champagne Blanc de Blancs (Chardonnay) : huîtres, langoustines, sushi, carpaccio de Saint-Jacques, tartare de daurade
Champagne Blanc de Noirs (Pinot Noir dominant) : charcuterie fine, volaille en sauce crémeuse, champignons truffés, foie gras mi-cuit
Champagne Brut NV assemblage : apéritif, verrines, blinis au saumon, fromages frais, fruits de mer
Champagne millésimé : homard à la bisque, pigeon en croûte, ris de veau, fromages affinés

── GRANDS CRUS vs PREMIERS CRUS CHAMPAGNE ──
Villages GRAND CRU (100%) : Ambonnay, Aÿ, Beaumont-sur-Vesle, Bouzy, Chouilly, Cramant, Le Mesnil-sur-Oger,
  Louvois, Mailly-Champagne, Oger, Oiry, Puisieulx, Sillery, Tours-sur-Marne, Verzenay, Verzy
Villages PREMIER CRU (90-99%) : tous les autres villages classés
→ Si l'étiquette dit "GRAND CRU" ou si le village est dans la liste → classification = "Grand Cru"

── STRUCTURE DES MENTIONS (identity.mentions) ──
Ne JAMAIS répéter le nom du domaine, du producteur, de la cuvée ou de l'appellation (déjà dans d'autres champs).
Utiliser UNIQUEMENT pour : Bio/Biodynamie, Agriculture raisonnée, Vieilles Vignes, Vendanges tardives,
  Sélection de grains nobles, mentions de terroir (Lieu-dit, Climat, MGA), élevage notable (fût de chêne neuf, etc.)
Si aucune mention spéciale visible sur l'étiquette → []

── ACCORDS (pairings) ──
- pairings.ideal DOIT contenir AU MINIMUM 6 accords spécifiques et distincts
- pairings.good DOIT contenir AU MINIMUM 5 accords
- pairings.avoid DOIT contenir AU MINIMUM 4 incompatibilités
- Chaque accord doit inclure la préparation/sauce (ex: "gigot d'agneau au romarin", pas "agneau")
- Exemples pour un Amarone : "osso-buco à la gremolata", "côte de bœuf sauce bordelaise",
  "risotto au radicchio et speck", "gibier à plumes rôti aux baies de genièvre",
  "fromage Valpolicella Monteveronese affiné", "chocolate noir 70% aux noisettes"

═══════════════════════════════════════════════════════════════════════════════════════
"""

# ─── Logging ─────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)-8s %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
    stream=sys.stdout,
)
log = logging.getLogger('cave-scan')

# ─── Photo grouping ───────────────────────────────────────────────────────────────

def group_photos(files: list[Path]) -> list[list[Path]]:
    """Group recto/verso pairs. Returns list of groups (1 or 2 photos each)."""
    files = sorted(files)
    used: set[Path] = set()
    groups: list[list[Path]] = []

    suffix_pairs = [
        ('_1', '_2'), ('_a', '_b'), ('_front', '_back'), ('_recto', '_verso'),
    ]

    for f in files:
        if f in used:
            continue

        stem = f.stem
        matched = False

        # Priority 1: explicit suffixes
        for s1, s2 in suffix_pairs:
            if stem.endswith(s1):
                prefix = stem[:-len(s1)]
                partner = next(
                    (x for x in files if x.stem == prefix + s2 and x not in used), None
                )
                if partner:
                    groups.append([f, partner])
                    used.update([f, partner])
                    matched = True
                    break

        if matched:
            continue

        # Priority 2: consecutive numbers (preserve zero-padding: IMG_0272 → IMG_0273)
        m = re.match(r'^(.*?)(\d+)$', stem)
        if m:
            prefix, num_str = m.group(1), m.group(2)
            num = int(num_str)
            next_num = str(num + 1).zfill(len(num_str))  # conserve le padding
            next_stem = f'{prefix}{next_num}'
            partner = next(
                (x for x in files if x.stem == next_stem and x not in used), None
            )
            if partner:
                groups.append([f, partner])
                used.update([f, partner])
                continue

        # Solo
        if f not in used:
            groups.append([f])
            used.add(f)

    return groups

# ─── Filename generation ──────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    """Lowercase, remove accents, replace special chars with hyphens."""
    if not text:
        return 'inconnu'
    nfkd = unicodedata.normalize('NFKD', text)
    ascii_text = ''.join(c for c in nfkd if not unicodedata.combining(c))
    ascii_text = ascii_text.lower()
    ascii_text = re.sub(r'[^a-z0-9]+', '-', ascii_text)
    ascii_text = re.sub(r'-+', '-', ascii_text)
    return ascii_text.strip('-')


# ─── Appellation → cépages autorisés ─────────────────────────────────────────────
#
# Table de validation post-IA : si Ollama invente un cépage pour une appellation
# connue, on le filtre. Les clés sont des fragments d'appellation (en minuscules,
# sans accents) que l'on cherche dans `identity.appellation`. Première correspondance
# utilisée. Appellations inconnues → aucune validation (laisse passer).
#
# Listes volontairement permissives (cépages principaux + substituts réguliers) ;
# on vise à éliminer les hallucinations évidentes (Merlot dans Barolo), pas à faire
# du contrôle INAO strict.
APPELLATION_GRAPES: dict[str, set[str]] = {
    # Italie — Vénétie
    'valpolicella':  {'corvina', 'corvinone', 'rondinella', 'molinara', 'oseleta', 'negrara', 'dindarella'},
    'amarone':       {'corvina', 'corvinone', 'rondinella', 'molinara', 'oseleta', 'negrara', 'dindarella'},
    'ripasso':       {'corvina', 'corvinone', 'rondinella', 'molinara', 'oseleta'},
    'recioto':       {'corvina', 'corvinone', 'rondinella', 'molinara'},
    'soave':         {'garganega', 'trebbiano di soave', 'chardonnay', 'pinot bianco'},
    'prosecco':      {'glera', 'chardonnay', 'pinot bianco', 'pinot grigio', 'pinot noir'},
    # Italie — Piémont
    'barolo':        {'nebbiolo'},
    'barbaresco':    {'nebbiolo'},
    'gattinara':     {'nebbiolo'},
    'langhe nebbiolo': {'nebbiolo'},
    'barbera':       {'barbera'},
    'dolcetto':      {'dolcetto'},
    # Italie — Toscane
    'chianti':       {'sangiovese', 'canaiolo', 'colorino', 'merlot', 'cabernet sauvignon', 'cabernet franc', 'syrah'},
    'brunello':      {'sangiovese'},  # Sangiovese Grosso
    'vino nobile':   {'sangiovese', 'canaiolo'},  # Prugnolo Gentile = Sangiovese
    'morellino':     {'sangiovese', 'canaiolo', 'merlot', 'cabernet sauvignon', 'syrah'},
    # Italie — Abruzzes / Sicile
    "montepulciano d'abruzzo": {'montepulciano'},
    'nero d':        {'nero d\'avola'},  # Nero d'Avola
    'etna':          {'nerello mascalese', 'nerello cappuccio', 'carricante', 'catarratto'},
    # France — Bordeaux
    'bordeaux':      {'cabernet sauvignon', 'merlot', 'cabernet franc', 'petit verdot', 'malbec', 'semillon', 'sauvignon blanc', 'muscadelle'},
    'medoc':         {'cabernet sauvignon', 'merlot', 'cabernet franc', 'petit verdot', 'malbec'},
    'saint-emilion': {'merlot', 'cabernet franc', 'cabernet sauvignon', 'malbec'},
    'pomerol':       {'merlot', 'cabernet franc', 'cabernet sauvignon'},
    'sauternes':     {'semillon', 'sauvignon blanc', 'muscadelle'},
    'barsac':        {'semillon', 'sauvignon blanc', 'muscadelle'},
    # France — Bourgogne
    'bourgogne':     {'pinot noir', 'chardonnay', 'aligote', 'gamay'},
    'chablis':       {'chardonnay'},
    'meursault':     {'chardonnay'},
    'pouilly-fuisse': {'chardonnay'},
    'gevrey':        {'pinot noir'},
    'vosne':         {'pinot noir'},
    'beaujolais':    {'gamay'},
    # France — Vallée du Rhône
    'cote-rotie':    {'syrah', 'viognier'},
    'condrieu':      {'viognier'},
    'hermitage':     {'syrah', 'marsanne', 'roussanne'},
    'crozes-hermitage': {'syrah', 'marsanne', 'roussanne'},
    'chateauneuf':   {'grenache', 'syrah', 'mourvedre', 'cinsault', 'counoise', 'clairette', 'bourboulenc', 'roussanne', 'picpoul', 'terret noir', 'muscardin', 'vaccarese', 'picardan'},
    'gigondas':      {'grenache', 'syrah', 'mourvedre', 'cinsault'},
    'cotes du rhone': {'grenache', 'syrah', 'mourvedre', 'cinsault', 'carignan', 'counoise'},
    # France — Loire
    'sancerre':      {'sauvignon blanc', 'pinot noir'},
    'pouilly-fume':  {'sauvignon blanc'},
    'vouvray':       {'chenin blanc'},
    'muscadet':      {'melon de bourgogne'},
    'chinon':        {'cabernet franc', 'cabernet sauvignon'},
    'bourgueil':     {'cabernet franc'},
    'saumur':        {'cabernet franc', 'chenin blanc'},
    # France — Alsace
    'alsace':        {'riesling', 'gewurztraminer', 'pinot gris', 'muscat', 'pinot blanc', 'sylvaner', 'auxerrois', 'pinot noir', 'chardonnay'},
    # France — Champagne
    'champagne':     {'chardonnay', 'pinot noir', 'meunier', 'pinot meunier'},
    'cremant':       {'chardonnay', 'pinot noir', 'meunier', 'pinot meunier', 'chenin blanc', 'cabernet franc', 'pinot blanc', 'auxerrois', 'pinot gris', 'riesling'},
    # France — Sud-Ouest
    'cahors':        {'malbec', 'merlot', 'tannat'},
    'madiran':       {'tannat', 'cabernet sauvignon', 'cabernet franc', 'fer servadou'},
    'jurancon':      {'petit manseng', 'gros manseng', 'courbu'},
    # Espagne
    'rioja':         {'tempranillo', 'garnacha', 'graciano', 'mazuelo', 'maturana', 'viura', 'malvasia'},
    'ribera del duero': {'tempranillo', 'cabernet sauvignon', 'merlot', 'malbec', 'garnacha'},
    'priorat':       {'garnacha', 'cariñena', 'carignan', 'cabernet sauvignon', 'merlot', 'syrah'},
    'rias baixas':   {'albariño', 'albarino'},
    'cava':          {'macabeo', 'xarel-lo', 'parellada', 'chardonnay', 'pinot noir'},
    # Portugal
    'douro':         {'touriga nacional', 'touriga franca', 'tinta roriz', 'tempranillo', 'tinta barroca', 'tinto cao'},
    'porto':         {'touriga nacional', 'touriga franca', 'tinta roriz', 'tinta barroca', 'tinto cao', 'sousao'},
    'vinho verde':   {'alvarinho', 'loureiro', 'arinto', 'trajadura', 'avesso'},
}

# Caractères à aplanir pour comparer les cépages (éviter casse, accents, ponctuation parasite)
_GRAPE_FLATTEN_RE = re.compile(r'[^a-z\s]')


def _flatten_grape(g: str) -> str:
    nfkd = unicodedata.normalize('NFKD', g or '')
    ascii_g = ''.join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()
    ascii_g = _GRAPE_FLATTEN_RE.sub('', ascii_g)
    return re.sub(r'\s+', ' ', ascii_g).strip()


def filter_illegal_grapes(appellation: str | None, grapes: list[str]) -> tuple[list[str], list[str]]:
    """
    Retourne (grapes_conservés, grapes_rejetés). Si l'appellation n'est pas dans la
    table, rien n'est filtré. Si la liste de cépages extraite par Ollama contient
    un cépage interdit pour l'appellation (ex: Merlot pour Barolo), il est rejeté.
    """
    if not appellation or not grapes:
        return list(grapes or []), []
    app_flat = _flatten_grape(appellation)
    # Cherche la première clé qui apparaît dans l'appellation
    allowed: set[str] | None = None
    for key, allowed_set in APPELLATION_GRAPES.items():
        if _flatten_grape(key) in app_flat:
            allowed = {_flatten_grape(x) for x in allowed_set}
            break
    if allowed is None:
        return list(grapes), []
    kept: list[str] = []
    rejected: list[str] = []
    for g in grapes:
        if not g:
            continue
        gf = _flatten_grape(g)
        # Match si le cépage est contenu dans un cépage autorisé ou inverse
        # (ex: "nebbiolo" match "nebbiolo" ; "cabernet" seul → kept si "cabernet sauvignon"
        # est autorisé, car le modèle abrège parfois)
        ok = any(gf == a or gf in a or a in gf for a in allowed)
        if ok:
            kept.append(g)
        else:
            rejected.append(g)
    return kept, rejected


def make_basename(wine: dict, today: str, suffix: str = '') -> str:
    """Generate YYYY-MM-DD_domain-name-vintage basename."""
    identity = wine.get('identity', {})
    domain  = identity.get('domain') or ''
    name    = identity.get('name') or ''
    vintage = identity.get('vintage')
    nv      = identity.get('nonVintage', False)

    parts: list[str] = []
    if domain:
        parts.append(slugify(domain))
    # Avoid repeating if name == domain
    if name and slugify(name) != slugify(domain):
        parts.append(slugify(name))

    if nv:
        parts.append('nv')
    elif vintage:
        parts.append(str(vintage))

    base = today + '_' + '-'.join(filter(None, parts))
    base = re.sub(r'-+', '-', base)
    return base + suffix

# ─── Image handling ───────────────────────────────────────────────────────────────

# Taille minimale du grand côté avant upscale (pixels)
UPSCALE_MIN_LONG_EDGE = 1600

def convert_to_jpeg(src: Path, upscale: bool = True) -> Optional[Path]:
    """Convert any image (incl. HEIC) to JPEG in TEMP dir, with optional upscale.
    Upscale si le grand côté est < UPSCALE_MIN_LONG_EDGE px (améliore la lecture OCR).
    """
    TEMP.mkdir(parents=True, exist_ok=True)
    dest = TEMP / (src.stem + '_preview.jpg')
    try:
        img = Image.open(src)
        # Respecte l'orientation EXIF (photos iPhone/Android souvent pivotées en métadonnées)
        img = ImageOps.exif_transpose(img)
        if img.mode in ('RGBA', 'P', 'LA'):
            img = img.convert('RGB')

        if upscale:
            w, h = img.size
            long_edge = max(w, h)
            if long_edge < UPSCALE_MIN_LONG_EDGE:
                scale = UPSCALE_MIN_LONG_EDGE / long_edge
                new_w = int(w * scale)
                new_h = int(h * scale)
                img = img.resize((new_w, new_h), Image.LANCZOS)
                log.info(f"Upscale {src.name}: {w}×{h} → {new_w}×{new_h} (×{scale:.2f})")

        img.save(dest, 'JPEG', quality=92)
        return dest
    except Exception as e:
        log.error(f"Conversion JPEG échouée pour {src.name}: {e}")
        return None


def image_to_base64(path: Path) -> str:
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


def merge_images_side_by_side(paths: list[Path], max_height: int = 1600) -> Path:
    """Fusionne plusieurs images côte à côte en un seul JPEG temporaire.

    Utile pour contourner les bugs des modèles de vision qui échouent avec
    plusieurs images en entrée (ex: qwen3-vl:8b mode thinking avec 2 images).
    Retourne le chemin du fichier temporaire créé dans /tmp.
    """
    images = []
    for p in paths:
        try:
            img = Image.open(p).convert('RGB')
            images.append(img)
        except Exception as e:
            log.warning(f"Impossible d'ouvrir {p.name} pour la fusion: {e}")

    if not images:
        raise ValueError("Aucune image valide pour la fusion")

    # Redimensionner toutes les images à la même hauteur (max_height)
    resized = []
    for img in images:
        w, h = img.size
        if h > max_height:
            ratio = max_height / h
            img = img.resize((int(w * ratio), max_height), Image.LANCZOS)
        resized.append(img)

    # Calculer les dimensions de l'image fusionnée
    total_width = sum(img.width for img in resized)
    max_h = max(img.height for img in resized)

    merged = Image.new('RGB', (total_width, max_h), (20, 20, 20))
    x_offset = 0
    for img in resized:
        # Centrer verticalement si hauteurs différentes
        y_offset = (max_h - img.height) // 2
        merged.paste(img, (x_offset, y_offset))
        x_offset += img.width

    out_path = Path('/tmp') / f"merged_{paths[0].stem}.jpg"
    merged.save(out_path, 'JPEG', quality=90)
    log.info(f"Images fusionnées → {out_path.name} ({total_width}×{max_h}px)")
    return out_path


# ─── URL hint scraping ───────────────────────────────────────────────────────────

def extract_url_from_hint(hint: str) -> Optional[str]:
    """Extrait la première URL http(s) trouvée dans le texte du hint."""
    if not hint:
        return None
    m = re.search(r'https?://[^\s\'"<>\]\[]+', hint)
    return m.group(0) if m else None


def searxng_search_wine_context(query: str) -> tuple[Optional[str], Optional[str]]:
    """Recherche proactive SearXNG avant l'appel Ollama pour enrichir le contexte.

    Utilisée quand le hint contient du texte mais pas d'URL : on cherche le vin
    sur Vivino/Wine-Searcher, on scrape la page, et on passe le texte à Ollama.
    Cela permet de corriger des erreurs de type (rouge vs blanc) ou de nom
    (Befira vs Zefiro) avant même que le modèle voie les images.

    Retourne (web_context, page_url) ou (None, None) si rien de pertinent.
    """
    trusted_domains = [
        'vivino.com', 'wine-searcher.com', 'vinatis.com',
        'idealwine.com', 'idealwine.net', 'millesima.fr',
    ]
    # Deux requêtes : d'abord ciblée Vivino, puis générale vin
    queries = [
        f"{query} site:vivino.com",
        f"{query} vin blanc rouge rosé",
    ]
    for q in queries:
        log.info(f"Pré-analyse SearXNG: «{q}»")
        try:
            resp = requests.get(
                f"{SEARXNG_URL}/search",
                params={'q': q, 'format': 'json', 'language': 'fr'},
                timeout=10,
            )
            resp.raise_for_status()
            results = resp.json().get('results', [])
        except Exception as e:
            log.warning(f"SearXNG pré-analyse erreur: {e}")
            continue

        for result in results[:5]:
            page_url = result.get('url', '')
            if not page_url:
                continue
            if not any(d in page_url for d in trusted_domains):
                continue
            context = scrape_wine_text(page_url)
            if context:
                log.info(f"Contexte web pré-Ollama trouvé: {page_url} ({len(context)} chars)")
                return context, page_url

    return None, None


def scrape_wine_text(url: str, max_chars: int = 3000) -> Optional[str]:
    """Charge une page web (Vivino, Wine-Searcher, domaine…) et extrait le texte brut pertinent.
    Retourne None si la page est inaccessible ou trop courte pour être utile.
    """
    try:
        resp = requests.get(url, headers=WEB_HEADERS, timeout=15)
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        log.warning(f"URL hint inaccessible ({url}): {e}")
        return None

    # Supprimer les balises script / style avant de stripper le HTML
    html_clean = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', html_clean)
    text = re.sub(r'\s+', ' ', text).strip()

    if len(text) < 100:
        return None

    if len(text) > max_chars:
        text = text[:max_chars] + '…'

    return text


# ─── Ollama prompt ────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """{knowledge}

Tu es un expert en vins et spiritueux. Analyse les étiquettes dans les images fournies.
Retourne UNIQUEMENT un objet JSON valide, sans markdown, sans bloc de code, sans explication.
Date du jour : {today}

CONTEXTE PHOTOS : {photo_context}

RÈGLE ABSOLUE ANTI-HALLUCINATION :
- N'invente JAMAIS une donnée absente de l'étiquette. Si une information n'est pas lisible ou pas présente → null ou [].
- RÈGLE CRITIQUE SUR LE NOM : Lis le texte EXACTEMENT tel qu'il est imprimé, caractère par caractère. Si tu n'es pas sûr d'un mot, indique le doute dans meta.notes et mets confidence = "low". NE JAMAIS inventer ou deviner un nom de cuvée, domaine ou appellation.
- Si l'étiquette est illisible ou trop floue pour identifier le vin avec certitude → mets le texte le plus proche possible de ce que tu vois et confidence = "low".
- "domain" = nom du domaine/château/producteur (ex: "Villa Canestrari"), PAS l'appellation.
- "appellation" = l'appellation officielle (ex: "Amarone della Valpolicella DOCG").
- "awards" = [] si aucune médaille n'est visible sur l'étiquette. NE PAS inventer de médailles.
- "purchase.purchasePrice" = null si le prix n'est pas sur l'étiquette. NE PAS inventer de prix.
- "purchase.estimatedValue" = prix réel du marché basé sur ta connaissance de Vivino, Wine-Searcher, Vinatis, Millesima, iDealwine pour ce vin ET ce millésime précis. Donne un prix réaliste en euros. Si tu n'as pas de données fiables pour ce vin → null. NE JAMAIS inventer un prix arbitraire.
- "purchase.source" = null si la source d'achat n'est pas connue. NE PAS inventer "Wine Merchant".
- "classification" = la mention légale exacte visible (DOC, DOCG, AOC, AOP...), null si absente.
- "village" = null si non mentionné (jamais "N/A").
- "vintage" = LIRE ATTENTIVEMENT l'année sur l'étiquette ou la capsule. C'est souvent un nombre à 4 chiffres récent (ex: 2021, 2018).
  ATTENTION : les étiquettes affichent souvent l'ANNÉE DE FONDATION du domaine (ex: "fondé en 1955", "depuis 1888", "est. 1743").
  Cette année de fondation N'EST PAS le millésime. Le millésime = l'année de la récolte du raisin.
  Si le seul chiffre visible est manifestement une année de fondation (avant 2000 pour un vin non millésimé courant) → vintage = null + nonVintage = true.
  Pour les champagnes et crémants sans année de récolte explicite → vintage = null + nonVintage = true.
- "grapes" = uniquement les cépages réels de l'appellation ou visibles sur l'étiquette. Ne pas inventer.
- Tous les textes SANS EXCEPTION doivent être rédigés en FRANÇAIS : description, accords, arômes, notes, agingNotes, style, occasions, glassType.
- country, region, subRegion : utiliser les noms français (Italie pas Italy, Vénétie pas Veneto, Espagne pas Spain).
- subRegion : toujours renseigner si connue (ex: Valpolicella pour un Amarone, Montagne de Reims pour Verzenay).
- "type" : OBLIGATOIREMENT l'une de ces valeurs EN FRANÇAIS : rouge, blanc, rosé, champagne, crémant, moelleux, liquoreux, effervescent. JAMAIS "red", "white", "rose", "sparkling" ou toute autre valeur en anglais.
- "name" (et "domain") : écrire en casse mixte normale (Majuscule initiale), JAMAIS EN MAJUSCULES COMPLÈTES sauf si l'étiquette l'exige.

SCHÉMA OBLIGATOIRE — tous les champs sont requis, champs inconnus → null, JAMAIS inventés :

{{
  "schemaVersion": "1.0",
  "identity": {{
    "name": "string — NOM DE LA CUVÉE (ex: Phanos, Grande Réserve...)",
    "domain": "string — NOM DU DOMAINE/CHÂTEAU/PRODUCTEUR (ex: Villa Canestrari, Château Margaux)",
    "appellation": "string — APPELLATION OFFICIELLE avec mention légale (ex: Amarone della Valpolicella DOCG)",
    "vintage": integer_ou_null,
    "nonVintage": boolean,
    "type": "rouge|blanc|rosé|champagne|crémant|moelleux|liquoreux|effervescent",
    "grapes": ["string"],
    "country": "string",
    "region": "string",
    "subRegion": "string_ou_null",
    "village": "string_ou_null",
    "classification": "string_ou_null",
    "mentions": ["string"],
    "alcohol": number_ou_null,
    "producer": "string",
    "bottleSize": 37|75|150|300|600
  }},
  "service": {{
    "servingTempMin": integer,
    "servingTempMax": integer,
    "decanting": boolean,
    "decantingTime": integer_ou_null,
    "glassType": "string"
  }},
  "aging": {{
    "drinkFrom": integer_ou_null,
    "drinkUntil": integer_ou_null,
    "peakFrom": integer_ou_null,
    "peakUntil": integer_ou_null,
    "currentPhase": "trop jeune|jeune|optimal|apogée|déclin|passé",
    "agingNotes": "string"
  }},
  "analysis": {{
    "description": "string",
    "vintageNotes": "string_ou_null",
    "aromaProfile": {{"primary": ["string"], "secondary": ["string"], "tertiary": ["string"]}},
    "palate": "TOUJOURS une chaîne de caractères, JAMAIS un objet ou dict",
    "style": "string"
  }},
  "pairings": {{
    "ideal": ["minimum 6 accords TRÈS PRÉCIS ex: côte de bœuf sauce bordelaise, pas viande rouge"],
    "good": ["minimum 5 accords"],
    "avoid": ["minimum 4 incompatibilités"],
    "occasions": ["string"],
    "cheese": ["string"]
  }},
  "purchase": {{
    "purchasePrice": number_ou_null,
    "estimatedValue": number_ou_null,
    "source": "string_ou_null",
    "bottleSize": 37|75|150|300|600
  }},
  "awards": [{{"label": "string", "score": "string_ou_null", "year": integer_ou_null}}],
  "meta": {{
    "scanDate": "{today}",
    "confidence": "high|medium|low",
    "notes": "string_ou_null",
    "photoQuality": "excellent|good|fair|poor",
    "importStatus": "pending",
    "photoFilename": "string_sans_extension"
  }}
}}

RÈGLES CRITIQUES :
- schemaVersion = "1.0" (toujours présent, jamais absent)
- identity.domain = NOM DU DOMAINE/PRODUCTEUR, jamais l'appellation
- identity.bottleSize DOIT être égal à purchase.bottleSize (même entier exact)
- analysis.palate est TOUJOURS une STRING, jamais un objet/dict
- service.decantingTime = null si et seulement si decanting = false
- Tous les tableaux vides = [] jamais null (awards = [] si aucune médaille visible)
- meta.importStatus = "pending" (toujours, sans exception)
- meta.photoFilename = nom de base sans extension (à laisser vide "")
- village = null si non mentionné sur l'étiquette (jamais "N/A")
- purchase.purchasePrice = null si absent de l'étiquette (ne jamais inventer)
- Les accords (pairings) doivent être très précis : "côte de bœuf sauce bordelaise" pas "viande rouge"
- pairings.ideal doit contenir AU MOINS 6 accords distincts et précis

CHAMPAGNES et CRÉMANTS — enrichissements obligatoires dans identity.mentions :
- Statut producteur (NM, RM, CM, RC, MA)
- Style (Blanc de Blancs, Blanc de Noirs, Assemblage, Rosé de saignée, Millésimé, NV)
- Dosage exact : Brut Nature (0-3 g/L), Extra Brut, Brut, Extra Sec, Sec, Demi-Sec, Doux
- Cépages champenois avec rôles (Chardonnay, Pinot Noir, Meunier)
- Pour les NV : vintage = null ET nonVintage = true

Retourne UNIQUEMENT le JSON, rien d'autre."""


def analyze_with_ollama(jpeg_paths: list[Path], hint: Optional[str] = None, web_context: Optional[str] = None, web_url: Optional[str] = None) -> Optional[dict]:
    """Send images to Ollama vision model, return parsed wine dict or None."""
    today = date.today().isoformat()

    # Contexte adaptatif selon le nombre de photos.
    # Quand il y en a 2+, elles sont FUSIONNÉES horizontalement en UNE image :
    # on l'explicite au modèle pour qu'il sache où regarder pour quelle info.
    if len(jpeg_paths) == 1:
        photo_context = (
            "Une seule photo de la bouteille est fournie. "
            "Analyse l'étiquette visible (recto ou verso) et déduis les informations manquantes "
            "grâce à ta connaissance du vin. Les informations non visibles → null."
        )
    else:
        photo_context = (
            f"L'image fournie est en réalité une FUSION HORIZONTALE de {len(jpeg_paths)} photos de la MÊME bouteille, "
            "assemblées côte à côte (PAS plusieurs bouteilles).\n"
            "  • MOITIÉ GAUCHE de l'image = RECTO (étiquette frontale) — nom du vin, domaine/château, "
            "appellation, millésime, classification.\n"
            "  • MOITIÉ DROITE de l'image = VERSO (contre-étiquette) — degré d'alcool, cépages, "
            "producteur, mentions légales, éventuelles recommandations d'accords ou de service.\n"
            "RÈGLE : combine les informations des DEUX moitiés dans UNE SEULE fiche JSON. "
            "Ne crée JAMAIS deux bouteilles distinctes même si les étiquettes se ressemblent peu. "
            "Si une information apparaît sur les deux moitiés, privilégie la plus lisible."
        )

    prompt = SYSTEM_PROMPT.format(
        today=today,
        knowledge=WINE_KNOWLEDGE.strip(),
        photo_context=photo_context,
    )

    # Fusionner les images côte à côte si plusieurs (contourne le bug qwen3-vl:8b
    # qui n'arrive pas à produire du JSON valide quand plusieurs images sont envoyées)
    merged_tmp: Optional[Path] = None
    if len(jpeg_paths) > 1:
        try:
            merged_tmp = merge_images_side_by_side(jpeg_paths, max_height=900)
            send_paths = [merged_tmp]
        except Exception as e:
            log.warning(f"Fusion impossible ({e}), envoi séparé")
            send_paths = jpeg_paths
    else:
        send_paths = jpeg_paths

    images_b64: list[str] = []
    for p in send_paths:
        try:
            images_b64.append(image_to_base64(p))
        except Exception as e:
            log.warning(f"Impossible de lire {p.name}: {e}")

    if not images_b64:
        log.error("Aucune image valide à envoyer à Ollama")
        return None

    messages = [
        {
            "role": "system",
            "content": (
                "Tu es un assistant qui répond UNIQUEMENT en JSON. "
                "Tu rédiges TOUJOURS en FRANÇAIS : descriptions, arômes, accords, notes, tous les textes sans exception. "
                "Ne produis jamais de raisonnement, d'explication, ni de texte hors du JSON. "
                "Ta réponse DOIT commencer par '{' et se terminer par '}'. Rien d'autre."
            ),
        },
        {
            "role": "user",
            # /no_think en tête du message user = méthode officielle qwen3 pour désactiver le thinking.
            # Le hint utilisateur est isolé dans un tag XML `<user_hint>` pour que le modèle le traite
            # comme une source séparée (pas du contenu à ignorer dilué dans les consignes).
            "content": (
                "/no_think\n"
                "⚠️ LANGUE OBLIGATOIRE : Tous les textes (description, palate, style, agingNotes, "
                "arômes, accords, occasions, glassType) DOIVENT être rédigés en FRANÇAIS. "
                "Ne jamais utiliser l'anglais, même partiellement.\n\n"
            ) + (
                f"<user_hint>\n{hint}\n</user_hint>\n"
                "Le bloc <user_hint> ci-dessus est une information directe du propriétaire de la bouteille. "
                "Traite-la comme une SOURCE DE VÉRITÉ qui prime sur toute lecture ambiguë de l'étiquette : "
                "nom, domaine, millésime, prix indicatif, cépage. Si l'étiquette est floue ou contradictoire, "
                "le <user_hint> fait foi. Si le hint parle d'un prix/cépage/année absent de l'étiquette, "
                "utilise-le tel quel.\n\n"
                if hint else ""
            ) + (
                f"<web_context source=\"{web_url}\">\n{web_context}\n</web_context>\n"
                "Le bloc <web_context> ci-dessus est extrait d'une page Vivino ou Wine-Searcher correspondant à ce vin. "
                "C'est une SOURCE DE VÉRITÉ ABSOLUE pour les champs suivants — ils ÉCRASENT toute déduction visuelle :\n"
                "  • identity.type (rouge/blanc/rosé/champagne…) — si la page parle de 'blanc' ou 'white' ou 'Blanc de Blancs', identity.type = 'blanc'\n"
                "  • identity.grapes (cépages réels de l'appellation)\n"
                "  • identity.appellation (appellation officielle complète)\n"
                "  • identity.name et identity.domain si clairement mentionnés\n"
                "  • purchase.estimatedValue (prix du marché Vivino/Wine-Searcher)\n"
                "Utilise aussi ces données pour : description, notes de dégustation, accords, millésime.\n\n"
                if web_context else ""
            ) + prompt,
            "images": images_b64,
        },
    ]

    payload = {
        "model": OLLAMA_MODEL,
        "think": False,           # niveau racine — supporté par qwen3 dans Ollama ≥ 0.6
        # JSON mode natif Ollama : garantit que la réponse est un objet JSON valide,
        # évite les blocs markdown, les commentaires et les "json:" en préfixe que le
        # modèle produisait parfois et qu'on rattrapait à la regex.
        "format": "json",
        "messages": messages,
        "options": {"temperature": 0.1, "num_ctx": 16384, "num_predict": 8192},
        "stream": False,
    }

    try:
        try:
            resp = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=300)
            resp.raise_for_status()
        except requests.Timeout:
            log.error("Ollama timeout (300s) — originaux préservés")
            return None
        except requests.RequestException as e:
            log.error(f"Erreur réseau Ollama: {e} — originaux préservés")
            return None

        resp_json = resp.json()
        message = resp_json.get('message', {})
        raw = message.get('content', '') or ''

        # qwen3 thinking mode : contenu peut être dans reasoning_content ou thinking si content vide
        if not raw.strip():
            for fallback_key in ('reasoning_content', 'thinking'):
                candidate = message.get(fallback_key, '') or ''
                if candidate.strip():
                    raw = candidate
                    log.debug(f"Contenu trouvé dans message.{fallback_key} (mode thinking qwen3)")
                    break
            if not raw.strip():
                log.error(f"Réponse Ollama vide — structure: {list(resp_json.keys())}")
                log.error(f"Message keys: {list(message.keys())}")
                return None

        # Strip qwen3 <think> blocks — fermés (</think>) ou non fermés (tronqués)
        # Étape 1 : supprimer les blocs fermés <think>...</think>
        raw_no_think = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL)
        # Étape 2 : supprimer tout bloc ouvert non fermé <think>... jusqu'à la fin
        raw_no_think = re.sub(r'<think>.*$', '', raw_no_think, flags=re.DOTALL).strip()

        if raw_no_think:
            raw = raw_no_think
            log.debug("Blocs <think> supprimés du contenu Ollama")
        else:
            # Rien après les blocs think — chercher du JSON à l'intérieur si bloc fermé
            think_content = re.search(r'<think>(.*?)</think>', raw, re.DOTALL)
            if think_content:
                inner = think_content.group(1).strip()
                m = re.search(r'\{.*\}', inner, re.DOTALL)
                if m:
                    log.warning("JSON trouvé à l'intérieur d'un bloc <think> — extraction forcée")
                    try:
                        return json.loads(m.group(0))
                    except json.JSONDecodeError:
                        pass
            log.error("Réponse Ollama ne contient que du contenu <think> sans JSON exploitable")
            log.error(f"Réponse brute (500 chars): {raw[:500]}")
            return None

        # Strip markdown code blocks if present
        cleaned = re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=re.MULTILINE)
        cleaned = re.sub(r'```\s*$', '', cleaned.strip(), flags=re.MULTILINE)
        cleaned = cleaned.strip()

        # Find JSON object in response
        m = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if m:
            cleaned = m.group(0)

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            log.error(f"JSON invalide retourné par Ollama: {e}")
            log.error(f"Réponse brute (500 chars): {raw[:500]}")
            return None

    finally:
        # Supprimer le fichier temporaire de fusion s'il existe
        if merged_tmp and merged_tmp.exists():
            try:
                merged_tmp.unlink()
            except Exception:
                pass

# ─── JSON Validation & Auto-correction ───────────────────────────────────────────

def validate_and_fix(data: dict, basename: str) -> dict:
    """Validate and auto-correct schema v1.0 constraints."""
    data['schemaVersion'] = '1.0'

    identity = data.setdefault('identity', {})
    purchase = data.setdefault('purchase', {})
    service  = data.setdefault('service', {})
    analysis = data.setdefault('analysis', {})
    meta     = data.setdefault('meta', {})

    # domain must not be the appellation — if identical, use producer instead
    domain     = identity.get('domain', '') or ''
    appellation = identity.get('appellation', '') or ''
    producer   = identity.get('producer', '') or ''
    if domain and appellation and domain.lower().strip() == appellation.lower().strip():
        log.warning(f"domain == appellation ({domain!r}) → remplacé par producer ({producer!r})")
        identity['domain'] = producer or domain

    # village "N/A" → null
    if identity.get('village') in ('N/A', 'n/a', 'NA', '', 'None', 'none'):
        identity['village'] = None

    # Vintage suspect : année de fondation confondue avec millésime
    # Si vintage < 1950 ou si le type est champagne/crémant sans mention explicite de millésime
    current_year = date.today().year
    vintage = identity.get('vintage')
    if vintage is not None:
        if vintage < 1950:
            log.warning(f"vintage={vintage} probablement une année de fondation → null + nonVintage=true")
            identity['vintage'] = None
            identity['nonVintage'] = True
        elif vintage > current_year:
            log.warning(f"vintage={vintage} dans le futur → null")
            identity['vintage'] = None

    # bottleSize consistency
    bottle_size = identity.get('bottleSize') or purchase.get('bottleSize') or 75
    if bottle_size not in (37, 75, 150, 300, 600):
        log.warning(f"bottleSize invalide ({bottle_size}) → 75")
        bottle_size = 75
    identity['bottleSize'] = bottle_size
    purchase['bottleSize'] = bottle_size

    # palate must be string
    if isinstance(analysis.get('palate'), dict):
        log.warning("analysis.palate était un dict — conversion en string")
        palate_dict = analysis['palate']
        analysis['palate'] = '. '.join(str(v) for v in palate_dict.values() if v)
    elif not isinstance(analysis.get('palate'), str):
        analysis['palate'] = str(analysis.get('palate', ''))

    # decantingTime must be null if not decanting
    if not service.get('decanting', False):
        service['decantingTime'] = None

    # decantingTime: convert hours to minutes if model returned a small value (≤ 6 → likely hours)
    dt = service.get('decantingTime')
    if service.get('decanting') and dt is not None and isinstance(dt, (int, float)) and dt <= 6:
        log.warning(f"decantingTime={dt} semble être en heures → converti en minutes ({int(dt * 60)})")
        service['decantingTime'] = int(dt * 60)

    # Force decanting for wine types that always require it
    wine_type = identity.get('type', '')
    appellation_lower = (identity.get('appellation', '') or '').lower()
    ALWAYS_DECANT_TYPES = {'red', 'fortified'}
    ALWAYS_DECANT_APPELLATIONS = {'amarone', 'barolo', 'barbaresco', 'brunello', 'hermitage', 'côte-rôtie', 'cahors'}
    needs_decant = (
        wine_type in ALWAYS_DECANT_TYPES and
        any(k in appellation_lower for k in ALWAYS_DECANT_APPELLATIONS)
    )
    if needs_decant and not service.get('decanting', False):
        log.warning(f"decanting=false sur un {appellation_lower} → forcé à true (90 min)")
        service['decanting'] = True
        service['decantingTime'] = service.get('decantingTime') or 90

    # Empty lists, not null
    for key in ('grapes', 'mentions'):
        if identity.get(key) is None:
            identity[key] = []

    # Filtrer les cépages qui ne sont pas autorisés par l'appellation (anti-hallucination
    # ciblée sur le cas classique "Merlot dans Barolo" / "Sangiovese dans Amarone").
    appellation_raw = identity.get('appellation') or ''
    kept, rejected = filter_illegal_grapes(appellation_raw, identity.get('grapes', []))
    if rejected:
        log.warning(
            f"Cépages rejetés pour appellation {appellation_raw!r} : {rejected} "
            f"(non autorisés dans la liste APPELLATION_GRAPES)"
        )
        identity['grapes'] = kept
        # Signale la correction via meta.notes et baisse la confiance : l'utilisateur
        # est prévenu qu'il doit vérifier.
        note = meta.get('notes') or ''
        meta['notes'] = (note + f" | Cépages rejetés: {', '.join(rejected)}").lstrip(' | ')
        if meta.get('confidence') == 'high':
            meta['confidence'] = 'medium'

    # Remove mentions that duplicate domain/producer/name/appellation
    redundant = {
        slugify(identity.get('domain', '') or ''),
        slugify(identity.get('producer', '') or ''),
        slugify(identity.get('name', '') or ''),
        slugify(identity.get('appellation', '') or ''),
    } - {'', 'inconnu'}
    identity['mentions'] = [
        m for m in identity.get('mentions', [])
        if slugify(m) not in redundant
    ]

    pairings = data.setdefault('pairings', {})
    for key in ('ideal', 'good', 'avoid', 'occasions', 'cheese'):
        val = pairings.get(key)
        if val is None:
            pairings[key] = []
        elif isinstance(val, str):
            # Model returned a comma-separated string instead of array
            log.warning(f"pairings.{key} était une string — conversion en liste")
            pairings[key] = [v.strip() for v in val.split(',') if v.strip()]

    # awards must be a list — never invented data but can't detect that programmatically
    if not isinstance(data.get('awards'), list):
        data['awards'] = []

    # Remove duplicates from pairing lists (preserve order)
    for key in ('ideal', 'good', 'avoid', 'occasions', 'cheese'):
        lst = pairings.get(key, [])
        if isinstance(lst, list):
            seen: set[str] = set()
            deduped = []
            for item in lst:
                low = item.lower().strip()
                if low not in seen:
                    seen.add(low)
                    deduped.append(item)
            pairings[key] = deduped

    # source "Wine Merchant" / "Unknown" are generic placeholders → null
    generic_sources = {'wine merchant', 'unknown', 'n/a', 'na', 'none', ''}
    if str(purchase.get('source', '') or '').lower().strip() in generic_sources:
        purchase['source'] = None

    # meta
    meta['importStatus'] = 'pending'
    meta['scanDate']     = meta.get('scanDate') or date.today().isoformat()
    meta['photoFilename'] = basename

    if meta.get('confidence') not in ('high', 'medium', 'low'):
        meta['confidence'] = 'medium'
    if meta.get('photoQuality') not in ('excellent', 'good', 'fair', 'poor'):
        meta['photoQuality'] = 'fair'

    return data

# ─── SearXNG Photo Search ─────────────────────────────────────────────────────────

def download_and_score(url: str) -> tuple[Optional[bytes], float, str]:
    """Download image URL, return (bytes, h/w ratio, extension) or (None, 0, '')."""
    try:
        resp = requests.get(url, timeout=10, headers={'User-Agent': 'CaveScan/1.0'})
        resp.raise_for_status()
        data = resp.content
    except Exception:
        return None, 0.0, ''

    if len(data) < MIN_PHOTO_SIZE:
        return None, 0.0, ''

    try:
        img = Image.open(BytesIO(data))
        w, h = img.size
        ratio = h / w if w > 0 else 0.0
        ext = Path(url.split('?')[0]).suffix.lower()
        if ext not in PHOTO_EXTENSIONS:
            ext = '.jpg'
        return data, ratio, ext
    except Exception:
        return None, 0.0, ''


WEB_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
}


def _normalize_for_match(text: str) -> str:
    """Normalise pour la comparaison : minuscules, sans accents, sans ponctuation."""
    nfkd = unicodedata.normalize('NFKD', text)
    ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9 ]', ' ', ascii_str.lower())


def _is_complete_image_url(url: str) -> bool:
    """Vérifie que l'URL pointe vers une vraie image et non juste un domaine.

    Rejette les URLs tronquées comme "https://images.vivino.com" (sans path).
    Ces URLs apparaissent dans les og:image de certaines pages React Vivino.
    """
    if not url or '://' not in url:
        return False
    try:
        # Extraire le chemin après le domaine
        after_scheme = url.split('://', 1)[1]  # e.g. "images.vivino.com/thumbs/abc.png"
        path_start = after_scheme.find('/')
        if path_start == -1:
            return False  # Pas de '/' → juste un domaine
        path = after_scheme[path_start + 1:]  # sans le /
        if not path:
            return False  # Chemin vide → juste "domain/"

        lower = url.lower()
        # Répertoires CDN connus
        if any(p in lower for p in ['/thumbs/', '/thumb/', '/wine/', '/product/', '/images/', '/photos/', '/pb_']):
            return True
        # Extension image dans le chemin (ignorer les query strings)
        path_only = path.split('?')[0].lower()
        return any(path_only.endswith(ext) for ext in ('.jpg', '.jpeg', '.png', '.webp', '.gif'))
    except Exception:
        return False


def _result_matches_query(result: dict, query_keywords: list[str]) -> bool:
    """Vérifie qu'un résultat SearXNG correspond bien au vin cherché.

    Évite de prendre une photo d'un vin complètement différent quand
    le vin cherché n'est pas sur Vivino et que les résultats sont hors-sujet.
    """
    url = _normalize_for_match(result.get('url', ''))
    title = _normalize_for_match(result.get('title', '') or '')
    content = _normalize_for_match(result.get('content', '') or '')
    combined = url + ' ' + title + ' ' + content
    # Au moins un mot-clé significatif (>3 chars) doit apparaître dans la page
    return any(kw in combined for kw in query_keywords if len(kw) > 3)


def extract_og_image(html: str) -> Optional[str]:
    """Extrait l'URL og:image depuis le HTML, et valide qu'elle est complète."""
    for pattern in [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
    ]:
        m = re.search(pattern, html, re.IGNORECASE)
        if m:
            url = m.group(1)
            if _is_complete_image_url(url):
                return url
            # URL tronquée (ex: "https://images.vivino.com") → ignorer
            log.debug(f"og:image ignorée (URL incomplète): {url}")
    return None


def extract_bottle_image_from_page(html: str, page_url: str) -> Optional[str]:
    """Extrait la meilleure URL d'image de bouteille depuis une page vin (Vivino, Wine-Searcher…).

    Retourne uniquement des URLs complètes et valides. Les URLs tronquées
    (comme https://images.vivino.com sans chemin) sont ignorées.
    """
    # 1. og:image (déjà validée dans extract_og_image)
    og = extract_og_image(html)
    if og:
        return og

    # 2. URLs CDN Vivino directes dans le HTML — filtrer les incomplètes
    vivino_pattern = r'(https?://images\.vivino[^"\'>\s]+)'
    matches = [m for m in re.findall(vivino_pattern, html) if _is_complete_image_url(m)]
    if matches:
        # Préférer les grandes variantes
        for m in matches:
            if '600x' in m or 'pb_600' in m or 'large' in m or '300x' in m:
                return m
        return matches[0]

    # 3. URLs Wine-Searcher avec extension image
    ws_pattern = r'(https?://[^"\'>\s]*wine-searcher[^"\'>\s]*\.(?:jpg|jpeg|png|webp))'
    ws_matches = re.findall(ws_pattern, html, re.IGNORECASE)
    if ws_matches:
        return ws_matches[0]

    return None


def fetch_photo_from_wine_page(page_url: str) -> Optional[tuple[bytes, str]]:
    """Charge une page vin et extrait + télécharge la photo de bouteille."""
    try:
        resp = requests.get(page_url, headers=WEB_HEADERS, timeout=15)
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        log.debug(f"  Impossible de charger {page_url}: {e}")
        return None

    img_url = extract_bottle_image_from_page(html, page_url)
    if not img_url:
        log.debug(f"  Aucune image valide sur {page_url}")
        return None

    if img_url.startswith('//'):
        img_url = 'https:' + img_url

    log.info(f"  Image trouvée: {img_url[:80]}")
    data, ratio, ext = download_and_score(img_url)
    if data is None:
        log.debug(f"  Téléchargement échoué: {img_url[:60]}")
        return None

    log.info(f"  Photo téléchargée ({len(data)//1024} KB, ratio {ratio:.2f})")
    return data, ext


def search_official_photo(wine: dict, scan_bytes: Optional[bytes], priority_url: Optional[str] = None) -> Optional[tuple[bytes, str]]:
    """Cherche la photo officielle de la bouteille via SearXNG + scraping de pages vin.

    Stratégie :
    1. Si priority_url (hint utilisateur) → essai direct
    2. Recherche SearXNG sur sites de confiance avec vérification de pertinence :
       on vérifie que la page correspond bien au vin cherché avant d'utiliser sa photo
    3. Fallback : requêtes moins restrictives si les premières échouent
    """
    # ── Essai prioritaire : URL du hint ─────────────────────────────────────────
    if priority_url:
        log.info(f"📎 Essai photo depuis URL hint: {priority_url}")
        photo = fetch_photo_from_wine_page(priority_url)
        if photo:
            log.info(f"✓ Photo trouvée via URL hint")
            return photo
        log.info(f"  Aucune photo sur l'URL hint — SearXNG en fallback")

    identity = wine.get('identity', {})
    domain  = (identity.get('domain', '') or '').strip()
    name    = (identity.get('name', '') or '').strip()
    vintage = str(identity.get('vintage', '') or '').strip()

    wine_query = ' '.join(filter(None, [domain, name, vintage])).strip()
    if not wine_query:
        return None

    # Mots-clés normalisés pour vérifier la pertinence des résultats
    query_keywords = [_normalize_for_match(w) for w in (domain + ' ' + name).split()]
    # Ignorer les mots trop courts ou trop génériques
    query_keywords = [k for k in query_keywords if len(k) > 3 and k not in ('wine', 'vino', 'vin', 'rouge', 'blanc', 'rose', 'brut')]

    trusted_domains = ['vivino.com', 'wine-searcher.com', 'vinatis.com', 'idealwine.com', 'millesima.fr']

    # Requêtes par ordre de précision décroissante
    # La 1re requête ciblée Vivino, puis sans restriction de site
    queries_phase1 = [
        f"{wine_query} site:vivino.com",
        f"{wine_query} site:wine-searcher.com",
    ]
    queries_phase2 = [
        f"{wine_query} vivino vin",
        f"{wine_query} bouteille vin",
    ]

    visited_urls: set[str] = set()

    def _try_queries(queries: list[str], strict_relevance: bool) -> Optional[tuple[bytes, str]]:
        for query in queries:
            log.info(f"SearXNG photo: «{query}»")
            try:
                resp = requests.get(
                    f"{SEARXNG_URL}/search",
                    params={'q': query, 'format': 'json', 'language': 'fr'},
                    timeout=12,
                )
                resp.raise_for_status()
                results = resp.json().get('results', [])
            except Exception as e:
                log.warning(f"SearXNG erreur: {e}")
                continue

            for result in results[:6]:
                page_url = result.get('url', '')
                if not page_url or page_url in visited_urls:
                    continue
                visited_urls.add(page_url)

                if not any(d in page_url for d in trusted_domains):
                    continue

                # Vérification de pertinence : la page doit parler du vin cherché.
                # En phase stricte, on rejette les pages hors-sujet pour éviter
                # les photos de vins complètement différents (ex: R.C. Rawegger
                # → Châteauneuf-du-Pape).
                if strict_relevance and query_keywords:
                    if not _result_matches_query(result, query_keywords):
                        log.debug(f"  Non pertinent, ignoré: {page_url[:60]}")
                        continue

                log.info(f"  Scraping: {page_url[:80]}")
                photo = fetch_photo_from_wine_page(page_url)
                if photo:
                    log.info(f"✓ Photo trouvée: {page_url[:80]}")
                    return photo
        return None

    # Phase 1 : recherche ciblée + vérification stricte de pertinence
    photo = _try_queries(queries_phase1, strict_relevance=True)
    if photo:
        return photo

    # Phase 2 : requêtes plus larges + pertinence souple
    # (utile pour les vins dont le nom est abrégé ou mal orthographié dans les URLs)
    photo = _try_queries(queries_phase2, strict_relevance=bool(query_keywords))
    if photo:
        return photo

    log.warning(f"Aucune photo officielle trouvée pour «{wine_query}»")
    return None

# ─── Core Processing ──────────────────────────────────────────────────────────────

def _move_to_errors(photos: list[Path], scan_id: Optional[str]) -> None:
    """Déplace les fichiers sources vers /Erreurs pour qu'ils ne soient plus re-traités.
    Sans ce move, watchdog/process_all_pending les redétecte à chaque tick et relance Ollama en boucle."""
    try:
        ERRORS.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    for p in photos:
        try:
            dst = ERRORS / p.name
            # Éviter d'écraser un fichier déjà en erreur
            if dst.exists():
                dst = ERRORS / f"{p.stem}_{int(time.time())}{p.suffix}"
            p.rename(dst)
            log.info(f"🗃️  Déplacé en erreur: {p.name}")
        except Exception as e:
            log.warning(f"Impossible de déplacer {p.name} vers /Erreurs: {e}")
    if scan_id:
        hint_file = photos[0].parent / f"{scan_id}_hint.txt" if photos else None
        if hint_file and hint_file.exists():
            try:
                hint_file.rename(ERRORS / hint_file.name)
            except Exception:
                pass


def process_group(
    photos: list[Path],
    today: str,
    used_basenames: set[str],
) -> tuple[bool, str, str, str, str]:
    """
    Process one group (1 or 2 photos).
    Returns (success, label, confidence, photo_info, basename).
    On failure, the originals are MOVED to /Erreurs (not left in SOURCE),
    which prevents infinite re-processing loops when Ollama fails.
    """
    scan_id = _extract_scan_id(photos)
    names = ', '.join(p.name for p in photos)
    log.info(f"--- Début traitement: {names}")
    _write_progress(scan_id, 'start', f"Démarrage — {len(photos)} photo(s) détectée(s)")

    # Convert to JPEG
    _write_progress(scan_id, 'convert', "Conversion des images…")
    jpegs: list[Path] = []
    for p in photos:
        if p.suffix.lower() in ('.heic', '.heif') and not HEIC_SUPPORTED:
            log.error(f"HEIC non supporté (pillow-heif manquant): {p.name}")
            _write_progress(scan_id, 'convert', f"Format HEIC non supporté : {p.name}", 'error')
            _write_progress(scan_id, 'done', "Échec de conversion", 'error')
            _move_to_errors(photos, scan_id)
            return False, p.name, 'low', '', ''
        j = convert_to_jpeg(p)
        if j:
            jpegs.append(j)

    if not jpegs:
        log.error(f"Aucune image convertible: {names}")
        _write_progress(scan_id, 'convert', "Aucune image convertible", 'error')
        _write_progress(scan_id, 'done', "Échec de conversion", 'error')
        _move_to_errors(photos, scan_id)
        return False, names, 'low', '', ''

    _write_progress(scan_id, 'convert', f"{len(jpegs)} image(s) convertie(s)")

    # Read optional hint file
    hint: Optional[str] = None
    hint_candidates = [p for p in photos if p.suffix == '.txt' and '_hint' in p.name]
    if not hint_candidates:
        # Also look in the same directory by scan_id pattern
        hint_file = photos[0].parent / f"{scan_id}_hint.txt"
        if hint_file.exists():
            hint_candidates = [hint_file]
    if hint_candidates:
        try:
            hint = hint_candidates[0].read_text(encoding='utf-8').strip() or None
            if hint:
                log.info(f"Indice utilisateur : {hint[:80]}")
                _write_progress(scan_id, 'ollama', f"Indice : {hint[:60]}…" if len(hint) > 60 else f"Indice : {hint}")
        except Exception as e:
            log.warning(f"Impossible de lire le fichier hint : {e}")

    # Détection et scraping d'une URL dans le hint (Vivino, Wine-Searcher, site du domaine…)
    hint_url: Optional[str] = None
    web_context: Optional[str] = None
    if hint:
        hint_url = extract_url_from_hint(hint)
        if hint_url:
            log.info(f"URL détectée dans le hint: {hint_url}")
            _write_progress(scan_id, 'ollama', f"Chargement de la page web : {hint_url[:60]}…")
            web_context = scrape_wine_text(hint_url)
            if web_context:
                log.info(f"Contexte web extrait : {len(web_context)} caractères")
                _write_progress(scan_id, 'ollama', f"Contexte web chargé ({len(web_context)} chars)")
            else:
                log.warning(f"Impossible d'extraire du texte de {hint_url}")
                _write_progress(scan_id, 'ollama', "Page web inaccessible — analyse sans contexte web", 'warning')

    # Recherche web proactive si le hint n'avait pas d'URL :
    # On cherche le vin sur Vivino/Wine-Searcher AVANT d'appeler Ollama pour
    # corriger les erreurs de type (rouge vs blanc) ou de nom avant l'analyse IA.
    if not web_context and hint:
        hint_text_only = re.sub(r'https?://\S+', '', hint).strip()
        if len(hint_text_only) > 4:
            _write_progress(scan_id, 'ollama', "Recherche web du vin…")
            pre_context, pre_url = searxng_search_wine_context(hint_text_only)
            if pre_context:
                web_context = pre_context
                hint_url = pre_url  # utilisé aussi comme priority_url pour la photo
                _write_progress(scan_id, 'ollama', f"Contexte web trouvé ({len(pre_context)} chars)")
            else:
                _write_progress(scan_id, 'ollama', "Aucun contexte web — analyse par image seule")

    # Analyze with Ollama
    log.info(f"Envoi à Ollama ({len(jpegs)} image(s))...")
    _write_progress(scan_id, 'ollama', f"Envoi au modèle IA ({OLLAMA_MODEL})…")
    wine_data = analyze_with_ollama(jpegs, hint=hint, web_context=web_context, web_url=hint_url)

    if wine_data is None:
        _cleanup_temp(jpegs)
        _write_progress(scan_id, 'ollama', "Le modèle n'a pas retourné de résultat valide", 'error')
        _write_progress(scan_id, 'done', "Échec Ollama", 'error')
        _move_to_errors(photos, scan_id)
        return False, names, 'low', '', ''

    _write_progress(scan_id, 'ollama', "Analyse IA terminée")

    # Generate basename
    basename = make_basename(wine_data, today)
    if basename in used_basenames:
        for sfx in ('-a', '-b', '-c', '-d', '-e'):
            candidate = basename + sfx
            if candidate not in used_basenames:
                basename = candidate
                break
    used_basenames.add(basename)

    # Validate & fix JSON
    _write_progress(scan_id, 'validate', "Validation et correction du JSON…")
    wine_data = validate_and_fix(wine_data, basename)
    # Propagation du scanId : clé d'idempotence lue par l'importer Node (meta.scanId).
    # Empêche les doublons si le fichier JSON est relu/ré-ingéré.
    if scan_id:
        wine_data.setdefault('meta', {})['scanId'] = scan_id
    confidence = wine_data.get('meta', {}).get('confidence', 'medium')
    identity = wine_data.get('identity', {})
    wine_label = ' '.join(filter(None, [
        identity.get('domain', ''),
        identity.get('name', ''),
        str(identity.get('vintage', '') or ''),
    ])).strip() or names
    _write_progress(scan_id, 'validate', f"Confiance {confidence} — {wine_label}")

    # Search official photo via web scraping (Vivino, Wine-Searcher, etc.)
    # Si le hint contenait une URL, on l'essaie en priorité avant SearXNG
    _write_progress(scan_id, 'photo', "Recherche de la photo officielle…")
    photo_result = search_official_photo(wine_data, None, priority_url=hint_url)

    # Prépare les chemins de sortie
    DEST.mkdir(parents=True, exist_ok=True)
    json_path = DEST / f"{basename}.json"

    # Écrit d'abord la photo + met à jour wine_data SANS écrire le JSON, puis un seul write.
    # Ordre : photo → JSON. Ainsi quand le watcher Node lit le JSON, la photo est déjà là.
    photo_info = '❌ aucune photo'
    if photo_result:
        photo_bytes, ext = photo_result
        photo_path = DEST / f"{basename}{ext}"
        with open(photo_path, 'wb') as f:
            f.write(photo_bytes)
        photo_info = f"🖼️  officielle → {photo_path.name}"
        log.info(f"Photo officielle écrite: {photo_path.name}")
        _write_progress(scan_id, 'photo', "Photo officielle trouvée")
    else:
        _write_progress(scan_id, 'photo', "Aucune photo officielle — utilisation du scan", 'warning')
        note = wine_data.setdefault('meta', {}).get('notes') or ''
        if jpegs:
            fallback_src = jpegs[0]
            fallback_dst = DEST / f"{basename}.jpg"
            try:
                import shutil
                shutil.copy2(fallback_src, fallback_dst)
                photo_info = f"📷 scan (fallback) → {fallback_dst.name}"
                log.info(f"Photo scan utilisée comme fallback: {fallback_dst.name}")
                wine_data['meta']['notes'] = (note + ' | Photo scan utilisée (aucune officielle trouvée)').lstrip(' | ')
            except Exception as e:
                log.warning(f"Impossible de copier la photo scan: {e}")
                wine_data['meta']['notes'] = (note + ' | Aucune photo officielle trouvée').lstrip(' | ')
        else:
            wine_data['meta']['notes'] = (note + ' | Aucune photo officielle trouvée').lstrip(' | ')

    # Une SEULE écriture du JSON, avec l'état final. Critique : avant cette refonte,
    # le JSON était écrit puis réécrit dans la branche fallback, ce qui déclenchait
    # un second `change` event côté watcher Node et ouvrait la porte à des imports
    # multiples du même scan.
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(wine_data, f, ensure_ascii=False, indent=2)
    log.info(f"JSON écrit: {json_path.name}")

    # Delete originals (only on success)
    for p in photos:
        try:
            p.unlink()
            log.info(f"Original supprimé: {p.name}")
        except Exception as e:
            log.warning(f"Impossible de supprimer {p.name}: {e}")
    # Delete hint file if present
    if scan_id:
        hint_file = photos[0].parent / f"{scan_id}_hint.txt"
        if hint_file.exists():
            try:
                hint_file.unlink()
            except Exception:
                pass

    _cleanup_temp(jpegs)

    label = wine_label
    log.info(f"--- Fin traitement: {basename}")
    _write_progress(scan_id, 'done', f"Terminé — {wine_label}")
    return True, label, confidence, photo_info, basename


def _cleanup_temp(jpegs: list[Path]):
    for j in jpegs:
        try:
            j.unlink()
        except Exception:
            pass


def _extract_scan_id(photos: list[Path]) -> Optional[str]:
    """Extrait le scanId (ex: 'scan_2026-04-10_a1b2c3d4') depuis les noms de fichiers."""
    for p in photos:
        m = re.match(r'^(scan_\d{4}-\d{2}-\d{2}_[a-f0-9]+)', p.stem)
        if m:
            return m.group(1)
    return None


def _write_progress(scan_id: Optional[str], stage: str, message: str, level: str = 'info') -> None:
    """Ajoute une ligne JSONL dans /inbox/.progress/{scanId}.jsonl."""
    if not scan_id:
        return
    PROGRESS.mkdir(parents=True, exist_ok=True)
    import datetime
    line = json.dumps({
        'ts': datetime.datetime.utcnow().isoformat() + 'Z',
        'stage': stage,
        'message': message,
        'level': level,
    }, ensure_ascii=False)
    try:
        with open(PROGRESS / f"{scan_id}.jsonl", 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception as e:
        log.warning(f"Impossible d'écrire le progrès pour {scan_id}: {e}")

# ─── Batch Processing ─────────────────────────────────────────────────────────────

# Global lock: ensures only ONE bottle is being analyzed at a time.
# Ollama is single-threaded anyway; running parallel requests just causes
# queuing at Ollama level while confusing the frontend progress display.
_PROCESSING_LOCK = threading.Lock()

# File d'attente globale des scanId en attente/en cours de traitement.
# Permet de communiquer la position à l'utilisateur AVANT que son scan passe
# sous le lock. Protégé par _QUEUE_LOCK.
# L'élément à l'index 0 est celui qui est (ou va être) traité juste après.
_SCAN_QUEUE: list[str] = []
_QUEUE_LOCK = threading.Lock()

# Estimation du temps moyen par bouteille (en secondes) pour afficher un ETA.
# Calibrée sur qwen3-vl:8b en local. Ajuster si le matériel change.
_SECONDS_PER_BOTTLE = 180


def _enqueue_scan(scan_id: Optional[str]) -> None:
    """Inscrit un scan en file d'attente et broadcast sa position initiale."""
    if not scan_id:
        return
    with _QUEUE_LOCK:
        if scan_id in _SCAN_QUEUE:
            return  # déjà en file (re-détection watchdog)
        _SCAN_QUEUE.append(scan_id)
        position = len(_SCAN_QUEUE)
    if position > 1:
        eta_min = max(1, ((position - 1) * _SECONDS_PER_BOTTLE) // 60)
        _write_progress(
            scan_id,
            'queued',
            f"Position {position} dans la file — {position - 1} scan(s) avant vous (~{eta_min} min d'attente)",
        )


def _dequeue_scan(scan_id: Optional[str]) -> None:
    """Retire un scan de la file (fin de traitement) et met à jour les positions restantes."""
    if not scan_id:
        return
    with _QUEUE_LOCK:
        if scan_id in _SCAN_QUEUE:
            _SCAN_QUEUE.remove(scan_id)
        remaining = list(_SCAN_QUEUE)
    # Réannonce leur nouvelle position aux scans encore en attente (i > 0 car
    # l'index 0 est celui qui démarre maintenant, il a déjà son propre progrès)
    for i, sid in enumerate(remaining):
        if i == 0:
            continue
        eta_min = max(1, (i * _SECONDS_PER_BOTTLE) // 60)
        _write_progress(
            sid,
            'queued',
            f"Position {i + 1} dans la file — {i} scan(s) avant vous (~{eta_min} min d'attente)",
        )


def process_all_pending():
    """Process all images currently in SOURCE at startup."""
    files = [
        f for f in SOURCE.iterdir()
        if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS
    ]
    if not files:
        return
    log.info(f"{len(files)} fichier(s) en attente au démarrage")
    groups = group_photos(files)
    _run_batch(groups)


def _run_batch(groups: list[list[Path]]):
    """Process all groups sequentially, one at a time, under a global lock."""
    if not groups:
        return

    total_bottles = len(groups)
    total_photos  = sum(len(g) for g in groups)
    results: list[tuple] = []

    # Enqueue TOUS les scans du batch immédiatement — avant même d'attendre
    # le lock — pour que leur position soit annoncée au front le plus tôt
    # possible (sinon le user voit 'uploading' sans feedback pendant N×3min).
    scan_ids_in_batch: list[Optional[str]] = [_extract_scan_id(g) for g in groups]
    for sid in scan_ids_in_batch:
        _enqueue_scan(sid)

    with _PROCESSING_LOCK:
        today = date.today().isoformat()
        used_basenames: set[str] = set()

        for i, group in enumerate(groups, 1):
            log.info(f"Bouteille {i}/{total_bottles}")
            sid = scan_ids_in_batch[i - 1]
            try:
                result = process_group(group, today, used_basenames)
            finally:
                # Dequeue dans tous les cas (succès ou erreur) pour ne pas
                # bloquer la file et permettre aux scans suivants de voir leur
                # position correctement mise à jour.
                _dequeue_scan(sid)
            results.append((i, *result))

    # Summary report
    print('\n' + '━' * 52)
    print(f"✅ Traitement terminé — {total_bottles} bouteille(s) / {total_photos} photo(s)")
    for (idx, success, label, confidence, photo_info, basename) in results:
        icon = '✅' if success else '⚠️'
        conf_icon = {'high': '🟢', 'medium': '🟡', 'low': '🔴'}.get(confidence, '⚪')
        print(f"  [{idx}/{total_bottles}] {icon} {conf_icon} {label}")
        if basename:
            print(f"         {photo_info} → {basename}.json")
    print('━' * 52 + '\n')

# ─── Watchdog ─────────────────────────────────────────────────────────────────────

class WinePhotoHandler(FileSystemEventHandler):
    def __init__(self):
        self._pending: dict[str, float] = {}
        self._lock    = threading.Lock()
        self._timer: Optional[threading.Timer] = None

    def on_created(self, event):
        if not event.is_directory:
            self._register(Path(event.src_path))

    def on_moved(self, event):
        # Catches files moved/copied into the folder
        if not event.is_directory:
            self._register(Path(event.dest_path))

    def _register(self, path: Path):
        if path.suffix.lower() in IMAGE_EXTENSIONS:
            log.info(f"Détecté: {path.name}")
            with self._lock:
                self._pending[str(path)] = time.time()
            self._schedule()

    def _schedule(self):
        if self._timer:
            self._timer.cancel()
        self._timer = threading.Timer(SETTLE, self._flush)
        self._timer.daemon = True
        self._timer.start()

    def _flush(self):
        now = time.time()
        with self._lock:
            ready = {k for k, t in self._pending.items() if now - t >= SETTLE}
            for k in ready:
                del self._pending[k]

        if not ready:
            return

        files = [Path(p) for p in ready if Path(p).exists()]
        if not files:
            return

        # ── Rattrapage des retardataires même scanId ───────────────────────────
        # Si un fichier "ready" appartient à un scanId X (ex: scan_..._1.jpg),
        # on cherche dans SOURCE tous les autres fichiers du MÊME scanId (ex: _2)
        # et on les inclut dans ce batch, même s'ils n'ont pas encore atteint
        # SETTLE. Ça évite qu'un recto + verso écrits à > SETTLE secondes
        # d'écart (upload lent, Node non-atomique) soient traités en DEUX
        # cycles distincts — ce qui causait 2 appels Ollama avec le MÊME
        # scan_id et un échec sur le verso seul.
        ready_scan_ids: set[str] = set()
        for f in files:
            sid = _extract_scan_id([f])
            if sid:
                ready_scan_ids.add(sid)

        if ready_scan_ids:
            known = {str(f) for f in files}
            try:
                for src in SOURCE.iterdir():
                    if not src.is_file():
                        continue
                    if src.suffix.lower() not in IMAGE_EXTENSIONS:
                        continue
                    if str(src) in known:
                        continue
                    sid = _extract_scan_id([src])
                    if sid and sid in ready_scan_ids:
                        files.append(src)
                        known.add(str(src))
                        # Retire aussi du pending pour éviter un re-traitement
                        with self._lock:
                            self._pending.pop(str(src), None)
                        log.info(f"Rattrapage {src.name} (même scanId que le batch)")
            except Exception as e:
                log.warning(f"Erreur lors du rattrapage de retardataires: {e}")

        log.info(f"Traitement de {len(files)} nouveau(x) fichier(s)")
        groups = group_photos(files)
        _run_batch(groups)

# ─── Startup ──────────────────────────────────────────────────────────────────────

def ping_ollama() -> bool:
    """Check Ollama is reachable and model is available."""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=10)
        resp.raise_for_status()
        models = [m['name'] for m in resp.json().get('models', [])]
        if any(OLLAMA_MODEL in m for m in models):
            log.info(f"✅ Ollama OK — modèle {OLLAMA_MODEL} disponible")
            return True
        log.warning(f"⚠️  Modèle {OLLAMA_MODEL} non trouvé. Disponibles: {models}")
        log.warning(f"   → Lancer sur Ubuntu: ollama pull {OLLAMA_MODEL}")
        return False
    except Exception as e:
        log.error(f"❌ Ollama inaccessible ({OLLAMA_URL}): {e}")
        return False


def main():
    log.info("=" * 52)
    log.info("🍷 Cave Scan Service — démarrage")
    log.info(f"   Ollama  : {OLLAMA_URL} ({OLLAMA_MODEL})")
    log.info(f"   SearXNG : {SEARXNG_URL}")
    log.info(f"   Source  : {SOURCE}")
    log.info(f"   Dest    : {DEST}")
    log.info(f"   HEIC    : {'✅ supporté' if HEIC_SUPPORTED else '❌ non supporté (pillow-heif manquant)'}")
    log.info("=" * 52)

    for d in (SOURCE, DEST, REF, ERRORS, TEMP):
        d.mkdir(parents=True, exist_ok=True)

    ping_ollama()
    process_all_pending()

    handler  = WinePhotoHandler()
    observer = Observer()
    observer.schedule(handler, str(SOURCE), recursive=False)
    observer.start()
    log.info(f"👁️  Surveillance active: {SOURCE}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Arrêt demandé")
        observer.stop()
    observer.join()
    log.info("Cave Scan Service arrêté")


if __name__ == '__main__':
    main()
