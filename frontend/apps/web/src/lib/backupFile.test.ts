/**
 * Tests for the pure browser file-I/O helper behind Backup & Restore (Spec 061).
 *
 * This module owns NO astrology, NO store, and NO crypto — it only:
 *  - saves JSON text or SQLite bytes to a file the user chooses
 *    with a graceful `<a download>` fallback for Firefox/Safari, and
 *  - reads JSON text or SQLite bytes back, with an `<input type=file>`
 *    fallback.
 *
 * happy-dom provides DOMException, URL.createObjectURL/revokeObjectURL, Blob and
 * File.arrayBuffer(), and exposes `window === globalThis` — so `vi.stubGlobal` (the
 * project convention, see submitFeedback.test.ts) makes `window.showSaveFilePicker`
 * / `window.showOpenFilePicker` present, and deleting the stub restores the
 * fallback path. All fixtures are synthetic.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pickBackupFile, saveBackupFile } from './backupFile';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A DOMException that mirrors what a picker throws when the user cancels. */
function abortError(): DOMException {
  return new DOMException('The user aborted a request.', 'AbortError');
}

// A minimal fake `<input type=file>` so the fallback path can be driven without
// fighting happy-dom's read-only `files` getter: clicking fires exactly one
// registered event, and `files` reflects the (optional) selected file.
interface FakeFileInput {
  type: string;
  accept: string;
  files: File[];
  addEventListener(name: string, cb: () => void): void;
  click(): void;
}

function makeFakeFileInput(config: {
  file: File | null;
  event: 'change' | 'cancel';
}): FakeFileInput {
  const handlers: Record<string, Array<() => void>> = {};
  return {
    type: '',
    accept: '',
    files: config.file ? [config.file] : [],
    addEventListener(name, cb) {
      (handlers[name] ??= []).push(cb);
    },
    click() {
      for (const cb of handlers[config.event] ?? []) cb();
    },
  };
}

describe('saveBackupFile', () => {
  it('writes text through the File System Access picker and closes it', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);

    const result = await saveBackupFile('almamesh-backup.json', 'PAYLOAD');

    expect(result).toBe('saved');
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'almamesh-backup.json' }),
    );
    expect(write).toHaveBeenCalledWith('PAYLOAD');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('writes SQLite bytes without text or base64 conversion', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);
    const bytes = new Uint8Array([...new TextEncoder().encode('SQLite format 3\0'), 0xff]);

    await expect(saveBackupFile('almamesh.sqlite3', bytes)).resolves.toBe('saved');

    expect(write).toHaveBeenCalledWith(bytes);
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        types: [expect.objectContaining({ accept: { 'application/vnd.sqlite3': expect.any(Array) } })],
      }),
    );
  });

  it('returns "cancelled" (no throw) when the picker is aborted', async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(abortError());
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);

    await expect(saveBackupFile('backup.json', 'PAYLOAD')).resolves.toBe('cancelled');
  });

  it('propagates non-abort picker errors', async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(new Error('disk full'));
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);

    await expect(saveBackupFile('backup.json', 'PAYLOAD')).rejects.toThrow('disk full');
  });

  it('falls back to an <a download> when the File System Access API is absent', async () => {
    // No showSaveFilePicker stub → the fallback download path runs.
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const realCreateElement = document.createElement.bind(document);
    const clickSpy = vi.fn();
    let anchor: HTMLAnchorElement | undefined;
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        anchor = el as HTMLAnchorElement;
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el;
    }) as unknown as typeof document.createElement);

    const result = await saveBackupFile('almamesh-backup-2026-07-01.json', 'PAYLOAD');

    expect(result).toBe('saved');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor?.download).toBe('almamesh-backup-2026-07-01.json');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('preserves SQLite bytes and MIME type in the download fallback', async () => {
    let captured: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      captured = blob as Blob;
      return 'blob:sqlite';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const element = realCreateElement(tag);
      if (tag === 'a') (element as HTMLAnchorElement).click = vi.fn();
      return element;
    }) as unknown as typeof document.createElement);
    const bytes = new Uint8Array([...new TextEncoder().encode('SQLite format 3\0'), 0xff]);

    await saveBackupFile('backup.sqlite3', bytes);

    expect(captured?.type).toBe('application/vnd.sqlite3');
    expect([...new Uint8Array(await captured!.arrayBuffer())]).toEqual([...bytes]);
  });
});

describe('pickBackupFile', () => {
  it('reads the text of the picked file via the File System Access API', async () => {
    const file = new File(['HELLO'], 'backup.json', { type: 'application/json' });
    const handle = { getFile: vi.fn().mockResolvedValue(file) };
    const showOpenFilePicker = vi.fn().mockResolvedValue([handle]);
    vi.stubGlobal('showOpenFilePicker', showOpenFilePicker);

    await expect(pickBackupFile()).resolves.toBe('HELLO');
    expect(showOpenFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false }),
    );
  });

  it('returns SQLite bytes byte-for-byte via the File System Access API', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('SQLite format 3\0'), 0x00, 0xff]);
    const file = new File([bytes], 'backup.sqlite3', { type: 'application/vnd.sqlite3' });
    const showOpenFilePicker = vi.fn().mockResolvedValue([
      { getFile: vi.fn().mockResolvedValue(file) },
    ]);
    vi.stubGlobal('showOpenFilePicker', showOpenFilePicker);

    const picked = await pickBackupFile();

    expect(picked).toBeInstanceOf(Uint8Array);
    expect([...(picked as Uint8Array)]).toEqual([...bytes]);
  });

  it('keeps unknown binary as bytes instead of decoding it as JSON', async () => {
    const bytes = new Uint8Array([0xff, 0x00, 0x41]);
    const file = new File([bytes], 'not-a-backup.bin');
    const showOpenFilePicker = vi.fn().mockResolvedValue([
      { getFile: vi.fn().mockResolvedValue(file) },
    ]);
    vi.stubGlobal('showOpenFilePicker', showOpenFilePicker);

    const picked = await pickBackupFile();
    expect(picked).toBeInstanceOf(Uint8Array);
    expect([...(picked as Uint8Array)]).toEqual([...bytes]);
  });

  it('returns null when the open picker is aborted', async () => {
    const showOpenFilePicker = vi.fn().mockRejectedValue(abortError());
    vi.stubGlobal('showOpenFilePicker', showOpenFilePicker);

    await expect(pickBackupFile()).resolves.toBeNull();
  });

  it('reads the chosen file via an <input> fallback when the API is absent', async () => {
    const file = new File(['CONTENT'], 'backup.json', { type: 'application/json' });
    const fakeInput = makeFakeFileInput({ file, event: 'change' });
    vi.spyOn(document, 'createElement').mockReturnValue(
      fakeInput as unknown as HTMLElement,
    );

    await expect(pickBackupFile()).resolves.toBe('CONTENT');
    expect(fakeInput.type).toBe('file');
    expect(fakeInput.accept).toContain('.json');
  });

  it('resolves null from the <input> fallback when nothing is selected', async () => {
    const fakeInput = makeFakeFileInput({ file: null, event: 'change' });
    vi.spyOn(document, 'createElement').mockReturnValue(
      fakeInput as unknown as HTMLElement,
    );

    await expect(pickBackupFile()).resolves.toBeNull();
  });

  it('resolves null from the <input> fallback when the dialog is cancelled', async () => {
    const fakeInput = makeFakeFileInput({ file: null, event: 'cancel' });
    vi.spyOn(document, 'createElement').mockReturnValue(
      fakeInput as unknown as HTMLElement,
    );

    await expect(pickBackupFile()).resolves.toBeNull();
  });

  // ITEM 5c — some browsers never fire `cancel`; the only signal that the dialog
  // closed with no selection is the window regaining focus. Resolve null then.
  it('resolves null from the <input> fallback when the window refocuses without a change', async () => {
    vi.useFakeTimers();
    // A fake input that emits NO event on click (mimics a no-`cancel` browser).
    const silentInput = {
      type: '',
      accept: '',
      files: [] as File[],
      addEventListener() {},
      click() {},
    };
    vi.spyOn(document, 'createElement').mockReturnValue(
      silentInput as unknown as HTMLElement,
    );

    const promise = pickBackupFile();
    // The dialog closes → the window regains focus with no `change` fired.
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).resolves.toBeNull();
    vi.useRealTimers();
  });

  it('still returns the file text when a real selection races the refocus (no double-resolve)', async () => {
    const file = new File(['REAL'], 'backup.json', { type: 'application/json' });
    const fakeInput = makeFakeFileInput({ file, event: 'change' });
    vi.spyOn(document, 'createElement').mockReturnValue(
      fakeInput as unknown as HTMLElement,
    );

    const promise = pickBackupFile();
    // The window also refocuses as the dialog closes; the `change` path must win.
    window.dispatchEvent(new Event('focus'));

    await expect(promise).resolves.toBe('REAL');
  });
});
