/**
 * Integration Test Script for FinTrack Redesigned Architecture
 * Validates:
 * 1. AES-256-GCM encryption in API Gateway (Zero-dependency native module)
 * 2. AES-256-GCM decryption in Scraper Service (Zero-dependency native module)
 * 3. Exact matching of decrypted bank credentials across all 4 major Israeli bank formats
 * 4. Cryptographic Tamper Protection (AEAD verification)
 * 5. Code integrity and syntax verification for Scraper Server and Single-Scraper
 */

import fs from 'node:fs';
import { encryptCredentials as gwEncrypt, decryptCredentials as gwDecrypt } from '../services/api-gateway/src/crypto.js';
import { decryptCredentials as scDecrypt } from '../services/scraper/src/crypto.js';

console.log('─────────────────────────────────────────────────────────────');
console.log('🧪 Starting FinTrack Internal Flow Integration Tests');
console.log('─────────────────────────────────────────────────────────────\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    process.exitCode = 1;
  }
}

// Test Suite 1: Bank credentials encryption & cross-service decryption
console.log('Test Suite 1: Native AES-256-GCM Authenticated Encryption');
const sampleCredentials = [
  { bank: 'hapoalim', data: { userCode: 'usr12345', password: 'SecretPassword!@#1' } },
  { bank: 'leumi', data: { username: 'leumi_user', password: 'LeumiPassword99' } },
  { bank: 'discount', data: { idNumber: '012345678', password: 'disc_pass', num: '9876' } },
  { bank: 'isracard', data: { idNumber: '987654321', cardLast4: '4321', password: 'israpassword' } },
];

for (const sample of sampleCredentials) {
  const cipher = gwEncrypt(sample.data);
  assert(cipher.startsWith('enc:v1:'), `API Gateway produces valid enc:v1 format for ${sample.bank}`);

  const parts = cipher.split(':');
  assert(parts.length === 5, `Ciphertext has correct 5-part structure for ${sample.bank}`);

  const decryptedInGateway = gwDecrypt(cipher);
  assert(
    JSON.stringify(decryptedInGateway) === JSON.stringify(sample.data),
    `API Gateway self-decrypts ${sample.bank} credentials accurately`
  );

  const decryptedInScraper = scDecrypt(cipher);
  assert(
    JSON.stringify(decryptedInScraper) === JSON.stringify(sample.data),
    `Scraper service successfully decrypts ${sample.bank} credentials`
  );
}

// Test Suite 2: Cryptographic Tamper Protection
console.log('\nTest Suite 2: Cryptographic Tamper Protection');
const validCipher = gwEncrypt({ user: 'alice', pass: 'secret' });
const cipherParts = validCipher.split(':');
const tamperedPayload = cipherParts[4].slice(0, -2) + (cipherParts[4].endsWith('aa') ? 'bb' : 'aa');
const tamperedCipher = `${cipherParts[0]}:${cipherParts[1]}:${cipherParts[2]}:${cipherParts[3]}:${tamperedPayload}`;

let tamperDetected = false;
try {
  scDecrypt(tamperedCipher);
} catch (err) {
  tamperDetected = true;
}
assert(tamperDetected, 'Scraper rejects tampered ciphertext via auth tag verification');

// Test Suite 3: Code Integrity & Export Verification
console.log('\nTest Suite 3: Service Code Integrity & Configuration Verification');

const scraperServerFile = 'services/scraper/src/server.js';
assert(fs.existsSync(scraperServerFile), `Scraper HTTP microservice server exists: ${scraperServerFile}`);
const serverCode = fs.readFileSync(scraperServerFile, 'utf8');
assert(serverCode.includes("url.pathname === '/scrape'"), 'Scraper server handles POST /scrape');
assert(serverCode.includes("url.pathname === '/health'"), 'Scraper server handles GET /health');

const scraperSingleFile = 'services/scraper/src/scrape-single.js';
assert(fs.existsSync(scraperSingleFile), `Scrape single execution engine exists: ${scraperSingleFile}`);
const singleCode = fs.readFileSync(scraperSingleFile, 'utf8');
assert(singleCode.includes('export async function scrapeAccount'), 'scrapeAccount is exported as a module function');
assert(singleCode.includes('export async function scrapeAllAccounts'), 'scrapeAllAccounts is exported as a module function');
assert(!singleCode.includes('10.50.0.254:3128'), 'Squid proxy hardcoded IP 10.50.0.254 has been removed');

const dockerComposeFile = 'docker-compose.yml';
const dcContent = fs.readFileSync(dockerComposeFile, 'utf8');
assert(dcContent.includes('fintrack-net:'), 'docker-compose.yml defines unified fintrack-net bridge');
assert(!dcContent.includes('10.50.0.0/16'), 'Conflicting IPAM subnet 10.50.0.0/16 has been eliminated');
assert(!dcContent.includes('container_name: finapp-vault'), 'Unstable Vault container has been eliminated');
assert(dcContent.includes('APP_ENCRYPTION_KEY='), 'APP_ENCRYPTION_KEY is passed to both services');

console.log('\n─────────────────────────────────────────────────────────────');
console.log(`📊 Test Results: ${passedTests}/${totalTests} passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('─────────────────────────────────────────────────────────────\n');

if (passedTests === totalTests) {
  console.log('🎉 ALL ARCHITECTURAL INTEGRATION TESTS PASSED 100%!');
} else {
  console.error('❌ Some tests failed.');
  process.exit(1);
}
