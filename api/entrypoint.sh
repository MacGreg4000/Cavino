#!/bin/sh
echo "🔄 Syncing database schema..."
npx drizzle-kit push --force
echo "✅ Database ready"
exec node dist/index.js
