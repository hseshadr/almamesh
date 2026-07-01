/**
 * Backup & Restore orchestration service (Spec 061).
 *
 * The UI never talks to the storage primitives directly. It talks to this thin
 * service, which composes the already-built pieces from `@almamesh/store` into
 * the three operations a Settings screen needs:
 *
 *   - {@link buildBackupExport} — collect every persisted store, optionally
 *     passphrase-encrypt it, and hand back a filename + JSON text to save.
 *   - {@link stageBackupImport} — parse a picked file, validate it is an
 *     AlmaMesh backup of a version we understand, decrypt if needed, and return
 *     the plaintext envelope ready to preview/confirm (nothing written yet).
 *   - {@link commitBackupImport} — write a staged envelope into the stores.
 *
 * This module is PURE orchestration plus the browser-deps edge. It does NO file
 * I/O (that is `backupFile.ts`), touches NO DOM, and never reloads the page (the
 * caller does that after a commit). The only impurity is the default deps —
 * real browser tiers, the build app version, and `new Date()` — all injectable
 * via {@link BackupDepsOverride} so tests stay deterministic.
 */

import {
  applyBackup,
  BackupCryptoError,
  BackupError,
  collectBackup,
  createBrowserTiers,
  decodeEnvelope,
  encodeEnvelope,
  type BackupDeps,
  type StorageTier,
} from '@almamesh/store';
import type { BackupEnvelope, BackupEnvelopePlain } from '@almamesh/shared-types';

/**
 * Build-injected app version (Vite `define`). Read with a `typeof` guard so an
 * undefined-at-runtime constant never throws — falling back to `'dev'`.
 */
declare const __APP_VERSION__: string | undefined;

/** The current build's app version, stamped into every export's `app.version`. */
function currentAppVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
}

/**
 * Optional injection of the backup dependencies. Every field defaults to a real
 * browser value; tests override them with in-memory tiers and a fixed clock.
 */
export interface BackupDepsOverride {
  tiers?: Record<'local' | 'idb', StorageTier>;
  appVersion?: string;
  now?: string;
}

/** Resolve the injected/overridden deps into the concrete {@link BackupDeps}. */
function resolveDeps(override?: BackupDepsOverride): BackupDeps {
  return {
    tiers: override?.tiers ?? createBrowserTiers(),
    appVersion: override?.appVersion ?? currentAppVersion(),
    now: override?.now ?? new Date().toISOString(),
  };
}

/** A ready-to-save backup: the suggested filename plus the JSON text. */
export interface BackupExport {
  filename: string;
  text: string;
}

/**
 * Collect every persisted store into an envelope, optionally passphrase-encrypt
 * it, and return a filename (dated by the export timestamp) plus pretty JSON
 * text. Passing no passphrase yields a plaintext backup.
 */
export async function buildBackupExport(
  passphrase?: string,
  override?: BackupDepsOverride,
): Promise<BackupExport> {
  const deps = resolveDeps(override);
  const plain = await collectBackup(deps);
  const encoded = await encodeEnvelope(plain, passphrase);
  const filename = `almamesh-backup-${deps.now.slice(0, 10)}.json`;
  return { filename, text: JSON.stringify(encoded, null, 2) };
}

/** A parsed, validated (and decrypted) backup awaiting the user's confirmation. */
export interface StagedImport {
  envelope: BackupEnvelopePlain;
  wasEncrypted: boolean;
}

/**
 * Parse and validate picked file text, then decrypt it if it is encrypted.
 * Nothing is written — the caller previews {@link StagedImport.envelope} and
 * only then calls {@link commitBackupImport}.
 *
 * Failure modes are typed so the UI can message the exact reason:
 *  - not JSON, or not an AlmaMesh backup ⇒ {@link BackupError} `bad_format`
 *  - made by a newer app (`formatVersion > 1`) ⇒ {@link BackupError} `too_new`
 *  - encrypted but no passphrase given ⇒ {@link BackupCryptoError}
 *    `bad_passphrase` (so the UI knows to prompt), and a wrong passphrase
 *    surfaces the same error from `decodeEnvelope`.
 */
export async function stageBackupImport(
  fileText: string,
  passphrase?: string,
): Promise<StagedImport> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new BackupError('bad_format', 'This file is not valid JSON, so it is not an AlmaMesh backup.');
  }

  const record = parsed as { format?: unknown; formatVersion?: unknown; encryption?: unknown };
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    record.format !== 'almamesh-backup' ||
    typeof record.formatVersion !== 'number'
  ) {
    throw new BackupError('bad_format', 'This file is not an AlmaMesh backup.');
  }
  if (record.formatVersion > 1) {
    throw new BackupError(
      'too_new',
      'This backup was made by a newer version of AlmaMesh. Update the app first.',
    );
  }

  const wasEncrypted = record.encryption === 'aes-gcm';
  if (wasEncrypted && !passphrase) {
    throw new BackupCryptoError(
      'bad_passphrase',
      'This backup is encrypted — enter its passphrase to open it.',
    );
  }

  const envelope = await decodeEnvelope(parsed as BackupEnvelope, passphrase);
  return { envelope, wasEncrypted };
}

/**
 * Write a staged envelope into the stores (Replace). Delegates the all-or-nothing
 * staging, the chart route-guard flag, and the stale-RAG-vector cleanup to
 * `applyBackup`. Deliberately does NOT reload the page and does NOT take the
 * pre-import safety-net export — the caller owns both.
 */
export async function commitBackupImport(
  plain: BackupEnvelopePlain,
  override?: BackupDepsOverride,
): Promise<void> {
  await applyBackup(plain, resolveDeps(override));
}
