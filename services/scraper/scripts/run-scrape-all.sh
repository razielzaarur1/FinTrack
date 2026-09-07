#!/usr/bin/env bash
set -eo pipefail

API_GATEWAY_URL="${API_GATEWAY_URL:-http://api-gateway:3000}"
FETCH_URL="${API_GATEWAY_URL}/internal/accounts-for-scraping"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Scraper-Runner] Fetching accounts for scraping from ${FETCH_URL}..."

# Fetch accounts from internal API Gateway endpoint
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 30 "${FETCH_URL}" || true)
HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n1)

if [ "$HTTP_STATUS" != "200" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Scraper-Runner] ERROR: Failed to fetch accounts. HTTP Status: ${HTTP_STATUS}, Response: ${HTTP_BODY}"
  exit 1
fi

ACCOUNTS="$HTTP_BODY"
TOTAL_ACCOUNTS=$(echo "$ACCOUNTS" | jq -r 'if type=="array" then length else 0 end')

if [ "$TOTAL_ACCOUNTS" -eq 0 ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Scraper-Runner] No accounts found to scrape. Exiting."
  exit 0
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Scraper-Runner] Found ${TOTAL_ACCOUNTS} account(s) to scrape. Starting sequential execution..."

echo "$ACCOUNTS" | jq -c '.[]' | while IFS= read -r account; do
  export ACCOUNT_ID=$(echo "$account" | jq -r '.id // .accountId')
  export BANK=$(echo "$account" | jq -r '.bankCompany // .bank_company // .bank // .companyId')
  export ENCRYPTED_CREDS=$(echo "$account" | jq -r '.encryptedCredentials // .encrypted_creds // .encryptedCreds')

  if [ -z "$ACCOUNT_ID" ] || [ "$ACCOUNT_ID" = "null" ]; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Scraper-Runner] Skipping invalid account object: $account"
    continue
  fi

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Scraper-Runner] >>> Processing Account ID: ${ACCOUNT_ID} (Bank: ${BANK}) <<<"

  # Run scraper for this account and handle errors without terminating the whole loop
  if node /app/src/scrape-single.js; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Scraper-Runner] Successfully completed scraping for account: ${ACCOUNT_ID}"
  else
    EXIT_CODE=$?
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Scraper-Runner] Scraping failed for account: ${ACCOUNT_ID} (Exit code: ${EXIT_CODE})"
  fi

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Scraper-Runner] Waiting 5 seconds before next account..."
  sleep 5
done

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Scraper-Runner] Finished scraping all accounts."
