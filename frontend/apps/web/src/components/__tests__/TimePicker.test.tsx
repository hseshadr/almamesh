/**
 * TimePicker — typed-commit characterization + draft-buffer contract.
 *
 * CONTEXT: the onboarding birth-TIME field exhibited the same
 * controlled-component desync class fixed on the birth-DATE field
 * (BirthDatePicker.tsx): a fully-controlled MUI X sectioned field being
 * re-fed its own mid-edit emissions as the controlled `value`. Here the
 * echo was even harsher than the date field's — every emission round-trips
 * through an "HH:mm" string and back into a freshly-constructed Dayjs (new
 * identity), and incomplete/cleared states propagate '' upward, which
 * Onboarding commits straight into the store and feeds back as the
 * controlled value. The forced mid-edit section resync re-render swallowed
 * the first Continue click after typing the time (a live driver needed one
 * retry — the known "Next-blur" quirk).
 *
 * FIX (mirrors BirthDatePicker): the picker buffers in-progress edits in an
 * internal draft Dayjs and only propagates complete, valid times ("HH:mm");
 * the parent value is synced into the draft only when it differs from the
 * last value the picker itself emitted.
 *
 * HONESTY NOTE: this suite does NOT reproduce the real-browser race
 * (userEvent typing is effectively synchronous here). What it CAN pin is
 * the draft-buffer contract: no incomplete emission ever reaches the
 * parent, partial edits are not clobbered, external resets sync down, and
 * a clear stays local. The real-browser race is covered by the Playwright
 * probe against a preview build (scratchpad probe-time.mjs).
 */
// i18n must be initialized before any component that calls useTranslation
import '../../i18n/config';
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TimePicker } from '../TimePicker';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Mirrors Onboarding's wiring: every emission is committed to state. */
function Harness({ onCommit }: { onCommit: (t: string) => void }): React.ReactElement {
  const [value, setValue] = useState('');
  return (
    <TimePicker
      value={value}
      onChange={(t) => {
        // Onboarding's handleBirthTimeChange commits every emission as-is.
        setValue(t);
        onCommit(t);
      }}
    />
  );
}

function hiddenValue(): string {
  const hidden = document.querySelector<HTMLInputElement>('input[type="hidden"], input');
  return hidden?.value ?? '';
}

describe('TimePicker — typed time commits exactly as typed', () => {
  it('typing 10:30 AM commits "10:30" through the Onboarding wiring (characterization)', async () => {
    const user = userEvent.setup();
    let last = '';
    render(<Harness onCommit={(t) => (last = t)} />);

    const field = screen.getByRole('group');
    await user.click(field);
    await user.keyboard('1030a');

    expect(hiddenValue()).toBe('10:30 AM');
    expect(last).toBe('10:30');
  });
});

describe('TimePicker — draft buffer contract', () => {
  it('never propagates incomplete states (only complete valid HH:mm times reach the parent)', async () => {
    const user = userEvent.setup();
    const emissions: string[] = [];
    render(<Harness onCommit={(t) => emissions.push(t)} />);

    const field = screen.getByRole('group');
    await user.click(field);
    await user.keyboard('1030a');

    // Every emission that reached the parent is a complete, valid HH:mm —
    // the '' the old fully-controlled wiring leaked for each incomplete
    // keystroke is held in the internal draft instead.
    expect(emissions.length).toBeGreaterThan(0);
    for (const t of emissions) {
      expect(t).toMatch(HH_MM);
    }
    expect(emissions[emissions.length - 1]).toBe('10:30');
  });

  it('a partial edit (cleared minute section) does not emit and is not clobbered by the parent value', async () => {
    const user = userEvent.setup();
    const emissions: string[] = [];
    render(<TimePicker value="10:30" onChange={(t) => emissions.push(t)} />);
    expect(hiddenValue()).toBe('10:30 AM');

    // Focus the minutes section and clear it — MUI emits null (incomplete);
    // the picker must hold the partial state in the draft, not push it up.
    const field = screen.getByRole('group');
    await user.click(field);
    await user.keyboard('{ArrowRight}{Backspace}');

    expect(emissions).toHaveLength(0);
    // The in-progress edit stays on screen: hour/meridiem intact, minutes
    // cleared — the (unchanged) parent value did NOT resync over the draft.
    expect(hiddenValue()).toBe('10:mm AM');
  });

  it('syncs a genuine external reset from the parent into the field', () => {
    const { rerender } = render(<TimePicker value="10:30" onChange={() => undefined} />);
    expect(hiddenValue()).toBe('10:30 AM');

    // Parent-driven change (e.g. profile reset, store rehydration) — not an
    // echo of our own emission — must flow down into the draft.
    rerender(<TimePicker value="14:45" onChange={() => undefined} />);
    expect(hiddenValue()).toBe('02:45 PM');

    rerender(<TimePicker value="" onChange={() => undefined} />);
    expect(hiddenValue()).toBe('');
  });

  it('a full clear stays local and retyping commits the new time', async () => {
    const user = userEvent.setup();
    const emissions: string[] = [];
    render(<TimePicker value="10:30" onChange={(t) => emissions.push(t)} />);

    // Clear all three sections (hours, minutes, meridiem).
    const field = screen.getByRole('group');
    await user.click(field);
    await user.keyboard('{Backspace}{ArrowRight}{Backspace}{ArrowRight}{Backspace}');

    // Clearing never reaches the parent — the committed time is retained
    // upstream (matches the BirthDatePicker product behavior).
    expect(emissions).toHaveLength(0);

    // Retyping a fresh time commits it — recovery after a clear works.
    await user.keyboard('{ArrowLeft}{ArrowLeft}0245p');
    expect(hiddenValue()).toBe('02:45 PM');
    expect(emissions[emissions.length - 1]).toBe('14:45');
  });
});
