/**
 * PeopleSettings — the mesh "people layer": one anchor profile ("This is me")
 * plus family & friends, each a full person with their own on-device chart.
 *
 * Adding a person REUSES the existing profile-creation + onboarding flow
 * (create → activate → /onboarding, exactly like the header ProfileSwitcher);
 * the relationship is assigned around it — chart creation is never forked.
 * Legacy profiles without a relationship remain plain switchable users.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import {
  useAnchorProfile,
  useMembers,
  useMeshReady,
  useProfilesStore,
  type Profile,
} from '@almamesh/store';
import { Badge, Button, Input, Select } from '../../components/ui';
import { AvatarChip } from '../../components/features/profiles/AvatarChip';
import { deleteProfileData } from '../../lib/profileDataLifecycle';
import {
  AddPersonDialog,
  RelationshipOptions,
  asMemberRelationship,
} from '../../components/features/people/AddPersonDialog';

interface PersonRowProps {
  readonly profile: Profile;
  readonly isAnchor: boolean;
  readonly anchorAssigned: boolean;
  /** False for the LAST remaining person — the store action throws on it. */
  readonly canDelete: boolean;
  readonly deleting: boolean;
  readonly onMarkMe: (id: string) => void;
  readonly onUnmark: (id: string) => void;
  readonly onRelationshipChange: (id: string, value: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
}

interface RenameFieldProps {
  readonly profile: Profile;
  readonly t: TFunction;
  readonly onCommit: (name: string) => void;
}

/** Inline rename — Enter commits, Save commits, blur-free (mirrors the switcher). */
function RenameField({ profile, t, onCommit }: RenameFieldProps): ReactElement {
  const [value, setValue] = useState(profile.name);
  const commit = (): void => {
    const next = value.trim();
    if (next) {
      onCommit(next);
    }
  };
  return (
    <>
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
          }
        }}
        aria-label={t('common:profiles.rename_aria', { name: profile.name })}
        className="h-8 w-44"
      />
      <Button size="sm" variant="ghost" onClick={commit}>
        {t('common:actions.save')}
      </Button>
    </>
  );
}

interface DeleteConfirmProps {
  readonly profile: Profile;
  readonly t: TFunction;
  readonly deleting: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Destructive actions ask first — this wipes charts, chat, and readings. */
function DeleteConfirm({
  profile,
  t,
  deleting,
  onConfirm,
  onCancel,
}: DeleteConfirmProps): ReactElement {
  return (
    <span className="flex flex-col items-end gap-1.5">
      <span className="text-xs text-text-secondary">
        {t('common:profiles.delete_confirm', { name: profile.name })}
      </span>
      <span className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="text-status-error"
          disabled={deleting}
          data-testid={`confirm-delete-${profile.id}`}
          onClick={onConfirm}
        >
          {t('common:profiles.delete')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common:actions.cancel')}
        </Button>
      </span>
    </span>
  );
}

/** One person: avatar, name, relationship badge, and the mesh controls. */
function PersonRow({
  profile,
  isAnchor,
  anchorAssigned,
  canDelete,
  deleting,
  onMarkMe,
  onUnmark,
  onRelationshipChange,
  onRename,
  onDelete,
}: PersonRowProps) {
  const { t } = useTranslation(['settings', 'common']);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <li
      data-testid={`person-row-${profile.id}`}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-ui-border bg-background-tertiary p-4"
    >
      <AvatarChip tint={profile.avatarTint} name={profile.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-text-primary">{profile.name}</p>
          {isAnchor && <Badge variant="brass">{t('people.you_badge')}</Badge>}
          {!isAnchor && profile.relationship !== undefined && profile.relationship !== 'self' && (
            <Badge variant="lapis" data-testid="relationship-badge">
              {t(`people.relationships.${profile.relationship}`)}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!isAnchor && (
          <Select
            aria-label={t('people.relationship_select_aria', { name: profile.name })}
            value={profile.relationship ?? ''}
            onChange={(e) => onRelationshipChange(profile.id, e.target.value)}
            className="h-8 w-44 text-xs"
          >
            <RelationshipOptions t={t} />
          </Select>
        )}
        {isAnchor ? (
          <Button variant="ghost" size="sm" onClick={() => onUnmark(profile.id)}>
            {t('people.unmark')}
          </Button>
        ) : (
          !anchorAssigned && (
            <Button variant="secondary" size="sm" onClick={() => onMarkMe(profile.id)}>
              {t('people.this_is_me')}
            </Button>
          )
        )}
        {confirming ? (
          <DeleteConfirm
            profile={profile}
            t={t}
            deleting={deleting}
            onConfirm={() => {
              setConfirming(false);
              onDelete(profile.id);
            }}
            onCancel={() => setConfirming(false)}
          />
        ) : renaming ? (
          <RenameField
            profile={profile}
            t={t}
            onCommit={(name) => {
              onRename(profile.id, name);
              setRenaming(false);
            }}
          />
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('common:profiles.rename_aria', { name: profile.name })}
              onClick={() => setRenaming(true)}
            >
              {t('common:profiles.rename')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('common:profiles.delete_aria', { name: profile.name })}
              className="text-text-muted hover:text-status-error"
              disabled={!canDelete}
              title={canDelete ? undefined : t('common:profiles.last_person_hint')}
              onClick={() => setConfirming(true)}
            >
              {t('common:profiles.delete')}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export default function PeopleSettings() {
  const { t } = useTranslation(['settings', 'common']);
  const queryClient = useQueryClient();

  const profiles = useProfilesStore((s) => s.profiles);
  const setAnchor = useProfilesStore((s) => s.setAnchor);
  const setRelationship = useProfilesStore((s) => s.setRelationship);
  const clearRelationship = useProfilesStore((s) => s.clearRelationship);
  const renameProfile = useProfilesStore((s) => s.renameProfile);

  const anchor = useAnchorProfile();
  const members = useMembers();
  const meshReady = useMeshReady();

  const [addOpen, setAddOpen] = useState(false);
  const [anchorError, setAnchorError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const everyone = useMemo(
    () => Object.values(profiles).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [profiles],
  );

  const handleMarkMe = (id: string) => {
    const result = setAnchor(id);
    if (!result.ok && result.reason === 'anchor-exists') {
      // Unreachable from this UI (the button hides once an anchor exists) but
      // surfaced honestly in case another tab/surface raced us.
      const holder = profiles[result.anchorId];
      setAnchorError(t('people.anchor_exists', { name: holder?.name ?? '' }));
      return;
    }
    setAnchorError(null);
  };

  const handleRelationshipChange = (id: string, value: string) => {
    const relationship = asMemberRelationship(value);
    if (relationship) {
      setRelationship(id, relationship);
    } else {
      clearRelationship(id);
    }
  };

  /**
   * Delete through the LIFECYCLE coordinator, never the raw store action:
   * `deleteProfileData` cascades charts, chat, life events, rectification,
   * readings, predictive state, mesh edges, and memory vectors, and calls
   * `deleteProfile` itself at the end.
   */
  const handleDelete = async (id: string): Promise<void> => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteProfileData(id);
      // The store re-points `activeProfileId` when the ACTIVE person is the one
      // deleted. The primary chart is scoped to whoever is active now, so it
      // must be re-resolved — exactly what ProfileSwitcher.handleDelete does
      // before it routes. This page stays put; it is not scoped to one person.
      void queryClient.invalidateQueries({ queryKey: ['primary-chart'] });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : t('common:profiles.delete_error'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ui-border pb-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{t('people.title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('people.description')}</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>{t('people.add_person')}</Button>
      </div>

      {/* Mesh status / guidance */}
      {meshReady && (
        <div data-testid="mesh-status">
          <Badge variant="success">{t('people.mesh_ready', { count: members.length })}</Badge>
        </div>
      )}
      {!anchor && everyone.length > 0 && (
        <p className="text-sm text-text-secondary">{t('people.no_anchor_hint')}</p>
      )}
      {anchorError && (
        <p role="alert" className="text-sm text-status-error">
          {anchorError}
        </p>
      )}
      {deleteError && (
        <p role="alert" data-testid="delete-person-error" className="text-sm text-status-error">
          {deleteError}
        </p>
      )}

      {/* Everyone on this device */}
      {everyone.length > 0 && (
        <section>
          <ul className="space-y-3">
            {everyone.map((p) => (
              <PersonRow
                key={p.id}
                profile={p}
                isAnchor={p.relationship === 'self'}
                anchorAssigned={anchor !== undefined}
                canDelete={everyone.length > 1}
                deleting={deletingId === p.id}
                onMarkMe={handleMarkMe}
                onUnmark={clearRelationship}
                onRelationshipChange={handleRelationshipChange}
                onRename={renameProfile}
                onDelete={(id) => void handleDelete(id)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Honest empty state: the mesh needs people */}
      {members.length === 0 && (
        <div className="space-y-2 rounded-lg border border-ui-border bg-background-tertiary p-6 text-center">
          <h3 className="font-display text-lg text-text-primary">{t('people.empty_title')}</h3>
          <p className="mx-auto max-w-md text-sm text-text-secondary">{t('people.empty_body')}</p>
        </div>
      )}

      <AddPersonDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
