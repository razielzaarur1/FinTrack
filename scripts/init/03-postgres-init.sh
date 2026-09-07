#!/usr/bin/env bash
set -euo pipefail

# If .env exists in current working directory, source it
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

DB_USER="${POSTGRES_USER:-finance_admin}"
DB_NAME="${POSTGRES_DB:-finance}"
CONTAINER_NAME="finapp-postgres"

# Read passwords from environment variables or secret files
API_PASS="${API_DB_PASSWORD:-}"
if [ -z "$API_PASS" ] && [ -f "/opt/finapp/secrets/api_db_password.txt" ]; then
    API_PASS=$(cat /opt/finapp/secrets/api_db_password.txt)
fi

SCRAPER_PASS="${SCRAPER_DB_PASSWORD:-}"
if [ -z "$SCRAPER_PASS" ] && [ -f "/opt/finapp/secrets/scraper_db_password.txt" ]; then
    SCRAPER_PASS=$(cat /opt/finapp/secrets/scraper_db_password.txt)
fi

if [ -z "$API_PASS" ] || [ -z "$SCRAPER_PASS" ]; then
    echo "ERROR: API_DB_PASSWORD and SCRAPER_DB_PASSWORD must be provided as env vars or in /opt/finapp/secrets/"
    exit 1
fi

echo "===> Applying PostgreSQL schema to ${CONTAINER_NAME}..."
docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" < scripts/init/03-postgres-init.sql

echo "===> Configuring database role passwords for api_user and scraper_user..."
docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" << EOF
ALTER ROLE api_user WITH PASSWORD '${API_PASS}';
ALTER ROLE scraper_user WITH PASSWORD '${SCRAPER_PASS}';
EOF

echo "===> PostgreSQL initialization complete!"
