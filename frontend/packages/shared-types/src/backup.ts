/**
 * Backup & Restore contract — the on-disk shape of an AlmaMesh data export.
 *
 * AlmaMesh is local-first with no server; a backup is a single portable file the
 * user carries between browsers. See docs/specs/061-backup-restore-your-data.md.
 *
 * A backup snapshots the persisted user-data stores VERBATIM (each store's
 * Zustand `state` + its persisted `version`), so restore can write them back and
 * let each store's own `persist` + `migrate` run on the next load — migration is
 * never re-implemented. Envelope metadata stays plaintext even when the payload is
 * encrypted, so an importer can identify the file before asking for a passphrase.
 */

/** One persisted store's snapshot: the Zustand `state` plus its persisted version. */
export interface BackupStoreSnapshot {
  /** The store's persisted Zustand `version` (drives migrate-on-load). */
  version: number;
  /** The persisted `state` object, verbatim. */
  state: unknown;
}

/** The set of stores in a backup, keyed by persist name (e.g. `almamesh-profiles`). */
export type BackupStores = Record<string, BackupStoreSnapshot>;

/** Fields common to every backup envelope, readable even when encrypted. */
export interface BackupEnvelopeMeta {
  /** Magic marker identifying an AlmaMesh backup file. */
  format: 'almamesh-backup';
  /** Envelope-shape version (guards the file format itself). */
  formatVersion: 1;
  /** The app build that produced the file (from `__APP_VERSION__` / 'dev'). */
  app: { version: string };
  /** ISO 8601 timestamp of export. */
  exportedAt: string;
}

/** An unencrypted backup: the store snapshots are inline and human-readable. */
export interface BackupEnvelopePlain extends BackupEnvelopeMeta {
  encryption: 'none';
  stores: BackupStores;
}

/**
 * An encrypted backup: `stores` is AES-GCM ciphertext (of `JSON.stringify(stores)`)
 * with a PBKDF2-derived key. Salt + IV travel alongside; only the payload is secret.
 */
export interface BackupEnvelopeEncrypted extends BackupEnvelopeMeta {
  encryption: 'aes-gcm';
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    /** base64 random salt. */
    salt: string;
  };
  /** base64 AES-GCM initialization vector. */
  iv: string;
  /** base64 AES-GCM ciphertext of `JSON.stringify(stores)`. */
  ciphertext: string;
}

/** A backup file is either plaintext or encrypted; `encryption` discriminates. */
export type BackupEnvelope = BackupEnvelopePlain | BackupEnvelopeEncrypted;
