/**
 * EventRow — unit tests.
 *
 * Verifies:
 *  - renders date, category, note, and precision controls
 *  - fires the appropriate callback on each field change
 *  - precision select defaults to 'exact' when event.precision is undefined
 *  - changing the precision select fires onPrecisionChange with the cast value
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LifeEvent } from '@almamesh/store';
// Import i18n config so the singleton is initialised before rendering components
// that call useTranslation() — mirrors the pattern in EventEntryStep.test.tsx.
import '../../../i18n/config';
import { EventRow } from './EventRow';

const baseEvent: LifeEvent = {
  id: 'ev-1',
  date: '2020-06-15',
  category: 'marriage',
  createdAt: '2020-01-01T00:00:00Z',
};

const noop = () => {};

describe('EventRow', () => {
  it('renders date, category, note, and precision controls', () => {
    render(
      <EventRow
        event={baseEvent}
        onDateChange={noop}
        onCategoryChange={noop}
        onNoteChange={noop}
        onDelete={noop}
        onPrecisionChange={noop}
      />,
    );
    expect(screen.getByLabelText('Date')).toBeTruthy();
    expect(screen.getByLabelText('Category')).toBeTruthy();
    expect(screen.getByLabelText('Note (optional)')).toBeTruthy();
    expect(screen.getByLabelText(/precision/i)).toBeTruthy();
  });

  it('fires onDateChange with the new value', () => {
    const onDateChange = vi.fn();
    render(
      <EventRow
        event={baseEvent}
        onDateChange={onDateChange}
        onCategoryChange={noop}
        onNoteChange={noop}
        onDelete={noop}
        onPrecisionChange={noop}
      />,
    );
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2021-03-10' } });
    expect(onDateChange).toHaveBeenCalledWith('2021-03-10');
  });

  it('fires onCategoryChange with undefined when blank is selected', () => {
    const onCategoryChange = vi.fn();
    render(
      <EventRow
        event={baseEvent}
        onDateChange={noop}
        onCategoryChange={onCategoryChange}
        onNoteChange={noop}
        onDelete={noop}
        onPrecisionChange={noop}
      />,
    );
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '' } });
    expect(onCategoryChange).toHaveBeenCalledWith(undefined);
  });

  it('fires onNoteChange with the new value', () => {
    const onNoteChange = vi.fn();
    render(
      <EventRow
        event={baseEvent}
        onDateChange={noop}
        onCategoryChange={noop}
        onNoteChange={onNoteChange}
        onDelete={noop}
        onPrecisionChange={noop}
      />,
    );
    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'civil ceremony' },
    });
    expect(onNoteChange).toHaveBeenCalledWith('civil ceremony');
  });

  it('fires onDelete when the delete button is clicked', () => {
    const onDelete = vi.fn();
    render(
      <EventRow
        event={baseEvent}
        onDateChange={noop}
        onCategoryChange={noop}
        onNoteChange={noop}
        onDelete={onDelete}
        onPrecisionChange={noop}
      />,
    );
    fireEvent.click(screen.getByLabelText('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders a precision select and fires onPrecisionChange', () => {
    const onPrecisionChange = vi.fn();
    render(
      <EventRow
        event={baseEvent}
        onDateChange={noop}
        onCategoryChange={noop}
        onNoteChange={noop}
        onDelete={noop}
        onPrecisionChange={onPrecisionChange}
      />,
    );
    const select = screen.getByLabelText(/precision/i);
    fireEvent.change(select, { target: { value: 'year' } });
    expect(onPrecisionChange).toHaveBeenCalledWith('year');
  });

  it('precision select defaults to exact when event.precision is undefined', () => {
    const eventWithoutPrecision: LifeEvent = { ...baseEvent, precision: undefined };
    render(
      <EventRow
        event={eventWithoutPrecision}
        onDateChange={noop}
        onCategoryChange={noop}
        onNoteChange={noop}
        onDelete={noop}
        onPrecisionChange={noop}
      />,
    );
    expect((screen.getByLabelText(/precision/i) as HTMLSelectElement).value).toBe('exact');
  });

  it('precision select shows the stored value when event.precision is set', () => {
    const eventWithPrecision: LifeEvent = { ...baseEvent, precision: 'month' };
    render(
      <EventRow
        event={eventWithPrecision}
        onDateChange={noop}
        onCategoryChange={noop}
        onNoteChange={noop}
        onDelete={noop}
        onPrecisionChange={noop}
      />,
    );
    expect((screen.getByLabelText(/precision/i) as HTMLSelectElement).value).toBe('month');
  });
});
