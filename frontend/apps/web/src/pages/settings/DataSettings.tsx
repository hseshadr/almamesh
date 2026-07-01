/**
 * DataSettings — the "Backup & Restore" settings panel (Spec 061).
 *
 * Lets a user move ALL their on-device data to another browser with a single
 * file. There is no server: Export collects every persisted store (optionally
 * passphrase-encrypted) and saves it to a file the user chooses; Restore picks a
 * backup file, stages it in memory, downloads a safety-net copy of the CURRENT
 * data (so Replace is undoable), then — on confirm — replaces this browser's data
 * and reloads. Nothing is uploaded; the only bytes that leave the device are the
 * file the user chooses to save.
 *
 * This panel is pure orchestration over the already-tested pieces:
 *  - `buildBackupExport` / `stageBackupImport` / `commitBackupImport` (backupService)
 *  - `saveBackupFile` / `pickBackupFile` (backupFile)
 * It reshapes the typed refusals (BackupError / BackupCryptoError) into i18n
 * messages and owns the confirm + passphrase-prompt dialogs.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackupCryptoError, BackupError } from '@almamesh/store';
import { Button, Card, Dialog, Input } from '../../components/ui';
import {
  buildBackupExport,
  commitBackupImport,
  stageBackupImport,
  type StagedImport,
} from '../../lib/backupService';
import { pickBackupFile, saveBackupFile } from '../../lib/backupFile';

export default function DataSettings() {
  const { t } = useTranslation('settings');

  // Export
  const [password, setPassword] = useState('');
  const [exporting, setExporting] = useState(false);

  // Shared status / error banners
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Import staging + confirm
  const [staged, setStaged] = useState<StagedImport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Passphrase prompt (encrypted backups)
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [promptPassphrase, setPromptPassphrase] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);

  const clearBanners = () => {
    setStatus(null);
    setError(null);
  };

  async function handleExport() {
    clearBanners();
    setExporting(true);
    try {
      const { filename, text } = await buildBackupExport(password || undefined);
      const result = await saveBackupFile(filename, text);
      if (result === 'saved') {
        setStatus(t('backup.status_exported'));
      }
    } catch {
      setError(t('backup.error_generic'));
    } finally {
      setExporting(false);
    }
  }

  /** Stage a picked file; open the passphrase prompt on encryption, else confirm. */
  async function stageFile(fileText: string, passphrase?: string) {
    try {
      const result = await stageBackupImport(fileText, passphrase);
      setPendingText(null);
      setPromptPassphrase('');
      setPromptError(null);
      setStaged(result);
      setConfirmOpen(true);
    } catch (err) {
      if (err instanceof BackupCryptoError && err.code === 'bad_passphrase') {
        // Encrypted (or a wrong passphrase): (re)open the prompt to collect one.
        setPendingText(fileText);
        setPromptError(passphrase ? t('backup.error_bad_passphrase') : null);
        return;
      }
      if (err instanceof BackupError && err.code === 'too_new') {
        setError(t('backup.error_too_new'));
        return;
      }
      if (err instanceof BackupError && err.code === 'bad_format') {
        setError(t('backup.error_bad_format'));
        return;
      }
      setError(t('backup.error_generic'));
    }
  }

  async function handleImport() {
    clearBanners();
    const fileText = await pickBackupFile();
    if (fileText == null) {
      return;
    }
    await stageFile(fileText);
  }

  async function handleUnlock() {
    if (pendingText == null) {
      return;
    }
    await stageFile(pendingText, promptPassphrase);
  }

  async function handleConfirmImport() {
    if (staged == null) {
      return;
    }
    setImporting(true);
    try {
      // Safety net FIRST: download a copy of the CURRENT data so Replace is undoable.
      const current = await buildBackupExport();
      await saveBackupFile('almamesh-backup-before-import.json', current.text);
      await commitBackupImport(staged.envelope);
      setConfirmOpen(false);
      setStatus(t('backup.status_imported'));
      window.location.reload();
    } catch {
      setConfirmOpen(false);
      setError(t('backup.error_generic'));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-8" data-testid="settings-data-panel">
      {/* Section header */}
      <div className="border-b border-ui-border pb-4">
        <h2 className="text-xl font-semibold text-text-primary">{t('backup.title')}</h2>
        <p className="text-text-secondary text-sm mt-1">{t('backup.subtitle')}</p>
      </div>

      {/* Status / error banners */}
      {status && (
        <p data-testid="backup-status" role="status" className="text-sm text-status-success">
          {status}
        </p>
      )}
      {error && (
        <p data-testid="backup-error" role="alert" className="text-sm text-status-error">
          {error}
        </p>
      )}

      {/* Export */}
      <Card title={t('backup.export_heading')}>
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">{t('backup.export_hint')}</p>
          <div className="space-y-2">
            <label
              htmlFor="backup-passphrase"
              className="block text-sm font-medium text-text-primary"
            >
              {t('backup.passphrase_label')}
            </label>
            <Input
              id="backup-passphrase"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('backup.passphrase_placeholder')}
              data-testid="backup-passphrase-input"
              autoComplete="new-password"
            />
          </div>
          <Button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            data-testid="backup-export-button"
          >
            {t('backup.export_button')}
          </Button>
          <p className="text-text-muted text-xs">{t('backup.sensitivity_note')}</p>
        </div>
      </Card>

      {/* Restore */}
      <Card title={t('backup.import_heading')}>
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">{t('backup.import_hint')}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleImport()}
            data-testid="backup-import-button"
          >
            {t('backup.import_button')}
          </Button>
        </div>
      </Card>

      {/* Confirm "replace all data" dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => !importing && setConfirmOpen(false)}
        title={t('backup.confirm_title')}
      >
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">{t('backup.confirm_body')}</p>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={importing}
              className="flex-1 px-4 py-2.5 bg-background-tertiary border border-ui-border text-text-primary rounded-md hover:bg-ui-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {t('backup.cancel')}
            </button>
            <button
              type="button"
              data-testid="backup-confirm-import"
              onClick={() => void handleConfirmImport()}
              disabled={importing}
              className="flex-1 px-4 py-2.5 bg-status-error text-background-primary rounded-md hover:bg-status-error/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
            >
              {t('backup.confirm_ok')}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Passphrase prompt dialog (encrypted backups) */}
      <Dialog
        open={pendingText != null}
        onClose={() => setPendingText(null)}
        title={t('backup.passphrase_prompt_title')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleUnlock();
          }}
          className="space-y-4"
        >
          <p className="text-text-secondary text-sm">{t('backup.passphrase_prompt_body')}</p>
          <Input
            type="password"
            value={promptPassphrase}
            onChange={(e) => setPromptPassphrase(e.target.value)}
            aria-label={t('backup.passphrase_prompt_title')}
            data-testid="backup-passphrase-prompt-input"
            autoComplete="off"
            autoFocus
          />
          {promptError && (
            <p role="alert" className="text-sm text-status-error">
              {promptError}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPendingText(null)}
              className="flex-1 px-4 py-2.5 bg-background-tertiary border border-ui-border text-text-primary rounded-md hover:bg-ui-border transition-colors text-sm font-medium"
            >
              {t('backup.cancel')}
            </button>
            <Button
              type="submit"
              className="flex-1"
              data-testid="backup-passphrase-prompt-submit"
            >
              {t('backup.passphrase_prompt_submit')}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
