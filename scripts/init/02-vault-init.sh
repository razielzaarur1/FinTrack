#!/usr/bin/env bash
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
export VAULT_ADDR

SECRETS_DIR="/opt/finapp/secrets"
mkdir -p "${SECRETS_DIR}"

echo "===> Waiting for Vault service to become available at ${VAULT_ADDR}..."
until curl -s -m 2 "${VAULT_ADDR}/v1/sys/health" > /dev/null 2>&1 || [ "$(curl -s -o /dev/null -w "%{http_code}" "${VAULT_ADDR}/v1/sys/health")" -eq 501 ] || [ "$(curl -s -o /dev/null -w "%{http_code}" "${VAULT_ADDR}/v1/sys/health")" -eq 503 ]; do
  echo "Waiting for Vault..."
  sleep 2
done

echo "===> Checking Vault initialization status..."
INIT_STATUS=$(curl -s "${VAULT_ADDR}/v1/sys/init" | grep -o '"initialized":[^,]*' | awk -F: '{print $2}' | tr -d ' ' || true)

if [ "${INIT_STATUS}" != "true" ]; then
  echo "===> Initializing Vault with 2-of-2 Shamir keys..."
  INIT_OUTPUT=$(vault operator init -key-shares=2 -key-threshold=2 -format=json)

  UNSEAL_KEY_1=$(echo "${INIT_OUTPUT}" | jq -r '.unseal_keys_b64[0]')
  UNSEAL_KEY_2=$(echo "${INIT_OUTPUT}" | jq -r '.unseal_keys_b64[1]')
  ROOT_TOKEN=$(echo "${INIT_OUTPUT}" | jq -r '.root_token')

  # Write Key 1 to secrets directory
  echo "${UNSEAL_KEY_1}" > "${SECRETS_DIR}/vault_unseal_key1.txt"
  chmod 400 "${SECRETS_DIR}/vault_unseal_key1.txt"

  echo "============================================================"
  echo "VAULT INITIALIZATION COMPLETE"
  echo "------------------------------------------------------------"
  echo "Unseal Key 1 saved to: ${SECRETS_DIR}/vault_unseal_key1.txt"
  echo "Unseal Key 2 (SAVE THIS SECURELY): ${UNSEAL_KEY_2}"
  echo "Root Token   (SAVE THIS SECURELY): ${ROOT_TOKEN}"
  echo "============================================================"

  export VAULT_TOKEN="${ROOT_TOKEN}"
  echo "${ROOT_TOKEN}" > "${SECRETS_DIR}/vault_root_token.txt"
  chmod 400 "${SECRETS_DIR}/vault_root_token.txt"

  echo "===> Unsealing Vault using Key 1 and Key 2..."
  vault operator unseal "${UNSEAL_KEY_1}"
  vault operator unseal "${UNSEAL_KEY_2}"
else
  echo "===> Vault is already initialized."
  if [ -f "${SECRETS_DIR}/vault_root_token.txt" ]; then
    export VAULT_TOKEN="$(cat "${SECRETS_DIR}/vault_root_token.txt")"
  fi
fi

# Ensure Vault is unsealed if sealed
SEAL_STATUS=$(curl -s "${VAULT_ADDR}/v1/sys/seal-status" | grep -o '"sealed":[^,]*' | awk -F: '{print $2}' | tr -d ' ' || true)
if [ "${SEAL_STATUS}" = "true" ]; then
  echo "===> Vault is sealed. Unsealing with Key 1..."
  if [ -f "${SECRETS_DIR}/vault_unseal_key1.txt" ]; then
    vault operator unseal "$(cat "${SECRETS_DIR}/vault_unseal_key1.txt")" || true
  fi
fi

echo "===> Enabling Audit Logging..."
vault audit enable file file_path=/vault/logs/vault_audit.log 2>/dev/null || true

echo "===> Enabling AppRole authentication engine..."
vault auth enable approle 2>/dev/null || true

echo "===> Enabling Transit secrets engine..."
vault secrets enable transit 2>/dev/null || true

echo "===> Creating Transit encryption key for bank credentials..."
vault write -f transit/keys/bank-credentials 2>/dev/null || true

echo "===> Writing ACL Policies..."
vault policy write scraper-policy  ./config/vault/policies/scraper-policy.hcl
vault policy write api-policy      ./config/vault/policies/api-policy.hcl
vault policy write notifier-policy ./config/vault/policies/notifier-policy.hcl

echo "===> Configuring AppRoles..."
# Scraper worker AppRole - bound to CIDR 10.50.0.0/16
vault write auth/approle/role/scraper-worker \
    secret_id_bound_cidrs="10.50.0.0/16" \
    token_bound_cidrs="10.50.0.0/16" \
    token_policies="scraper-policy" \
    token_ttl=1h \
    token_max_ttl=4h

# API Gateway AppRole
vault write auth/approle/role/api-gateway \
    token_policies="api-policy" \
    token_ttl=1h \
    token_max_ttl=4h

# Notifier AppRole
vault write auth/approle/role/notifier \
    token_policies="notifier-policy" \
    token_ttl=1h \
    token_max_ttl=4h

echo "===> Extracting Role IDs and generating Secret IDs..."
# Scraper
vault read -field=role_id auth/approle/role/scraper-worker/role-id > "${SECRETS_DIR}/scraper_role_id.txt"
vault write -f -field=secret_id auth/approle/role/scraper-worker/secret-id > "${SECRETS_DIR}/scraper_secret_id.txt"

# API Gateway
vault read -field=role_id auth/approle/role/api-gateway/role-id > "${SECRETS_DIR}/vault_api_role_id.txt"
vault write -f -field=secret_id auth/approle/role/api-gateway/secret-id > "${SECRETS_DIR}/vault_api_secret_id.txt"
cp "${SECRETS_DIR}/vault_api_role_id.txt" "${SECRETS_DIR}/api_role_id.txt"
cp "${SECRETS_DIR}/vault_api_secret_id.txt" "${SECRETS_DIR}/api_secret_id.txt"

# Notifier
vault read -field=role_id auth/approle/role/notifier/role-id > "${SECRETS_DIR}/notifier_role_id.txt"
vault write -f -field=secret_id auth/approle/role/notifier/secret-id > "${SECRETS_DIR}/notifier_secret_id.txt"

echo "===> Setting permissions to 400 on all secret files..."
chmod 400 "${SECRETS_DIR}"/*

echo "===> Vault initialization and configuration complete!"
