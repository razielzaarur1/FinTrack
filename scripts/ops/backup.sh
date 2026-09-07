#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/finapp/backups"
SECRETS_DIR="/opt/finapp/secrets"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/finapp_backup_${TIMESTAMP}.sql.gz"

DB_HOST="${DB_HOST:-localhost}"
DB_NAME="${DB_NAME:-finance}"
DB_USER="${DB_USER:-finance_admin}"
CONTAINER_NAME="finapp-postgres"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting database backup..."

if command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    docker exec "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" \
        --table=public.users \
        --table=public.bank_accounts \
        --table=public.transactions \
        --clean --if-exists | gzip > "${BACKUP_FILE}"
else
    # Read DB password from secret file if exists and PGPASSWORD is not already set
    if [ -z "${PGPASSWORD:-}" ] && [ -f "${SECRETS_DIR}/db_password.txt" ]; then
        export PGPASSWORD="$(cat "${SECRETS_DIR}/db_password.txt" | tr -d '\r\n')"
    fi

    pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
        --table=public.users \
        --table=public.bank_accounts \
        --table=public.transactions \
        --clean --if-exists | gzip > "${BACKUP_FILE}"
fi

chmod 600 "${BACKUP_FILE}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup successfully created at ${BACKUP_FILE}"

# Delete backups older than 30 days
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Cleaning up backups older than 30 days..."
find "${BACKUP_DIR}" -type f -name "finapp_backup_*.sql.gz" -mtime +30 -delete

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup process completed successfully."
