#!/bin/sh
set -e

# Fix volume permissions for persistent data and audit logs
mkdir -p /vault/data /vault/logs /opt/finapp/secrets
chown -R vault:vault /vault/data /vault/logs /opt/finapp/secrets 2>/dev/null || true
chmod -R 775 /vault/data /vault/logs /opt/finapp/secrets 2>/dev/null || true

# Auto-unseal in background when vault server starts
(
  sleep 3
  export VAULT_ADDR='http://127.0.0.1:8200'
  vault operator unseal otrmDuCE+VOc0ngzQTsAXK5bfTipDBsj5Vlo+osKkZwv 2>/dev/null || true
  vault operator unseal EUj616rjoNZIYu+Db7M9efYu2NqJwpaREuee7vy810NA 2>/dev/null || true
) &

# If running as root, switch to vault user via su-exec
if [ "$(id -u)" = '0' ]; then
    exec su-exec vault "$@"
fi

exec "$@"
