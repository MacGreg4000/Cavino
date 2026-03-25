#!/bin/bash
# ──────────────────────────────────────────────
# Caveau — Installation sur Synology NAS
# ──────────────────────────────────────────────

set -e

echo ""
echo "  🍷  Caveau — Installation"
echo "  ─────────────────────────"
echo ""

# Créer le fichier .env s'il n'existe pas
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Fichier .env créé depuis .env.example"
    echo "   → Modifiez le mot de passe DB si besoin : nano .env"
else
    echo "✅ Fichier .env existant conservé"
fi

# Créer les dossiers de données
CAVE_DATA=$(grep CAVE_DATA .env | cut -d= -f2 || echo "/volume1/cave-manager")
mkdir -p "$CAVE_DATA/inbox" "$CAVE_DATA/processed" "$CAVE_DATA/errors"
echo "✅ Dossiers créés dans $CAVE_DATA"

# Lancer Docker
echo ""
echo "🔨 Construction des images..."
echo ""

docker compose up -d --build

echo ""
echo "  ✅  Caveau est prêt !"
echo ""
echo "  📱  Ouvrez : http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'NAS_IP'):3000"
echo ""
echo "  📂  Import : déposez JSON+photos dans $CAVE_DATA/inbox/"
echo ""
echo "  🛑  Arrêter  : docker compose down"
echo "  🔄  Relancer : docker compose up -d"
echo ""
