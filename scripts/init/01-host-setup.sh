#!/usr/bin/env bash
set -euo pipefail

echo "==> [1/6] Installing required host packages..."
apt-get update && apt-get install -y jq curl openssl

echo "==> [2/6] Disabling swap..."
swapoff -a
sed -i.bak -r 's/(^.*\sswap\s+.*$)/# \1/' /etc/fstab || true

echo "==> [3/6] Applying kernel hardening and limits..."
cat << 'EOF' > /etc/sysctl.d/99-security.conf
fs.suid_dumpable=0
kernel.core_uses_pid=1
EOF
sysctl --system || true

cat << 'EOF' >> /etc/security/limits.conf
* hard core 0
* soft core 0
EOF

echo "==> [4/6] Creating application directories..."
mkdir -p /opt/finapp/secrets
mkdir -p /opt/finapp/backups
mkdir -p /opt/finapp/certs

chmod 700 /opt/finapp/secrets
chmod 755 /opt/finapp/backups
chmod 755 /opt/finapp/certs

echo "==> [5/6] Generating SSL certificate for Nginx..."
CERT_GENERATED=false

# If Tailscale is running on the host, generate real TLS certificate directly
if command -v tailscale &> /dev/null; then
    TS_STATUS=$(tailscale status --json 2>/dev/null || true)
    TS_DOMAIN=$(echo "$TS_STATUS" | jq -r '.Self.DNSName // empty' | sed 's/\.$//' || true)
    if [ -n "$TS_DOMAIN" ]; then
        echo "    Detected Host Tailscale domain: ${TS_DOMAIN}. Generating Tailscale SSL cert..."
        if tailscale cert --cert-file /opt/finapp/certs/server.crt --key-file /opt/finapp/certs/server.key "${TS_DOMAIN}"; then
            chmod 600 /opt/finapp/certs/server.key
            chmod 644 /opt/finapp/certs/server.crt
            CERT_GENERATED=true
            echo "    Successfully generated Tailscale TLS certificate for ${TS_DOMAIN}"
        fi
    fi
fi

if [ "$CERT_GENERATED" = false ] && ([ ! -f /opt/finapp/certs/server.crt ] || [ ! -f /opt/finapp/certs/server.key ]); then
    echo "    Generating placeholder SSL certificate..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /opt/finapp/certs/server.key \
        -out /opt/finapp/certs/server.crt \
        -subj "/CN=finapp.local"
    chmod 600 /opt/finapp/certs/server.key
    chmod 644 /opt/finapp/certs/server.crt
fi

echo "==> [6/6] Initializing secret files..."
# If .env exists in current working directory, source it
if [ -f ".env" ]; then
    echo "    Found .env file; loading initial environment variables..."
    set -a
    source .env
    set +a
fi

declare -A INITIAL_ENV_MAP=(
    ["db_password"]="${DB_PASSWORD:-}"
    ["api_db_password"]="${API_DB_PASSWORD:-}"
    ["scraper_db_password"]="${SCRAPER_DB_PASSWORD:-}"
    ["telegram_token"]="${TELEGRAM_BOT_TOKEN:-}"
    ["telegram_chat_id"]="${TELEGRAM_CHAT_ID:-}"
)

ALL_SECRETS=(
    "db_password"
    "api_db_password"
    "scraper_db_password"
    "telegram_token"
    "telegram_chat_id"
    "scraper_role_id"
    "scraper_secret_id"
    "vault_api_role_id"
    "vault_api_secret_id"
    "notifier_role_id"
    "notifier_secret_id"
    "vault_unseal_key1"
)

for secret_name in "${ALL_SECRETS[@]}"; do
    target_path="/opt/finapp/secrets/${secret_name}.txt"
    val="${INITIAL_ENV_MAP[$secret_name]:-}"
    
    if [ -n "$val" ]; then
        echo "$val" > "${target_path}"
        echo "    Populated ${target_path} from environment variable"
    elif [ ! -f "${target_path}" ]; then
        touch "${target_path}"
    fi
    chmod 600 "${target_path}"
done

echo "==> Host setup completed successfully."
