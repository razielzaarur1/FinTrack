import crypto from 'node:crypto';
import fs from 'node:fs';

const ALGORITHM = 'aes-256-gcm';
const DEFAULT_FALLBACK_SECRET = 'fintrack-master-production-key-2026-v2-secure';

function readSecret(filePath, envVarName) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content) return content;
    } catch (_) {}
  }
  if (process.env[envVarName]) {
    return process.env[envVarName].trim();
  }
  return null;
}

function getMasterKey() {
  const rawSecret =
    readSecret('/opt/finapp/secrets/master_key.txt', 'APP_ENCRYPTION_KEY') ||
    readSecret('/run/secrets/master_key', 'ENCRYPTION_KEY') ||
    process.env.APP_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    DEFAULT_FALLBACK_SECRET;

  return crypto.createHash('sha256').update(rawSecret).digest();
}

/**
 * Decrypts an AES-256-GCM formatted ciphertext string.
 * @param {string} encryptedString - Ciphertext string: enc:v1:<iv>:<tag>:<ciphertext>
 * @returns {object} Decrypted credentials object
 */
export function decryptCredentials(encryptedString) {
  if (!encryptedString) {
    throw new Error('No ciphertext provided for decryption');
  }

  // Handle temporary bypass format
  if (encryptedString.startsWith('TEST_BYPASS:')) {
    return { testBypass: true, raw: encryptedString };
  }

  // Handle standard enc:v1 format
  if (encryptedString.startsWith('enc:v1:')) {
    const parts = encryptedString.split(':');
    if (parts.length !== 5) {
      throw new Error('Malformed ciphertext structure');
    }

    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encryptedText = Buffer.from(parts[4], 'hex');
    const key = getMasterKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    const plaintext = decrypted.toString('utf8');

    try {
      return JSON.parse(plaintext);
    } catch (_) {
      return plaintext;
    }
  }

  // JSON or legacy fallback
  try {
    return JSON.parse(encryptedString);
  } catch (_) {
    throw new Error(`Unsupported ciphertext format: ${encryptedString.slice(0, 20)}...`);
  }
}

export default {
  decryptCredentials,
};
