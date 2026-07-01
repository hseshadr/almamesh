import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import type {
  BackupEnvelopePlain,
  BackupEnvelopeEncrypted,
} from '@almamesh/shared-types';

// Prefer the platform Web Crypto (present in modern browsers + Node 20+);
// only patch it in if the Vitest node env somehow lacks it.
if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

import {
  BackupCryptoError,
  PBKDF2_ITERATIONS,
  bytesToB64,
  b64ToBytes,
  encodeEnvelope,
  decodeEnvelope,
} from './backupCrypto';

// ---------------------------------------------------------------------------
// Synthetic fixture — NO real user data
// ---------------------------------------------------------------------------

function makePlain(): BackupEnvelopePlain {
  return {
    format: 'almamesh-backup',
    formatVersion: 1,
    app: { version: '1.2.3' },
    exportedAt: '2026-07-01T00:00:00.000Z',
    encryption: 'none',
    stores: {
      'almamesh-language': { version: 1, state: { language: 'en' } },
      'almamesh-interpretations': {
        version: 2,
        state: { readings: { chartA: 'a synthetic reading' } },
      },
    },
  };
}

// A base64 string (standard alphabet, optional '=' padding).
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

// ---------------------------------------------------------------------------

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes (including non-ASCII / zero bytes)', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 200, 255, 42]);
    const b64 = bytesToB64(bytes);
    expect(b64).toMatch(B64_RE);
    expect(Array.from(b64ToBytes(b64))).toEqual(Array.from(bytes));
  });
});

describe('encodeEnvelope — no passphrase', () => {
  it('returns the plain envelope unchanged (encryption stays "none")', async () => {
    const plain = makePlain();
    const out = await encodeEnvelope(plain);
    expect(out).toBe(plain);
    expect(out.encryption).toBe('none');
  });

  it('treats an empty-string passphrase as no passphrase', async () => {
    const plain = makePlain();
    const out = await encodeEnvelope(plain, '');
    expect(out.encryption).toBe('none');
  });
});

describe('encodeEnvelope / decodeEnvelope — encrypted round-trip', () => {
  it('encrypts to an aes-gcm envelope with base64 kdf/iv/ciphertext', async () => {
    const plain = makePlain();
    const enc = (await encodeEnvelope(plain, 'correct horse')) as BackupEnvelopeEncrypted;

    expect(enc.encryption).toBe('aes-gcm');
    expect(enc.kdf.name).toBe('PBKDF2');
    expect(enc.kdf.hash).toBe('SHA-256');
    expect(enc.kdf.iterations).toBe(PBKDF2_ITERATIONS);
    expect(enc.kdf.salt).toMatch(B64_RE);
    expect(enc.iv).toMatch(B64_RE);
    expect(enc.ciphertext).toMatch(B64_RE);

    // The ciphertext must not contain the plaintext of the stores.
    const plaintext = JSON.stringify(plain.stores);
    expect(enc.ciphertext).not.toContain(plaintext);
    expect(enc.ciphertext.length).toBeGreaterThan(0);

    // The encrypted envelope carries no plaintext `stores`.
    expect('stores' in enc).toBe(false);
  });

  it('decrypts back to stores that deep-equal the original', async () => {
    const plain = makePlain();
    const enc = await encodeEnvelope(plain, 'correct horse');
    const back = await decodeEnvelope(enc, 'correct horse');

    expect(back.encryption).toBe('none');
    expect(back.stores).toEqual(plain.stores);
  });

  it('preserves envelope metadata through encrypt -> decrypt', async () => {
    const plain = makePlain();
    const enc = (await encodeEnvelope(plain, 'pw')) as BackupEnvelopeEncrypted;
    const back = await decodeEnvelope(enc, 'pw');

    expect(back.format).toBe(plain.format);
    expect(back.formatVersion).toBe(plain.formatVersion);
    expect(back.app.version).toBe(plain.app.version);
    expect(back.exportedAt).toBe(plain.exportedAt);
  });
});

describe('decodeEnvelope — plain passthrough', () => {
  it('returns an already-plain envelope unchanged', async () => {
    const plain = makePlain();
    const out = await decodeEnvelope(plain);
    expect(out).toBe(plain);
  });
});

describe('decodeEnvelope — failure modes', () => {
  it('rejects a wrong passphrase with BackupCryptoError bad_passphrase', async () => {
    const enc = await encodeEnvelope(makePlain(), 'right');
    await expect(decodeEnvelope(enc, 'wrong')).rejects.toMatchObject({
      name: 'BackupCryptoError',
      code: 'bad_passphrase',
    });
    await expect(decodeEnvelope(enc, 'wrong')).rejects.toBeInstanceOf(BackupCryptoError);
  });

  it('rejects an empty passphrase on an encrypted envelope', async () => {
    const enc = await encodeEnvelope(makePlain(), 'right');
    await expect(decodeEnvelope(enc, '')).rejects.toMatchObject({
      code: 'bad_passphrase',
    });
  });

  it('rejects a missing passphrase on an encrypted envelope', async () => {
    const enc = await encodeEnvelope(makePlain(), 'right');
    await expect(decodeEnvelope(enc)).rejects.toBeInstanceOf(BackupCryptoError);
  });
});

describe('randomness', () => {
  it('produces a different salt, iv, and ciphertext on each encode of the same input', async () => {
    const plain = makePlain();
    const a = (await encodeEnvelope(plain, 'pw')) as BackupEnvelopeEncrypted;
    const b = (await encodeEnvelope(plain, 'pw')) as BackupEnvelopeEncrypted;

    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);

    // Both still decrypt correctly.
    expect((await decodeEnvelope(a, 'pw')).stores).toEqual(plain.stores);
    expect((await decodeEnvelope(b, 'pw')).stores).toEqual(plain.stores);
  });
});
