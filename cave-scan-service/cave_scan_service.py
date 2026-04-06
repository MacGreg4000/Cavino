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
from PIL import Image
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

SOURCE = CAVE_BASE / 'A analyser'
DEST   = CAVE_BASE / 'Prêt à être importé'
REF    = CAVE_BASE / 'importé'
TEMP   = CAVE_BASE / '.previews'

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


# ─── Ollama prompt ────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """{knowledge}

Tu es un expert en vins et spiritueux. Analyse les étiquettes dans les images fournies.
Retourne UNIQUEMENT un objet JSON valide, sans markdown, sans bloc de code, sans explication.
Date du jour : {today}

CONTEXTE PHOTOS : {photo_context}

RÈGLE ABSOLUE ANTI-HALLUCINATION :
- N'invente JAMAIS une donnée absente de l'étiquette. Si une information n'est pas lisible ou pas présente → null ou [].
- "domain" = nom du domaine/château/producteur (ex: "Villa Canestrari"), PAS l'appellation.
- "appellation" = l'appellation officielle (ex: "Amarone della Valpolicella DOCG").
- "awards" = [] si aucune médaille n'est visible sur l'étiquette. NE PAS inventer de médailles.
- "purchase.purchasePrice" = null si le prix n'est pas sur l'étiquette. NE PAS inventer de prix.
- "purchase.estimatedValue" = estimation basée sur ta connaissance du marché (acceptable), sinon null.
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

SCHÉMA OBLIGATOIRE — tous les champs sont requis, champs inconnus → null, JAMAIS inventés :

{{
  "schemaVersion": "1.0",
  "identity": {{
    "name": "string — NOM DE LA CUVÉE (ex: Phanos, Grande Réserve...)",
    "domain": "string — NOM DU DOMAINE/CHÂTEAU/PRODUCTEUR (ex: Villa Canestrari, Château Margaux)",
    "appellation": "string — APPELLATION OFFICIELLE avec mention légale (ex: Amarone della Valpolicella DOCG)",
    "vintage": integer_ou_null,
    "nonVintage": boolean,
    "type": "red|white|rosé|champagne|crémant|sweet|fortified|sparkling",
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


def analyze_with_ollama(jpeg_paths: list[Path]) -> Optional[dict]:
    """Send images to Ollama vision model, return parsed wine dict or None."""
    today = date.today().isoformat()

    # Contexte adaptatif selon le nombre de photos
    if len(jpeg_paths) == 1:
        photo_context = (
            "Une seule photo de la bouteille est fournie. "
            "Analyse l'étiquette visible (recto ou verso) et déduis les informations manquantes "
            "grâce à ta connaissance du vin. Les informations non visibles → null."
        )
    else:
        photo_context = (
            f"{len(jpeg_paths)} photos de la MÊME bouteille sont fournies (recto + verso ou angles différents). "
            "IMPORTANT : toutes les images montrent LA MÊME bouteille — ne crée PAS plusieurs entrées. "
            "Combine les informations de TOUTES les images pour produire une fiche unique et complète. "
            "Le recto contient généralement le nom, le domaine, l'appellation et le millésime. "
            "Le verso contient généralement l'alcool, les cépages, les accords, le producteur et les mentions légales. "
            "Priorité aux informations les plus lisibles parmi toutes les photos."
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
                "You are a JSON-only output assistant. "
                "NEVER output reasoning, thinking, explanations, or any text before or after the JSON. "
                "Your response MUST start with '{' and end with '}'. Nothing else."
            ),
        },
        {
            "role": "user",
            # /no_think en tête du message user = méthode officielle qwen3 pour désactiver le thinking
            "content": "/no_think\n" + prompt,
            "images": images_b64,
        },
    ]

    payload = {
        "model": OLLAMA_MODEL,
        "think": False,           # niveau racine — supporté par qwen3 dans Ollama ≥ 0.6
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


def search_official_photo(wine: dict) -> Optional[tuple[bytes, str]]:
    """
    Search for official bottle portrait via SearXNG.
    Returns (image_bytes, extension) or None.
    Never uses the scan photo as fallback.
    """
    identity = wine.get('identity', {})
    domain  = identity.get('domain', '') or ''
    name    = identity.get('name', '') or ''
    vintage = identity.get('vintage', '') or ''

    queries = [
        f"{domain} {name} {vintage} bottle wine",
        f"{domain} {name} {vintage} bouteille",
        f"{domain} {name} bottle official",
        f"{domain} {name} wine searcher",
    ]

    best_ratio = 0.0
    best_result: Optional[tuple[bytes, str]] = None

    for query in queries:
        q = query.strip()
        log.info(f"SearXNG: «{q}»")
        try:
            resp = requests.get(
                f"{SEARXNG_URL}/search",
                params={'q': q, 'format': 'json', 'categories': 'images', 'language': 'fr'},
                timeout=15,
            )
            resp.raise_for_status()
            results = resp.json().get('results', [])
        except Exception as e:
            log.warning(f"SearXNG erreur: {e}")
            continue

        for result in results:
            img_url = result.get('img_src') or result.get('url', '')
            if not img_url:
                continue

            # Filter by extension
            raw_path = img_url.split('?')[0]
            if Path(raw_path).suffix.lower() not in PHOTO_EXTENSIONS:
                continue

            data, ratio, ext = download_and_score(img_url)
            if data is None:
                continue

            if ratio > best_ratio:
                best_ratio = ratio
                best_result = (data, ext)
                log.debug(f"Nouveau meilleur ratio {ratio:.2f}: {img_url}")

            if best_ratio >= 1.5:
                log.info(f"Photo officielle trouvée (ratio {best_ratio:.2f}): {img_url}")
                return best_result

        if best_ratio >= 1.5:
            break

    if best_result:
        log.info(f"Meilleure photo disponible (ratio {best_ratio:.2f})")
        return best_result

    log.warning("Aucune photo officielle valide trouvée")
    return None

# ─── Core Processing ──────────────────────────────────────────────────────────────

def process_group(
    photos: list[Path],
    today: str,
    used_basenames: set[str],
) -> tuple[bool, str, str, str, str]:
    """
    Process one group (1 or 2 photos).
    Returns (success, label, confidence, photo_info, basename).
    On failure, originals are NOT deleted.
    """
    names = ', '.join(p.name for p in photos)
    log.info(f"--- Début traitement: {names}")

    # Convert to JPEG
    jpegs: list[Path] = []
    for p in photos:
        if p.suffix.lower() in ('.heic', '.heif') and not HEIC_SUPPORTED:
            log.error(f"HEIC non supporté (pillow-heif manquant): {p.name}")
            return False, p.name, 'low', '', ''
        j = convert_to_jpeg(p)
        if j:
            jpegs.append(j)

    if not jpegs:
        log.error(f"Aucune image convertible: {names}")
        return False, names, 'low', '', ''

    # Analyze with Ollama
    log.info(f"Envoi à Ollama ({len(jpegs)} image(s))...")
    wine_data = analyze_with_ollama(jpegs)

    if wine_data is None:
        _cleanup_temp(jpegs)
        return False, names, 'low', '', ''

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
    wine_data = validate_and_fix(wine_data, basename)
    confidence = wine_data.get('meta', {}).get('confidence', 'medium')

    # Search official photo
    photo_result = search_official_photo(wine_data)

    # Write output files
    DEST.mkdir(parents=True, exist_ok=True)
    json_path = DEST / f"{basename}.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(wine_data, f, ensure_ascii=False, indent=2)
    log.info(f"JSON écrit: {json_path.name}")

    photo_info = '❌ aucune photo'
    if photo_result:
        photo_bytes, ext = photo_result
        photo_path = DEST / f"{basename}{ext}"
        with open(photo_path, 'wb') as f:
            f.write(photo_bytes)
        photo_info = f"🖼️  officielle → {photo_path.name}"
        log.info(f"Photo officielle écrite: {photo_path.name}")
    else:
        # Fallback : utiliser la photo de scan (premier JPEG converti)
        if jpegs:
            fallback_src = jpegs[0]
            fallback_dst = DEST / f"{basename}.jpg"
            try:
                import shutil
                shutil.copy2(fallback_src, fallback_dst)
                photo_info = f"📷 scan (fallback) → {fallback_dst.name}"
                log.info(f"Photo scan utilisée comme fallback: {fallback_dst.name}")
                note = wine_data['meta'].get('notes') or ''
                wine_data['meta']['notes'] = (note + ' | Photo scan utilisée (aucune officielle trouvée)').lstrip(' | ')
            except Exception as e:
                log.warning(f"Impossible de copier la photo scan: {e}")
                note = wine_data['meta'].get('notes') or ''
                wine_data['meta']['notes'] = (note + ' | Aucune photo officielle trouvée').lstrip(' | ')
        else:
            note = wine_data['meta'].get('notes') or ''
            wine_data['meta']['notes'] = (note + ' | Aucune photo officielle trouvée').lstrip(' | ')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(wine_data, f, ensure_ascii=False, indent=2)

    # Delete originals (only on success)
    for p in photos:
        try:
            p.unlink()
            log.info(f"Original supprimé: {p.name}")
        except Exception as e:
            log.warning(f"Impossible de supprimer {p.name}: {e}")

    _cleanup_temp(jpegs)

    identity = wine_data.get('identity', {})
    label = ' '.join(filter(None, [
        identity.get('domain', ''),
        identity.get('name', ''),
        str(identity.get('vintage', '') or ''),
    ])).strip() or names

    log.info(f"--- Fin traitement: {basename}")
    return True, label, confidence, photo_info, basename


def _cleanup_temp(jpegs: list[Path]):
    for j in jpegs:
        try:
            j.unlink()
        except Exception:
            pass

# ─── Batch Processing ─────────────────────────────────────────────────────────────

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
    """Process all groups and print summary report."""
    if not groups:
        return

    today = date.today().isoformat()
    used_basenames: set[str] = set()
    total_bottles = len(groups)
    total_photos  = sum(len(g) for g in groups)
    results: list[tuple] = []

    for i, group in enumerate(groups, 1):
        log.info(f"Bouteille {i}/{total_bottles}")
        result = process_group(group, today, used_basenames)
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

    for d in (SOURCE, DEST, REF, TEMP):
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
