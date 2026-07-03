/**
 * AddPersonDialog — the one shared "add a person" surface. Settings → People
 * and the /mesh constellation both open it in place.
 *
 * Submission REUSES the existing profile-creation + onboarding flow (create →
 * assign relationship → activate → refresh the primary-chart query →
 * /onboarding, exactly like the header ProfileSwitcher); the relationship is
 * assigned around it — chart creation is never forked.
 */

import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useProfilesStore } from '@almamesh/store';
import { MEMBER_RELATIONSHIPS, type MemberRelationship } from '@almamesh/shared-types';
import { Button, Dialog, Input, Select } from '../../ui';

/** Narrow a raw `<select>` value to a member relationship (no casts). */
export function asMemberRelationship(value: string): MemberRelationship | undefined {
  return MEMBER_RELATIONSHIPS.find((r) => r === value);
}

interface RelationshipOptionsProps {
  /** i18n `t` bound to the `settings` namespace. */
  readonly t: (key: string, options?: Record<string, unknown>) => string;
}

/** The shared option list: "no relationship" + the backend-aligned values. */
export function RelationshipOptions({ t }: RelationshipOptionsProps): ReactElement {
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

export interface AddPersonDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Name + relationship; submission hands off to the existing onboarding flow. */
export function AddPersonDialog({ open, onClose }: AddPersonDialogProps): ReactElement {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createProfile = useProfilesStore((s) => s.createProfile);
  const setRelationship = useProfilesStore((s) => s.setRelationship);
  const setActiveProfile = useProfilesStore((s) => s.setActiveProfile);

  const [name, setName] = useState('');
  const [relationshipValue, setRelationshipValue] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetForm = (): void => {
    setName('');
    setRelationshipValue('');
    setSubmitError(null);
  };

  // Reset on ANY close (Cancel, Escape, overlay) so a cancelled entry never
  // lingers into the next open.
  const handleClose = (): void => {
    resetForm();
    onClose();
  };

  const submit = (): void => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setSubmitError(null);
    try {
      const id = createProfile(trimmed);
      const memberRelationship = asMemberRelationship(relationshipValue);
      if (memberRelationship) {
        setRelationship(id, memberRelationship);
      }
      setActiveProfile(id);
    } catch (err) {
      // A store failure must never silently close the dialog or escape the
      // click handler: keep the typed entry, show a friendly retryable notice.
      console.error('[AddPersonDialog] add person failed:', err);
      setSubmitError(t('people.add_failed'));
      return;
    }
    handleClose();
    void queryClient.invalidateQueries({ queryKey: ['primary-chart'] });
    navigate('/onboarding');
  };

  return (
    <Dialog open={open} onClose={handleClose} title={t('people.add_title')}>
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
            value={relationshipValue}
            onChange={(e) => setRelationshipValue(e.target.value)}
          >
            <RelationshipOptions t={t} />
          </Select>
        </div>
        <p className="text-xs text-text-muted">{t('people.add_hint')}</p>
        {submitError !== null && (
          <p role="alert" data-testid="add-person-error" className="text-sm text-status-error">
            {submitError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose}>
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
