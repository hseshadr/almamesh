/**
 * PeopleSettings — the mesh "people layer": one anchor profile ("This is me")
 * plus family & friends, each a full person with their own on-device chart.
 *
 * Adding a person REUSES the existing profile-creation + onboarding flow
 * (create → activate → /onboarding, exactly like the header ProfileSwitcher);
 * the relationship is assigned around it — chart creation is never forked.
 * Legacy profiles without a relationship remain plain switchable users.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAnchorProfile,
  useMembers,
  useMeshReady,
  useProfilesStore,
  type Profile,
} from '@almamesh/store';
import { MEMBER_RELATIONSHIPS, type MemberRelationship } from '@almamesh/shared-types';
import { Badge, Button, Dialog, Input, Select } from '../../components/ui';
import { AvatarChip } from '../../components/features/profiles/AvatarChip';

/** Narrow a raw `<select>` value to a member relationship (no casts). */
function asMemberRelationship(value: string): MemberRelationship | undefined {
  return MEMBER_RELATIONSHIPS.find((r) => r === value);
}

interface RelationshipOptionsProps {
  /** i18n `t` bound to the `settings` namespace. */
  readonly t: (key: string, options?: Record<string, unknown>) => string;
}

/** The shared option list: "no relationship" + the backend-aligned values. */
function RelationshipOptions({ t }: RelationshipOptionsProps) {
  return (
    <>
      <option value="">{t('people.no_relationship')}</option>
      {MEMBER_RELATIONSHIPS.map((r) => (
        <option key={r} value={r}>
          {t(`people.relationships.${r}`)}
        </option>
      ))}
    </>
  );
}

interface PersonRowProps {
  readonly profile: Profile;
  readonly isAnchor: boolean;
  readonly anchorAssigned: boolean;
  readonly onMarkMe: (id: string) => void;
  readonly onUnmark: (id: string) => void;
  readonly onRelationshipChange: (id: string, value: string) => void;
}

/** One person: avatar, name, relationship badge, and the mesh controls. */
function PersonRow({
  profile,
  isAnchor,
  anchorAssigned,
  onMarkMe,
  onUnmark,
  onRelationshipChange,
}: PersonRowProps) {
  const { t } = useTranslation('settings');
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
      <div className="flex items-center gap-2">
        {isAnchor ? (
          <Button variant="ghost" size="sm" onClick={() => onUnmark(profile.id)}>
            {t('people.unmark')}
          </Button>
        ) : (
          <>
            <Select
              aria-label={t('people.relationship_select_aria', { name: profile.name })}
              value={profile.relationship ?? ''}
              onChange={(e) => onRelationshipChange(profile.id, e.target.value)}
              className="h-8 w-44 text-xs"
            >
              <RelationshipOptions t={t} />
            </Select>
            {!anchorAssigned && (
              <Button variant="secondary" size="sm" onClick={() => onMarkMe(profile.id)}>
                {t('people.this_is_me')}
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

interface AddPersonDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAdd: (name: string, relationship: MemberRelationship | undefined) => void;
}

/** Name + relationship; submission hands off to the existing onboarding flow. */
function AddPersonDialog({ open, onClose, onAdd }: AddPersonDialogProps) {
  const { t } = useTranslation('settings');
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    onAdd(trimmed, asMemberRelationship(relationship));
    setName('');
    setRelationship('');
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('people.add_title')}>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="add-person-name"
            className="mb-1 block text-sm font-medium text-text-secondary"
          >
            {t('people.add_name_label')}
          </label>
          <Input
            id="add-person-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('people.add_name_placeholder')}
          />
        </div>
        <div>
          <label
            htmlFor="add-person-relationship"
            className="mb-1 block text-sm font-medium text-text-secondary"
          >
            {t('people.add_relationship_label')}
          </label>
          <Select
            id="add-person-relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          >
            <RelationshipOptions t={t} />
          </Select>
        </div>
        <p className="text-xs text-text-muted">{t('people.add_hint')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('people.add_cancel')}
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {t('people.add_continue')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export default function PeopleSettings() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const profiles = useProfilesStore((s) => s.profiles);
  const createProfile = useProfilesStore((s) => s.createProfile);
  const setActiveProfile = useProfilesStore((s) => s.setActiveProfile);
  const setAnchor = useProfilesStore((s) => s.setAnchor);
  const setRelationship = useProfilesStore((s) => s.setRelationship);
  const clearRelationship = useProfilesStore((s) => s.clearRelationship);

  const anchor = useAnchorProfile();
  const members = useMembers();
  const meshReady = useMeshReady();

  const [addOpen, setAddOpen] = useState(false);
  const [anchorError, setAnchorError] = useState<string | null>(null);

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
   * The EXISTING add-a-person flow (mirrors the header ProfileSwitcher): create
   * the profile, assign its relationship, make it active, refresh the chart
   * query, and send the user into onboarding to enter birth details — the
   * chart itself is always computed by the one shared onboarding path.
   */
  const handleAdd = (name: string, relationship: MemberRelationship | undefined) => {
    const id = createProfile(name);
    if (relationship) {
      setRelationship(id, relationship);
    }
    setActiveProfile(id);
    setAddOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['primary-chart'] });
    navigate('/onboarding');
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
                onMarkMe={handleMarkMe}
                onUnmark={clearRelationship}
                onRelationshipChange={handleRelationshipChange}
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

      <AddPersonDialog open={addOpen} onClose={() => setAddOpen(false)} onAdd={handleAdd} />
    </div>
  );
}
