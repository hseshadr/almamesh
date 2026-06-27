/**
 * EventEntryStep — slice 1 of the rectification wizard: structured event entry.
 *
 * Renders the profile's life events from `useLifeEventsStore` as `<EventRow>`s,
 * an "Add Event" button that appends a draft row, min-events guidance copy, and
 * a Continue button that is DISABLED until at least one event satisfies
 * `isStructuredLifeEvent` (non-empty date AND a chosen category).
 *
 * No fitting is done here — that is slice 2. This step is purely data entry.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLifeEventsStore, isStructuredLifeEvent } from '@almamesh/store';
import type { LifeEvent } from '@almamesh/store';
import type { LifeEventCategory } from '@almamesh/shared-types';
import { EventRow } from './EventRow';

/** Stable empty array so the Zustand selector returns the same reference when
 * the profile has no events yet (avoids spurious re-renders). */
const EMPTY_EVENTS: readonly LifeEvent[] = [];

export interface EventEntryStepProps {
  /** The profile whose life events are being edited. */
  readonly profileId: string;
  /** Called when the user clicks Continue (≥1 structured event required). */
  readonly onContinue: () => void;
}

export function EventEntryStep({ profileId, onContinue }: EventEntryStepProps): ReactElement {
  const { t } = useTranslation('rectify');

  const events = useLifeEventsStore(
    (s) => s.eventsByProfile[profileId] ?? EMPTY_EVENTS,
  );
  const addEvent = useLifeEventsStore((s) => s.addEvent);
  const editEvent = useLifeEventsStore((s) => s.editEvent);
  const removeEvent = useLifeEventsStore((s) => s.removeEvent);

  const hasStructured = events.some(isStructuredLifeEvent);

  const handleAdd = () => {
    // `LifeEventInput.description` must be non-empty for the store to accept it.
    // We use a minimal placeholder; the user fills in date/category/note via editEvent.
    addEvent(profileId, { description: 'new' });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-text-primary">{t('entry.title')}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t('entry.subtitle')}</p>
      </div>

      {/* Event rows */}
      <div className="flex flex-col gap-3">
        {events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            onDateChange={(date) => editEvent(profileId, event.id, { date })}
            onCategoryChange={(category: LifeEventCategory | undefined) =>
              editEvent(profileId, event.id, { category })
            }
            onNoteChange={(note) => editEvent(profileId, event.id, { note })}
            onDelete={() => removeEvent(profileId, event.id)}
          />
        ))}
      </div>

      {/* Add button */}
      <button
        type="button"
        onClick={handleAdd}
        className="w-fit rounded-lg border border-dashed border-border-subtle px-4 py-2 text-sm text-text-secondary hover:border-accent-primary hover:text-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
      >
        {t('entry.add')}
      </button>

      {/* Min-events guidance */}
      {!hasStructured && (
        <p className="text-xs text-text-tertiary">{t('entry.min_events_hint')}</p>
      )}

      {/* Continue */}
      <button
        type="button"
        onClick={onContinue}
        disabled={!hasStructured}
        className="w-fit rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('entry.continue')}
      </button>
    </div>
  );
}
