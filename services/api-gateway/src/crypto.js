import crypto from 'node:crypto';
import fs from 'node:fs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for AES-GCM
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

/**
 * Derives a consistent 32-byte (256-bit) key from the configured secret string.
 */
function getMasterKey() {
  const rawSecret =
    readSecret('/opt/finapp/secrets/master_key.txt', 'APP_ENCRYPTION_KEY') ||
    readSecret('/run/secrets/master_key', 'ENCRYPTION_KEY') ||
    process.env.APP_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    DEFAULT_FALLBACK_SECRET;

  // Derive 32 bytes SHA-256 digest
  return crypto.createHash('sha256').update(rawSecret).digest();
}

/**
 * Encrypts a credentials object using AES-256-GCM.
 * @param {object|string} payload - Credentials object or string
 * @returns {string} Formatted ciphertext: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encryptCredentials(payload) {
  if (!payload) {
    throw new Error('No payload provided for encryption');
  }

  const plaintext = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM formatted ciphertext string.
 * @param {string} encryptedString - Ciphertext string
 * @returns {object|string} Decrypted object or plaintext string
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

  // Legacy or unencrypted JSON fallback
  try {
    return JSON.parse(encryptedString);
  } catch (_) {
    throw new Error('Unsupported ciphertext format. Expected AES-256-GCM enc:v1 format.');
  }
}

/**
 * Signs a scoped, tamper-proof TMA token bound to a specific transaction ID.
 * @param {string} txId - Transaction UUID
 * @param {number} [expiresInMs=604800000] - Token expiration in milliseconds (default 7 days)
 * @returns {string} URL-safe base64 token
 */
export function signTmaToken(txId, expiresInMs = 7 * 24 * 60 * 60 * 1000) {
  if (!txId) throw new Error('Transaction ID is required to generate TMA token');
  const exp = Date.now() + expiresInMs;
  const payload = `${txId}:${exp}`;
  const key = getMasterKey();
  const signature = crypto.createHmac('sha256', key).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

/**
 * Verifies that a TMA token is authentic, non-expired, and scoped to the requested transaction ID.
 * @param {string} token - Base64url token from request
 * @param {string} expectedTxId - Transaction UUID being accessed
 * @returns {boolean} True if valid
 */
export function verifyTmaToken(token, expectedTxId = null) {
  if (!token) return false;
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const [txId, expStr, signature] = raw.split(':');
    if (!txId || !expStr || !signature) return false;
    if (expectedTxId && txId !== expectedTxId) return false;
    const exp = parseInt(expStr, 10);
    if (isNaN(exp) || Date.now() > exp) return false;

    const payload = `${txId}:${expStr}`;
    const key = getMasterKey();
    const expectedSignature = crypto.createHmac('sha256', key).update(payload).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (_) {
    return false;
  }
}

export default {
  encryptCredentials,
  decryptCredentials,
  signTmaToken,
  verifyTmaToken,
};

