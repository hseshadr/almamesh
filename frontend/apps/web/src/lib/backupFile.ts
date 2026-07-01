/**
 * Pure browser file I/O for Backup & Restore (Spec 061).
 *
 * This module is deliberately tiny and dependency-free: it imports NO store, NO
 * crypto, and NO astrology. It only saves a text string to a file the user
 * chooses and reads a text string back from a file the user picks.
 *
 * Where supported (Chromium/Edge) it uses the File System Access API so the user
 * can save straight into a synced Drive/Dropbox/iCloud folder and re-open it
 * later. Firefox/Safari lack that API, so it falls back to the classic
 * `<a download>` (save) and `<input type=file>` (open) mechanisms. Nothing here
 * touches the network — the only bytes that leave the device are the file the
 * user explicitly saves.
 */

/** A single `accept` entry for the native pickers. */
interface BackupPickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface BackupWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface BackupFileHandle {
  createWritable(): Promise<BackupWritable>;
  getFile(): Promise<File>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: BackupPickerType[];
}

interface OpenFilePickerOptions {
  types?: BackupPickerType[];
  multiple?: boolean;
}

/**
 * The subset of the File System Access API this module uses, projected onto
 * `window`. Both methods may be absent (Firefox/Safari), which is why callers
 * feature-detect with the `in` operator before casting to this shape.
 */
interface FileSystemAccessWindow {
  showSaveFilePicker(options: SaveFilePickerOptions): Promise<BackupFileHandle>;
  showOpenFilePicker(options: OpenFilePickerOptions): Promise<BackupFileHandle[]>;
}

/** JSON-only filter shared by both pickers. */
const BACKUP_PICKER_TYPE: BackupPickerType = {
  description: 'AlmaMesh backup',
  accept: { 'application/json': ['.json'] },
};

/** True when the user dismissed a native picker (not an actual failure). */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Save `text` to a file named `suggestedName`. Returns `'saved'` when the file
 * is written (or the download is triggered) and `'cancelled'` when the user
 * dismisses the native save dialog. Non-abort errors propagate to the caller.
 */
export async function saveBackupFile(
  suggestedName: string,
  text: string,
): Promise<'saved' | 'cancelled'> {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as unknown as FileSystemAccessWindow).showSaveFilePicker({
        suggestedName,
        types: [BACKUP_PICKER_TYPE],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return 'saved';
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
      throw error;
    }
  }

  downloadTextFile(suggestedName, text);
  return 'saved';
}

/** Fallback save: trigger a browser download via a transient `<a download>`. */
function downloadTextFile(suggestedName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Prompt the user to pick a backup file and return its text, or `null` if the
 * user cancels / selects nothing. Non-abort errors propagate to the caller.
 */
export async function pickBackupFile(): Promise<string | null> {
  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as unknown as FileSystemAccessWindow).showOpenFilePicker({
        types: [BACKUP_PICKER_TYPE],
        multiple: false,
      });
      const file = await handle.getFile();
      return await file.text();
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    }
  }

  return pickTextFileViaInput();
}

/** Fallback open: read a file chosen through a transient `<input type=file>`. */
function pickTextFileViaInput(): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    const onChange = () => {
      const file = input.files && input.files[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(resolve, reject);
    };

    input.addEventListener('change', onChange, { once: true });
    // Chromium fires `cancel` when the dialog is dismissed with no selection.
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
