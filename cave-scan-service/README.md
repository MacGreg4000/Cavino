# Cave Scan Service

Service Docker autonome pour l'analyse automatique d'étiquettes de vin.

**Flux** : Photo déposée → Ollama (qwen2.5vl:7b) → SearXNG → JSON + photo officielle → import PostgreSQL

---

## Prérequis Ubuntu (à faire une seule fois)

### 1. Installer le modèle vision

```bash
ollama pull qwen2.5vl:7b
```

### 2. Ouvrir Ollama sur le réseau

Si Ollama tourne via **systemd** :

```bash
sudo systemctl edit ollama
```

Ajouter dans la section `[Service]` :

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

Si Ollama tourne via **Docker** — dans votre `docker-compose.yml` Ollama :

```yaml
environment:
  - OLLAMA_HOST=0.0.0.0:11434
ports:
  - "11434:11434"
```

### 3. Ouvrir les ports sur le routeur

| Port | Service |
|------|---------|
| 11434 | Ollama |
| 8888 | SearXNG |

Faire pointer ces ports vers l'IP locale de l'Ubuntu.

### 4. Configurer SearXNG pour les requêtes JSON

Dans `settings.yml` de SearXNG, vérifier :

```yaml
search:
  formats:
    - html
    - json   # ← obligatoire
```

Redémarrer SearXNG après modification.

### 5. Vérifier l'accès depuis l'extérieur

```bash
# Depuis le NAS ou n'importe quelle machine externe
curl http://macciolupo.tplinkdns.com:11434/api/tags
curl "http://macciolupo.tplinkdns.com:8888/search?q=test&format=json&categories=images"
```

---

## Déploiement sur le NAS Synology

### 1. Créer les dossiers

Via DSM ou SSH sur le NAS :

```bash
mkdir -p /volume1/docker/cavino/data/inbox/A\ analyser
mkdir -p /volume1/docker/cavino/data/inbox/Prêt\ à\ être\ importé
mkdir -p /volume1/docker/cavino/data/inbox/importé
```

### 2. Copier les fichiers sur le NAS

```bash
scp -r cave-scan-service/ user@nas-ip:/volume1/docker/cavino/
```

### 3. Builder et démarrer

```bash
ssh user@nas-ip
cd /volume1/docker/cavino/cave-scan-service
docker compose build
docker compose up -d
```

### 4. Vérifier les logs

```bash
docker logs -f cave-scan
```

Vous devriez voir :

```
✅ Ollama OK — modèle qwen2.5vl:7b disponible
👁️  Surveillance active: /data/cave/A analyser
```

---

## Utilisation

1. Déposer une ou plusieurs photos d'étiquettes dans **`A analyser/`**
   - Depuis iPhone via l'app Fichiers (SMB)
   - Depuis Finder sur Mac (SMB)
   - Formats supportés : HEIC, JPG, PNG, WebP

2. Le service détecte automatiquement les nouvelles photos (délai 3s)

3. Après traitement, les fichiers apparaissent dans **`Prêt à être importé/`** :
   - `2026-04-05_chateau-pichon-baron-2018.json`
   - `2026-04-05_chateau-pichon-baron-2018.jpg` (si photo officielle trouvée)

4. Le watcher Cavino existant importe automatiquement dans PostgreSQL

5. Les photos originales sont **supprimées** du dossier source après traitement réussi

---

## Regroupement recto/verso

Les photos sont automatiquement groupées en paires selon ces règles :

| Exemple | Résultat |
|---------|----------|
| `photo_1.jpg` + `photo_2.jpg` | → groupe |
| `etiquette_a.jpg` + `etiquette_b.jpg` | → groupe |
| `IMG_0045.jpg` + `IMG_0046.jpg` | → groupe (numéros consécutifs) |
| `front.jpg` + `back.jpg` | → groupe |

En cas de doute, les photos sont traitées séparément.

---

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `OLLAMA_URL` | `http://macciolupo.tplinkdns.com:11434` | URL Ollama |
| `OLLAMA_MODEL` | `qwen2.5vl:7b` | Modèle vision |
| `SEARXNG_URL` | `http://macciolupo.tplinkdns.com:8888` | URL SearXNG |
| `CAVE_BASE_DIR` | `/data/cave` | Dossier racine (interne container) |
| `SETTLE_DELAY` | `3.0` | Délai stabilisation en secondes |

---

## Rapport de traitement (exemple)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Traitement terminé — 2 bouteille(s) / 3 photo(s)
  [1/2] ✅ 🟢 Château Pichon Baron 2018
         🖼️  officielle → 2026-04-05_chateau-pichon-baron-2018.json
  [2/2] ✅ 🟡 Moët & Chandon Brut NV
         🖼️  officielle → 2026-04-05_moet-chandon-brut-nv.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Cas d'erreur

| Situation | Comportement |
|-----------|-------------|
| Timeout Ollama | Originaux préservés, erreur loggée |
| JSON invalide | Originaux préservés, raw response loggée |
| Aucune photo officielle | JSON seul déposé, note dans `meta.notes` |
| Modèle Ollama absent | Warning au démarrage, traitement quand même tenté |
| Photo HEIC sans libheif | Erreur loggée, fichier ignoré |

---

## Commandes utiles

```bash
# Voir les logs en temps réel
docker logs -f cave-scan

# Redémarrer le service
docker compose restart cave-scan

# Rebuilder après mise à jour
docker compose build && docker compose up -d

# Tester manuellement Ollama
curl http://macciolupo.tplinkdns.com:11434/api/tags | jq .

# Tester SearXNG
curl "http://macciolupo.tplinkdns.com:8888/search?q=pichon+baron+bottle&format=json&categories=images" | jq '.results[0]'
```
