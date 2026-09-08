import fs from 'node:fs';
import nodeVault from 'node-vault';

function readSecret(filePath, envVarName) {
  if (filePath && fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (content) return content; // Only return non-empty; fall through to env var if file is empty
  }
  if (process.env[envVarName]) {
    return process.env[envVarName].trim();
  }
  return null;
}

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://vault:8200';
const VAULT_TRANSIT_KEY = process.env.VAULT_TRANSIT_KEY || 'bank-credentials';
const ROLE_ID_FILE = process.env.VAULT_ROLE_ID_FILE || '/run/secrets/vault_api_role_id';
const SECRET_ID_FILE = process.env.VAULT_SECRET_ID_FILE || '/run/secrets/vault_api_secret_id';

/**
 * Wraps any promise with a hard timeout.
 * Prevents vault calls from hanging indefinitely when vault is slow or unreachable.
 */
function withTimeout(promise, ms = 10000, label = 'Vault request') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

class VaultClientService {
  constructor() {
    this.vault = nodeVault({
      endpoint: VAULT_ADDR,
      apiVersion: 'v1',
    });
    this.renewalInterval = null;
    this.initialized = false;

    // ── Eagerly load token from environment so encrypt works immediately ──
    // This means we don't need a manual init-auto call after every restart.
    const envToken =
      readSecret('/opt/finapp/secrets/vault_root_token.txt', 'VAULT_TOKEN') ||
      process.env.VAULT_TOKEN;

    if (envToken) {
      this.vault.token = envToken;
      this.initialized = true;
      console.log('[Vault] Token loaded from environment/secrets file at startup.');
    } else {
      console.warn('[Vault] No VAULT_TOKEN found at startup — will attempt AppRole or deferred init.');
    }
  }

  async authenticate() {
    // If we already have a token (from env), skip AppRole entirely
    if (this.vault.token) {
      console.log('[Vault] Token already set; skipping AppRole authentication.');
      return;
    }

    const roleId = readSecret(ROLE_ID_FILE, 'VAULT_ROLE_ID');
    const secretId = readSecret(SECRET_ID_FILE, 'VAULT_SECRET_ID');

    if (!roleId || !secretId) {
      console.warn('[Vault] Role ID or Secret ID not found. Vault authentication skipped or deferred.');
      return;
    }

    try {
      const result = await this.vault.approleLogin({
        role_id: roleId,
        secret_id: secretId,
      });

      this.vault.token = result.auth.client_token;
      this.initialized = true;
      console.log('[Vault] Successfully authenticated via AppRole');

      this.setupTokenRenewal();
    } catch (err) {
      console.error('[Vault] AppRole authentication failed:', err.message);
      throw err;
    }
  }

  setupTokenRenewal() {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
    }

    const RENEWAL_TIME_MS = 50 * 60 * 1000; // 50 minutes
    this.renewalInterval = setInterval(async () => {
      try {
        if (this.vault.token) {
          await this.vault.tokenRenewSelf();
          console.log('[Vault] Token renewed successfully');
        }
      } catch (err) {
        console.error('[Vault] Token renewal error, attempting re-authentication:', err.message);
        try {
          await this.authenticate();
        } catch (reAuthErr) {
          console.error('[Vault] Re-authentication failed:', reAuthErr.message);
        }
      }
    }, RENEWAL_TIME_MS);

    if (this.renewalInterval.unref) {
      this.renewalInterval.unref();
    }
  }

  async encryptCredentials(credentialsObj) {
    // Ensure we have a token — try all fallback sources
    if (!this.vault.token) {
      const fallbackToken =
        readSecret('/opt/finapp/secrets/vault_root_token.txt', 'VAULT_TOKEN') ||
        process.env.VAULT_TOKEN;

      if (fallbackToken) {
        this.vault.token = fallbackToken;
        this.initialized = true;
        console.log('[Vault] Token loaded from fallback in encryptCredentials.');
      } else {
        // Last resort: AppRole
        await this.authenticate();
      }
    }

    if (!this.vault.token) {
      throw new Error(
        'Vault token is not set. Call POST /api/system/vault/init-auto first, or set VAULT_TOKEN environment variable.'
      );
    }

    const plaintext = JSON.stringify(credentialsObj);
    const base64Plaintext = Buffer.from(plaintext, 'utf8').toString('base64');

    try {
      const response = await withTimeout(
        this.vault.write(`transit/encrypt/${VAULT_TRANSIT_KEY}`, {
          plaintext: base64Plaintext,
        }),
        10000,
        'transit/encrypt'
      );

      if (response && response.data && response.data.ciphertext) {
        return response.data.ciphertext;
      }

      throw new Error('Invalid encryption response from Vault Transit');
    } catch (err) {
      console.error('[Vault] encryptCredentials failed:', err.message);
      throw err;
    }
  }

  close() {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = null;
    }
  }
}

export const vaultClient = new VaultClientService();
export default vaultClient;
