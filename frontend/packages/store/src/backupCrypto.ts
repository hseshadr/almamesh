/**
 * Backup envelope encode/decode — optional passphrase encryption via Web Crypto.
 *
 * Zero dependencies: only `globalThis.crypto.subtle` + `btoa`/`atob`, all of
 * which are present in every modern browser and in Node 20+. See
 * docs/specs/061-backup-restore-your-data.md (Envelope + Encryption sections).
 *
 * Scheme: PBKDF2(SHA-256) derives an AES-GCM-256 key from the passphrase; the
 * random salt + IV travel in the (plaintext) envelope metadata alongside the
 * ciphertext. Only `JSON.stringify(stores)` is secret; the rest of the envelope
 * stays readable so an importer can identify the file before asking for a
 * passphrase. A wrong passphrase surfaces as a GCM authentication failure, which
 * we wrap in a typed {@link BackupCryptoError} — a raw DOMException never leaks.
 */

import type {
  BackupEnvelope,
  BackupEnvelopePlain,
  BackupEnvelopeEncrypted,
  BackupStores,
} from '@almamesh/shared-types';

/** Typed failure for the backup crypto path (no raw DOMException leaks out). */
export class BackupCryptoError extends Error {
  constructor(
    public readonly code: 'bad_passphrase' | 'unsupported',
    message: string,
  ) {
    super(message);
    this.name = 'BackupCryptoError';
  }
}

/** PBKDF2 work factor (OWASP-recommended floor for SHA-256, 2023+). */
export const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_HASH = 'SHA-256' as const;
const AES_KEY_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// ---------------------------------------------------------------------------
// base64 helpers (btoa/atob operate on binary strings, one byte per char)
// ---------------------------------------------------------------------------

export function bytesToB64(u8: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < u8.length; i += 1) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary);
}

export function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// key derivation
// ---------------------------------------------------------------------------

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) {
    throw new BackupCryptoError('unsupported', 'Web Crypto is unavailable in this environment.');
  }
  return s;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const s = subtle();
  const baseKey = await s.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return s.deriveKey(
    { name: 'PBKDF2', hash: PBKDF2_HASH, salt, iterations: PBKDF2_ITERATIONS },
    baseKey,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// encode / decode
// ---------------------------------------------------------------------------

/**
 * Encode a plaintext envelope, optionally encrypting the store payload.
 * Blank/absent passphrase ⇒ the plain envelope is returned unchanged.
 */
export async function encodeEnvelope(
  plain: BackupEnvelopePlain,
  passphrase?: string,
): Promise<BackupEnvelope> {
  if (!passphrase) return plain;

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(plain.stores));
  const cipher = await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const encrypted: BackupEnvelopeEncrypted = {
    format: plain.format,
    formatVersion: plain.formatVersion,
    app: plain.app,
    exportedAt: plain.exportedAt,
    encryption: 'aes-gcm',
    kdf: {
      name: 'PBKDF2',
      hash: PBKDF2_HASH,
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToB64(salt),
    },
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(cipher)),
  };
  return encrypted;
}

/**
 * Decode an envelope back to plaintext. A plain envelope passes through; an
 * encrypted one is decrypted with the passphrase. Wrong/blank passphrase or any
 * decrypt/parse failure ⇒ {@link BackupCryptoError} `bad_passphrase`.
 */
export async function decodeEnvelope(
  env: BackupEnvelope,
  passphrase?: string,
): Promise<BackupEnvelopePlain> {
  if (env.encryption === 'none') return env;

  if (!passphrase) {
    throw new BackupCryptoError('bad_passphrase', 'A passphrase is required to open this backup.');
  }

  let stores: BackupStores;
  try {
    const key = await deriveKey(passphrase, b64ToBytes(env.kdf.salt));
    const plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(env.iv) },
      key,
      b64ToBytes(env.ciphertext),
    );
    stores = JSON.parse(new TextDecoder().decode(plaintext)) as BackupStores;
  } catch {
    // GCM auth failure (wrong passphrase) or corrupt payload — never leak the raw error.
    throw new BackupCryptoError(
      'bad_passphrase',
      'Could not decrypt the backup — the passphrase is wrong or the file is corrupt.',
    );
  }

  return {
    format: env.format,
    formatVersion: env.formatVersion,
    app: env.app,
    exportedAt: env.exportedAt,
    encryption: 'none',
    stores,
  };
}
