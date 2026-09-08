import { decryptCredentials } from './crypto.js';

export async function getVaultClient() {
  return { vault: {}, token: 'builtin-crypto' };
}

export async function decryptCredentials(tokenOrVault, ciphertext) {
  // If called as decryptCredentials(ciphertext)
  const actualCiphertext = typeof tokenOrVault === 'string' && !ciphertext ? tokenOrVault : ciphertext;
  return decryptCredentials(actualCiphertext);
}

export default {
  getVaultClient,
  decryptCredentials,
};
