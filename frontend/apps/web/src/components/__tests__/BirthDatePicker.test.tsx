/**
 * BirthDatePicker — typed-commit characterization + draft-buffer contract.
 *
 * CONTEXT (northstar item 10): a live-browser probe showed the FIELD's own
 * hidden input reading "08/07/1988" after typing 08/08/1988 (repro in both LA
 * and Kolkata timezones — an interaction-layer desync, not timezone math).
 * ROOT CAUSE (per-keystroke probe evidence): while the year is half-typed the
 * MUI field emits "complete" Dayjs values with bogus years (0001/0019/0198 on
 * the way to 1988); the fully-controlled wiring echoed those straight back as
 * the `value` prop, forcing MUI to resync its sections mid-edit — the day
 * section came back one lower and the forced re-render swallowed the first
 * Continue click. Pure dayjs->Date->dayjs round trips do NOT shift the day
 * (verified for years 1/19/198/1988 in both TZs); the corruption is MUI's
 * mid-edit section resync.
 *
 * FIX: BirthDatePicker now buffers in-progress edits in an internal draft and
 * only propagates complete, in-range dates (MUI emits null for ANY incomplete
 * state, so null never propagates); the parent value is synced into the draft
 * only when it differs from the last value the picker itself emitted.
 *
 * HONESTY NOTE: this jsdom suite does NOT reproduce the original day-1 race
 * (userEvent typing is effectively synchronous — the typed-commit test passed
 * unchanged against the code the probe caught misbehaving). What jsdom CAN
 * pin is the draft-buffer contract: no bogus mid-typing emission ever reaches
 * the parent, partial edits don't emit, external resets sync down, and a full
 * clear propagates null. The real-browser race remains covered by the
 * Playwright probe against a preview build (scratchpad probe-date.mjs).
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BirthDatePicker } from '../BirthDatePicker';

/** Mirrors Onboarding's wiring: setState on change; nulls dropped. */
function Harness({ onCommit }: { onCommit: (d: Date | null) => void }): React.ReactElement {
  const [value, setValue] = useState<Date | null>(null);
  return (
    <BirthDatePicker
      value={value}
      onChange={(d) => {
        // Onboarding's handleBirthDatePickerChange drops nulls.
        if (d) {
          setValue(d);
          onCommit(d);
        }
      }}
    />
  );
}

function hiddenValue(): string {
  const hidden = document.querySelector<HTMLInputElement>('input[type="hidden"], input');
  return hidden?.value ?? '';
}

describe('BirthDatePicker — typed date commits exactly as typed', () => {
  it('typing 08/08/1988 commits day 8 through the Onboarding wiring (jsdom characterization)', async () => {
    const user = userEvent.setup();
    let last: Date | null = null;
    render(<Harness onCommit={(d) => (last = d)} />);

    const field = screen.getByRole('group');
    await user.click(field);
    await user.keyboard('08081988');

    expect(hiddenValue()).toBe('08/08/1988');
    expect(last).not.toBeNull();
    const committed = last as unknown as Date;
    expect(committed.getMonth()).toBe(7); // August
    expect(committed.getDate()).toBe(8);
    expect(committed.getFullYear()).toBe(1988);
  });
});

describe('BirthDatePicker — draft buffer contract', () => {
  it('never propagates bogus mid-typing years (only complete in-range dates reach the parent)', async () => {
    const user = userEvent.setup();
    const emissions: Array<Date | null> = [];
    render(<Harness onCommit={(d) => emissions.push(d)} />);

    const field = screen.getByRole('group');
    await user.click(field);
    await user.keyboard('08081988');

    // Every emission that reached the parent is a complete, in-range date —
    // the 0001/0019/0198 intermediates the old fully-controlled wiring leaked
    // are held in the internal draft instead.
    expect(emissions.length).toBeGreaterThan(0);
    for (const d of emissions) {
      expect(d).not.toBeNull();
      expect((d as Date).getFullYear()).toBeGreaterThanOrEqual(1900);
      expect((d as Date).getTime()).toBeLessThanOrEqual(Date.now());
    }
    const final = emissions[emissions.length - 1] as Date;
    expect(final.getFullYear()).toBe(1988);
    expect(final.getMonth()).toBe(7);
    expect(final.getDate()).toBe(8);
  });

  it('a partial edit (cleared year section) does not emit and is not clobbered by the parent value', async () => {
    const user = userEvent.setup();
    const emissions: Array<Date | null> = [];
    render(
      <BirthDatePicker
        value={new Date(1988, 7, 8)}
        onChange={(d) => emissions.push(d)}
      />,
    );
    expect(hiddenValue()).toBe('08/08/1988');

    // Focus the year section and clear it — MUI emits null (incomplete);
    // the picker must hold the partial state in the draft, not push it up.
    const field = screen.getByRole('group');
    await user.click(field);
    await user.keyboard('{ArrowRight}{ArrowRight}{Backspace}');

    expect(emissions).toHaveLength(0);
    // The in-progress edit stays on screen: month/day intact, year cleared —
    // the (unchanged) parent value did NOT resync over the draft.
    expect(hiddenValue()).toBe('08/08/YYYY');
  });

  it('syncs a genuine external reset from the parent into the field', () => {
    const { rerender } = render(
      <BirthDatePicker value={new Date(1988, 7, 8)} onChange={() => undefined} />,
    );
    expect(hiddenValue()).toBe('08/08/1988');

    // Parent-driven change (e.g. profile reset) — not an echo of our own
    // emission — must flow down into the draft.
    rerender(<BirthDatePicker value={new Date(1990, 0, 15)} onChange={() => undefined} />);
    expect(hiddenValue()).toBe('01/15/1990');

    rerender(<BirthDatePicker value={null} onChange={() => undefined} />);
    expect(hiddenValue()).toBe('');
  });

  it('a full clear stays local and retyping commits the new date', async () => {
    const user = userEvent.setup();
    const emissions: Array<Date | null> = [];
    render(
      <BirthDatePicker
        value={new Date(1988, 7, 8)}
        onChange={(d) => emissions.push(d)}
      />,
    );

    // Clear all three sections (month, day, year).
    const field = screen.getByRole('group');
    await user.click(field);
    await user.keyboard('{Backspace}{ArrowRight}{Backspace}{ArrowRight}{Backspace}');

    // Clearing never reaches the parent (matches the previous product
    // behavior where Onboarding dropped MUI's null emissions).
    expect(emissions).toHaveLength(0);

    // Retyping a fresh date commits it — recovery after a clear works.
    await user.keyboard('{ArrowLeft}{ArrowLeft}01151990');
    expect(hiddenValue()).toBe('01/15/1990');
    const final = emissions[emissions.length - 1] as Date;
    expect(final.getFullYear()).toBe(1990);
    expect(final.getMonth()).toBe(0);
    expect(final.getDate()).toBe(15);
  });
});
