import fs from 'node:fs';
import nodeVault from 'node-vault';

function readSecret(filePath, envVarName) {
  if (filePath && fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim();
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

class VaultClientService {
  constructor() {
    this.vault = nodeVault({
      endpoint: VAULT_ADDR,
      apiVersion: 'v1',
    });
    this.renewalInterval = null;
    this.initialized = false;
  }

  async authenticate() {
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

    // Auto renew every 50 minutes (3,000,000 ms)
    const RENEWAL_TIME_MS = 50 * 60 * 1000;
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
    if (!this.initialized && !this.vault.token) {
      // Check if root token is available in env or secrets file
      const rootToken = readSecret('/opt/finapp/secrets/vault_root_token.txt', 'VAULT_TOKEN');
      if (rootToken) {
        this.vault.token = rootToken;
        this.initialized = true;
      } else {
        await this.authenticate();
      }
    }

    const plaintext = JSON.stringify(credentialsObj);
    const base64Plaintext = Buffer.from(plaintext, 'utf8').toString('base64');

    const response = await this.vault.write(`transit/encrypt/${VAULT_TRANSIT_KEY}`, {
      plaintext: base64Plaintext,
    });

    if (response && response.data && response.data.ciphertext) {
      return response.data.ciphertext;
    }

    throw new Error('Invalid encryption response from Vault Transit');
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
