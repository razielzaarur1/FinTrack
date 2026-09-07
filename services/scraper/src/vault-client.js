import NodeVault from 'node-vault';
import fs from 'node:fs';
import { logger } from './logger.js';

function readSecret(filePath, envVar) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (err) {
      logger.warn({ err, filePath }, `Failed to read secret file: ${filePath}`);
    }
  }
  if (process.env[envVar]) {
    return process.env[envVar].trim();
  }
  return null;
}

/**
 * Initializes and logs in to Vault using AppRole authentication
 * @returns {Promise<{ vault: object, token: string }>}
 */
export async function getVaultClient() {
  const endpoint = process.env.VAULT_ADDR || 'http://vault:8200';
  const vault = NodeVault({
    apiVersion: 'v1',
    endpoint: endpoint
  });

  const staticToken = process.env.VAULT_TOKEN;
  if (staticToken) {
    vault.token = staticToken;
    return { vault, token: staticToken };
  }

  const roleIdFile = process.env.VAULT_ROLE_ID_FILE || '/run/secrets/scraper_role_id';
  const secretIdFile = process.env.VAULT_SECRET_ID_FILE || '/run/secrets/scraper_secret_id';

  const roleId = readSecret(roleIdFile, 'VAULT_ROLE_ID');
  const secretId = readSecret(secretIdFile, 'VAULT_SECRET_ID');

  if (!roleId || !secretId) {
    throw new Error(`Vault AppRole credentials missing. Checked ${roleIdFile} and ${secretIdFile}`);
  }

  logger.debug({ endpoint }, 'Logging into Vault via AppRole...');
  const result = await vault.approleLogin({
    role_id: roleId,
    secret_id: secretId
  });

  const clientToken = result.auth.client_token;
  vault.token = clientToken;
  logger.info('Successfully authenticated with Vault via AppRole');

  return { vault, token: clientToken };
}

/**
 * Decrypts encrypted credentials using Vault Transit engine
 * @param {string|object} tokenOrVault - Vault token string or NodeVault instance
 * @param {string} ciphertext - Encrypted ciphertext from database
 * @returns {Promise<object>} Parsed credentials object
 */
export async function decryptCredentials(tokenOrVault, ciphertext) {
  if (!ciphertext) {
    throw new Error('No ciphertext provided for decryption');
  }

  let vault;
  if (typeof tokenOrVault === 'string') {
    const endpoint = process.env.VAULT_ADDR || 'http://vault:8200';
    vault = NodeVault({
      apiVersion: 'v1',
      endpoint: endpoint,
      token: tokenOrVault
    });
  } else if (tokenOrVault && typeof tokenOrVault.write === 'function') {
    vault = tokenOrVault;
  } else {
    const clientInfo = await getVaultClient();
    vault = clientInfo.vault;
  }

  const transitKey = process.env.VAULT_TRANSIT_KEY || 'bank-credentials';

  logger.debug({ transitKey }, 'Decrypting credentials via Vault Transit...');

  try {
    const response = await vault.write(`transit/decrypt/${transitKey}`, {
      ciphertext: ciphertext
    });

    if (!response || !response.data || !response.data.plaintext) {
      throw new Error('Invalid response structure from Vault Transit decrypt');
    }

    const decodedPlaintext = Buffer.from(response.data.plaintext, 'base64').toString('utf8');
    const parsedCredentials = JSON.parse(decodedPlaintext);
    return parsedCredentials;
  } catch (err) {
    // If decryption fails, log error and rethrow
    logger.error({ err: err.message, transitKey }, 'Failed to decrypt credentials with Vault');
    throw err;
  }
}

export default {
  getVaultClient,
  decryptCredentials
};
