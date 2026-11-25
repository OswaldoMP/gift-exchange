'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ENC_PREFIX = 'enc:v1:';

function loadKeyFromEnvOrFile(dbPath) {
  const envKey = process.env.DATA_ENCRYPTION_KEY;
  if (envKey && envKey.trim()) {
    return crypto.createHash('sha256').update(envKey.trim()).digest();
  }

  if (dbPath === ':memory:') {
    return crypto.randomBytes(32);
  }

  const keyFilePath = path.join(path.dirname(dbPath), '.encryption.key');
  fs.mkdirSync(path.dirname(keyFilePath), { recursive: true });

  if (fs.existsSync(keyFilePath)) {
    const hex = fs.readFileSync(keyFilePath, 'utf8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
      return Buffer.from(hex, 'hex');
    }
  }

  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyFilePath, generated.toString('hex'), { mode: 0o600 });
  return generated;
}

function createCryptoContext(dbPath) {
  const key = loadKeyFromEnvOrFile(dbPath);

  function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith(ENC_PREFIX);
  }

  function encrypt(plainText) {
    if (plainText === null || plainText === undefined) {
      return '';
    }
    const str = String(plainText);
    if (str === '') {
      return '';
    }
    if (isEncrypted(str)) {
      return str;
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  function decrypt(value) {
    if (value === null || value === undefined) {
      return '';
    }
    const str = String(value);
    if (!isEncrypted(str)) {
      return str;
    }
    const parts = str.slice(ENC_PREFIX.length).split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted payload');
    }
    const [ivHex, authTagHex, cipherHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  function blindIndex(value) {
    return crypto
      .createHmac('sha256', key)
      .update(String(value || '').trim().toLowerCase())
      .digest('hex');
  }

  function hashToken(rawToken) {
    return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
  }

  function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  function verifyPassword(password, storedHash) {
    if (!storedHash || !storedHash.includes(':')) {
      return false;
    }
    const [salt, expectedHex] = storedHash.split(':');
    const derivedHex = crypto.scryptSync(password, salt, 64).toString('hex');
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const derivedBuf = Buffer.from(derivedHex, 'hex');
    if (expectedBuf.length !== derivedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, derivedBuf);
  }

  return {
    isEncrypted,
    encrypt,
    decrypt,
    blindIndex,
    hashToken,
    hashPassword,
    verifyPassword,
  };
}

module.exports = {
  createCryptoContext,
  ENC_PREFIX,
};
