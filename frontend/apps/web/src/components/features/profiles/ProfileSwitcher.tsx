import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  useProfilesStore,
  useChartLibraryStore,
  type Profile,
} from '@almamesh/store';
import { Button, Dialog, Input } from '../../ui';
import { AvatarChip } from './AvatarChip';

/**
 * ProfileSwitcher — the header control for named, password-less people sharing
 * one device. Shows the active person's avatar + name; opens a dialog to switch
 * person, add a new one, rename, or delete (with confirm). Switching refreshes
 * the chart view (invalidates the `primary-chart` query) and routes to the
 * dashboard or onboarding depending on whether the new person has a chart.
 *
 * Local-first: no account, no login. All state lives in `@almamesh/store`
 * (IndexedDB). Per-profile chat history is intentionally out of scope for now —
 * chat is ephemeral today.
 */
export function ProfileSwitcher() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  // Select STABLE state slices (the record + the id) and derive the rest with
  // useMemo. Selecting `getActiveProfile()`/`listProfiles()` directly returns a
  // fresh object/array every render and loops forever under React 19 (#185).
  const profilesMap = useProfilesStore((s) => s.profiles);
  const activeProfileId = useProfilesStore((s) => s.activeProfileId);
  const createProfile = useProfilesStore((s) => s.createProfile);
  const renameProfile = useProfilesStore((s) => s.renameProfile);
  const deleteProfile = useProfilesStore((s) => s.deleteProfile);
  const setActiveProfile = useProfilesStore((s) => s.setActiveProfile);

  const profiles = useMemo(
    () => Object.values(profilesMap).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [profilesMap],
  );
  const activeProfile = activeProfileId ? profilesMap[activeProfileId] : undefined;
  // The last remaining person cannot be deleted — at least one must exist.
  const canDelete = profiles.length > 1;

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  /** Refresh the chart view + route to the right place for `profileId`. */
  const refreshForProfile = (profileId: string | null) => {
    // The active scope is pushed into chartLibrary by the store; re-resolve the
    // primary chart and route accordingly.
    void queryClient.invalidateQueries({ queryKey: ['primary-chart'] });
    const hasChart = profileId != null && !!useChartLibraryStore.getState().getPrimaryChart();
    navigate(hasChart ? '/dashboard' : '/onboarding');
  };

  const handleSwitch = (id: string) => {
    setActiveProfile(id);
    setOpen(false);
    refreshForProfile(id);
  };

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) {
      return;
    }
    const id = createProfile(name);
    setNewName('');
    // A brand-new person has no chart yet → send them to onboarding.
    setActiveProfile(id);
    setOpen(false);
    refreshForProfile(id);
  };

  const handleRenameCommitFor = (p: Profile) => {
    const name = renameValue.trim();
    if (name) {
      renameProfile(p.id, name);
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const handleDelete = (id: string) => {
    // The store cascades chart deletion and refuses the last profile (throws).
    deleteProfile(id);
    setConfirmDeleteId(null);
    const nextActive = useProfilesStore.getState().activeProfileId;
    refreshForProfile(nextActive);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          activeProfile
            ? t('profiles.active_switch_aria', { name: activeProfile.name })
            : t('profiles.add_a_person')
        }
        className="inline-flex items-center gap-2 rounded-full border border-ui-border bg-background-elevated px-2 py-1 font-sans text-sm text-text-body transition-colors hover:border-ui-borderLight hover:bg-background-tertiary"
      >
        {activeProfile ? (
          <>
            <AvatarChip tint={activeProfile.avatarTint} name={activeProfile.name} />
            <span className="max-w-[8rem] truncate pr-1">{activeProfile.name}</span>
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-accent-gold" aria-hidden="true" />
            <span className="pr-1">{t('profiles.add_person')}</span>
          </>
        )}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t('profiles.dialog_title')}>
        <div className="flex flex-col gap-4">
          <p className="font-sans text-sm text-text-secondary">
            {t('profiles.dialog_description')}
          </p>

          <ul className="flex flex-col gap-1.5" aria-label={t('profiles.people_list_aria')}>
            {profiles.map((p) => {
              const isActive = p.id === activeProfile?.id;
              const isRenaming = renamingId === p.id;
              const isConfirming = confirmDeleteId === p.id;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                    isActive ? 'border-accent-gold/50 bg-accent-gold/5' : 'border-ui-border'
                  }`}
                >
                  <AvatarChip tint={p.avatarTint} name={p.name} />
                  {isRenaming ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRenameCommitFor(p);
                        }
                      }}
                      aria-label={t('profiles.rename_aria', { name: p.name })}
                      className="h-8 flex-1"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSwitch(p.id)}
                      className="flex-1 truncate text-left font-sans text-sm text-text-primary hover:text-accent-gold-bright"
                    >
                      {p.name}
                      {isActive && (
                        <span className="ml-2 font-sans text-xs text-text-muted">
                          {t('profiles.active_badge')}
                        </span>
                      )}
                    </button>
                  )}

                  {isConfirming ? (
                    <span className="flex flex-col items-end gap-1.5">
                      <span className="font-sans text-xs text-text-secondary">
                        {t('profiles.delete_confirm', { name: p.name })}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-status-error"
                          onClick={() => handleDelete(p.id)}
                        >
                          {t('profiles.delete')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                          {t('actions.cancel')}
                        </Button>
                      </span>
                    </span>
                  ) : isRenaming ? (
                    <Button size="sm" variant="ghost" onClick={() => handleRenameCommitFor(p)}>
                      {t('actions.save')}
                    </Button>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('profiles.rename_aria', { name: p.name })}
                        onClick={() => {
                          setRenamingId(p.id);
                          setRenameValue(p.name);
                        }}
                      >
                        {t('profiles.rename')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('profiles.delete_aria', { name: p.name })}
                        className="text-text-muted hover:text-status-error"
                        disabled={!canDelete}
                        title={canDelete ? undefined : t('profiles.last_person_hint')}
                        onClick={() => setConfirmDeleteId(p.id)}
                      >
                        {t('profiles.delete')}
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
            {profiles.length === 0 && (
              <li className="rounded-md border border-ui-border px-3 py-2 font-sans text-sm text-text-muted">
                {t('profiles.empty_state')}
              </li>
            )}
          </ul>

          <div className="flex items-end gap-2 border-t border-ui-border pt-4">
            <label className="flex-1">
              <span className="mb-1 block font-sans text-xs text-text-muted">
                {t('profiles.add_a_person')}
              </span>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAdd();
                  }
                }}
                placeholder={t('profiles.name_placeholder')}
                aria-label={t('profiles.new_person_name_aria')}
              />
            </label>
            <Button variant="primary" onClick={handleAdd} disabled={!newName.trim()}>
              {t('profiles.add')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
