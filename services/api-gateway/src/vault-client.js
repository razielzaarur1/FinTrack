import { encryptCredentials, decryptCredentials } from './crypto.js';

/**
 * VaultClientService compatibility layer.
 * Delegates all encryption directly to native AES-256-GCM crypto.
 * Prevents any crashes or hangs from missing Vault instances.
 */
class VaultClientService {
  constructor() {
    this.initialized = true;
    this.vault = { token: 'builtin-crypto-active' };
  }

  async authenticate() {
    // No-op: crypto uses application-level master key
    return;
  }

  setupTokenRenewal() {
    // No-op
  }

  async encryptCredentials(credentialsObj) {
    return encryptCredentials(credentialsObj);
  }

  async decryptCredentials(ciphertext) {
    return decryptCredentials(ciphertext);
  }

  close() {
    // No-op
  }
}

export const vaultClient = new VaultClientService();
export default vaultClient;
