#!/bin/sh
# Sauvegarde automatique de la base PostgreSQL
BACKUP_DIR=/backups
DATE=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/caveau_$DATE.sql.gz"

mkdir -p "$BACKUP_DIR"
pg_dump -h postgres -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$FILE"
echo "✅ Backup: $FILE"

# Conserver uniquement les 30 derniers backups
ls -t "$BACKUP_DIR"/caveau_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm
