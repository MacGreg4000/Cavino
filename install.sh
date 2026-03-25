#!/bin/bash
# ──────────────────────────────────────────────
# Caveau — Installation
# ──────────────────────────────────────────────

set -e

echo ""
echo "  🍷  Caveau — Installation"
echo "  ─────────────────────────"
echo ""

# Créer le fichier .env s'il n'existe pas
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Fichier .env créé"
else
    echo "✅ Fichier .env existant conservé"
fi

# Lancer Docker
echo ""
echo "🔨 Construction des images..."
echo ""

docker compose up -d --build

echo ""
echo "  ✅  Caveau est prêt !"
echo ""
echo "  📱  Ouvrez : http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):3000"
echo ""
echo "  📂  Import : déposez JSON+photos dans data/inbox/"
echo ""
echo "  🛑  Arrêter  : docker compose down"
echo "  🔄  Relancer : docker compose up -d"
echo ""
