#!/bin/sh
set -e

# Fix volume permissions for persistent data and audit logs
mkdir -p /vault/data /vault/logs /opt/finapp/secrets
chown -R vault:vault /vault/data /vault/logs /opt/finapp/secrets 2>/dev/null || true
chmod -R 775 /vault/data /vault/logs /opt/finapp/secrets 2>/dev/null || true

# If running as root, switch to vault user via su-exec
if [ "$(id -u)" = '0' ]; then
    exec su-exec vault "$@"
fi

exec "$@"
