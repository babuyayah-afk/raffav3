'use strict';

const crypto = require('node:crypto');
const argon2 = require('argon2');
const QRCode = require('qrcode');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PASSWORD_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidUsername(value) {
  return typeof value === 'string' && /^[a-z0-9._-]{3,32}$/.test(value);
}

function isValidPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}

function hashPassword(password) {
  return argon2.hash(password, PASSWORD_OPTIONS);
}

function verifyPassword(passwordHash, password) {
  return argon2.verify(passwordHash, password);
}

function getEncryptionKey() {
  const key = Buffer.from(process.env.RAFA_AUTH_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('RAFA_AUTH_ENCRYPTION_KEY must decode to 32 bytes.');
  return key;
}

function encryptTotpSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptTotpSecret(value) {
  const [ivValue, tagValue, encryptedValue] = String(value || '').split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Stored authenticator secret is invalid.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivValue, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function encodeBase32(buffer) {
  let accumulator = 0;
  let bits = 0;
  let output = '';
  for (const byte of buffer) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  const normalized = value.replace(/=+$/g, '').toUpperCase();
  let accumulator = 0;
  let bits = 0;
  const output = [];
  for (const character of normalized) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error('Authenticator secret is invalid.');
    accumulator = (accumulator << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function createTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function createTotpCode(secret, timestamp = Date.now()) {
  const counter = BigInt(Math.floor(timestamp / 30000));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);
  return String(binary % 1000000).padStart(6, '0');
}

function findTotpStep(secret, token, timestamp = Date.now(), lastAcceptedStep = -1) {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) return null;
  const supplied = Buffer.from(token);
  for (const offset of [-30000, 0, 30000]) {
    const step = Math.floor((timestamp + offset) / 30000);
    if (step <= lastAcceptedStep) continue;
    const expected = Buffer.from(createTotpCode(secret, timestamp + offset));
    if (crypto.timingSafeEqual(supplied, expected)) return step;
  }
  return null;
}

function verifyTotpCode(secret, token, timestamp = Date.now()) {
  return findTotpStep(secret, token, timestamp) !== null;
}

function createTotpUri(username, secret) {
  const issuer = 'RaFFA Events';
  const label = encodeURIComponent(`${issuer}:${username}`);
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30'
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

function createTotpQrCode(uri) {
  return QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 2, width: 220 });
}

function createRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

function hashRecoveryCode(code) {
  const normalized = String(code || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

module.exports = {
  createRecoveryCodes,
  createTotpCode,
  createTotpQrCode,
  createTotpSecret,
  createTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  findTotpStep,
  hashPassword,
  hashRecoveryCode,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  verifyPassword,
  verifyTotpCode
};
