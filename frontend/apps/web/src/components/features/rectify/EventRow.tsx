/**
 * EventRow — one editable life-event row in the rectification wizard.
 *
 * Renders three fields (date, category, optional note) and a delete control.
 * All labels are localized from the `rectify` namespace; category option text
 * uses `rectify:categories.<category>` keys — never raw enum values.
 *
 * This component is purely presentational: state lives in the caller
 * (EventEntryStep → useLifeEventsStore).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { LifeEvent } from '@almamesh/store';
import type { LifeEventCategory } from '@almamesh/shared-types';
import { LIFE_EVENT_CATEGORIES } from '@almamesh/shared-types';

export interface EventRowProps {
  readonly event: LifeEvent;
  readonly onDateChange: (date: string) => void;
  readonly onCategoryChange: (category: LifeEventCategory | undefined) => void;
  readonly onNoteChange: (note: string) => void;
  readonly onDelete: () => void;
}

export function EventRow({
  event,
  onDateChange,
  onCategoryChange,
  onNoteChange,
  onDelete,
}: EventRowProps): ReactElement {
  const { t } = useTranslation('rectify');

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    onCategoryChange(val !== '' ? (val as LifeEventCategory) : undefined);
  };

  return (
    <div
      className="flex flex-wrap items-start gap-3 rounded-lg border border-border-subtle bg-surface-secondary p-3"
      data-testid="event-row"
    >
      {/* Date */}
      <div className="flex min-w-[10rem] flex-col gap-1">
        <label
          htmlFor={`date-${event.id}`}
          className="text-xs font-medium uppercase tracking-wider text-text-tertiary"
        >
          {t('entry.date_label')}
        </label>
        <input
          id={`date-${event.id}`}
          type="date"
          value={event.date}
          onChange={(e) => onDateChange(e.target.value)}
          aria-label={t('entry.date_label')}
          className="rounded border border-border-subtle bg-surface-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
      </div>

      {/* Category */}
      <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <label
          htmlFor={`category-${event.id}`}
          className="text-xs font-medium uppercase tracking-wider text-text-tertiary"
        >
          {t('entry.category_label')}
        </label>
        <select
          id={`category-${event.id}`}
          value={event.category ?? ''}
          onChange={handleCategoryChange}
          aria-label={t('entry.category_label')}
          className="rounded border border-border-subtle bg-surface-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
        >
          <option value="">{t('entry.category_placeholder')}</option>
          {LIFE_EVENT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {t(`categories.${cat}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Note */}
      <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <label
          htmlFor={`note-${event.id}`}
          className="text-xs font-medium uppercase tracking-wider text-text-tertiary"
        >
          {t('entry.note_label')}
        </label>
        <input
          id={`note-${event.id}`}
          type="text"
          value={event.note ?? ''}
          onChange={(e) => onNoteChange(e.target.value)}
          aria-label={t('entry.note_label')}
          placeholder={t('entry.note_label')}
          className="rounded border border-border-subtle bg-surface-primary px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
      </div>

      {/* Delete */}
      <div className="flex items-end pb-1">
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('entry.delete')}
          className="rounded px-2 py-1 text-xs text-status-error hover:bg-status-error/10 focus:outline-none focus:ring-1 focus:ring-status-error"
        >
          {t('entry.delete')}
        </button>
      </div>
    </div>
  );
}
