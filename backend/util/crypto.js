import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a plain-text string using AES-256-GCM.
 * Output format: iv:authTag:encryptedData (hex)
 */
export function encrypt(text) {
  if (!text) return '';
  
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('Invalid or missing ENCRYPTION_KEY. Must be 32 bytes (64 hex characters).');
  }

  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string encrypted with AES-256-GCM.
 * Supports legacy fallback: returns the input if it's not in the expected format 
 * or if decryption fails (e.g. incorrect key).
 */
export function decrypt(ciphertext) {
  if (!ciphertext) return '';

  // Legacy fallback: if it doesn't have the colon separators, it's likely plain text
  if (!ciphertext.includes(':')) {
    return ciphertext;
  }

  const components = ciphertext.split(':');
  if (components.length !== 3) {
    return ciphertext; // Invalid format, return as is
  }

  try {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) {
      throw new Error('Invalid or missing ENCRYPTION_KEY.');
    }

    const key = Buffer.from(keyHex, 'hex');
    const [ivHex, authTagHex, encryptedDataHex] = components;
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encryptedData = Buffer.from(encryptedDataHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.warn('[LazyFill] Decryption failed, returning raw ciphertext:', err.message);
    return ciphertext;
  }
}
