#!/bin/sh
set -e
cd /app/services/api
echo "Running migrations..."
node dist/infrastructure/db/migrate.js
echo "Seeding bootstrap user (idempotent)..."
node dist/infrastructure/db/seed.js
echo "Starting API..."
exec node dist/index.js
