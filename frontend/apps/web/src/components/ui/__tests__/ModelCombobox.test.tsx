/**
 * ModelCombobox — a searchable, free-typable model picker.
 *
 * CONTEXT: replaces a hand-typed OpenRouter model slug box that dead-ended on
 * a mistyped/garbage slug. This component is presentation-only: it always
 * preserves free text (local/Ollama users type their own model names) and
 * degrades to a plain input when there's nothing to suggest (offline / not
 * OpenRouter / still loading with no catalog yet).
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ModelCombobox, type ModelOption } from '../ModelCombobox';

const BASE_OPTIONS: ModelOption[] = [
  { id: 'openai/gpt-4o', name: 'openai/gpt-4o' },
  { id: 'anthropic/claude-3', name: 'anthropic/claude-3' },
];

/** Controlled harness mirroring how a real caller wires value/onChange. */
function Harness({
  initialValue = '',
  options = BASE_OPTIONS,
  loading = false,
  onChange,
}: {
  initialValue?: string;
  options?: readonly ModelOption[];
  loading?: boolean;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <ModelCombobox
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      options={options}
      loading={loading}
      data-testid="model-combobox"
    />
  );
}

describe('ModelCombobox', () => {
  it('renders an input reflecting value; typing fires onChange with the typed text', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByTestId('model-combobox') as HTMLInputElement;

    await user.type(input, 'gpt');

    expect(onChange).toHaveBeenCalled();
    expect(input.value).toBe('gpt');
  });

  it('opens a listbox showing option ids when focused with options available', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByTestId('model-combobox');

    await user.click(input);

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('openai/gpt-4o')).toBeTruthy();
    expect(within(listbox).getByText('anthropic/claude-3')).toBeTruthy();
  });

  it('filters case-insensitively by id or by name', async () => {
    const user = userEvent.setup();
    const options: ModelOption[] = [
      { id: 'openai/gpt-4o', name: 'openai/gpt-4o' },
      { id: 'anthropic/claude-3', name: 'anthropic/claude-3' },
      // id does NOT contain the query; only the name does.
      { id: 'vendor/xyz-1', name: 'Claude Compatible Model' },
    ];
    render(<Harness options={options} />);
    const input = screen.getByTestId('model-combobox');

    await user.click(input);
    await user.type(input, 'CLAUDE');

    const listbox = screen.getByRole('listbox');
    const optionEls = within(listbox).getAllByRole('option');
    expect(optionEls).toHaveLength(2);
    expect(within(listbox).getByText('anthropic/claude-3')).toBeTruthy();
    expect(within(listbox).getByText('vendor/xyz-1')).toBeTruthy();
    expect(within(listbox).queryByText('openai/gpt-4o')).toBeNull();
  });

  it('selects an option on click: fires onChange with its id and closes the listbox', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByTestId('model-combobox');

    await user.click(input);
    await user.click(screen.getByText('anthropic/claude-3'));

    expect(onChange).toHaveBeenCalledWith('anthropic/claude-3');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ArrowDown then Enter selects the first option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByTestId('model-combobox');

    await user.click(input);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('openai/gpt-4o');
  });

  it('Escape closes the listbox and preserves the typed value without calling onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByTestId('model-combobox') as HTMLInputElement;

    await user.click(input);
    await user.type(input, 'gpt');
    const callsBeforeEscape = onChange.mock.calls.length;

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('gpt');
    expect(onChange).toHaveBeenCalledTimes(callsBeforeEscape);
  });

  it('renders no listbox when there are no options and not loading', async () => {
    const user = userEvent.setup();
    render(<Harness options={[]} loading={false} />);
    const input = screen.getByTestId('model-combobox');

    await user.click(input);

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows a loading row and no selectable options while loading', async () => {
    const user = userEvent.setup();
    render(<Harness options={[]} loading />);
    const input = screen.getByTestId('model-combobox');

    await user.click(input);

    expect(screen.getByText(/Loading models/)).toBeTruthy();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('preserves free text not present in any option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByTestId('model-combobox') as HTMLInputElement;

    await user.type(input, 'my-local-model');

    expect(input.value).toBe('my-local-model');
    expect(onChange).toHaveBeenLastCalledWith('my-local-model');
  });

  it('browsing (just focused) shows a short slice + a search hint, not the whole catalog', async () => {
    const user = userEvent.setup();
    const options: ModelOption[] = Array.from({ length: 12 }, (_, i) => ({
      id: `vendor/model-${String(i).padStart(2, '0')}`,
      name: `Model ${i}`,
    }));
    render(<Harness options={options} />);
    const input = screen.getByTestId('model-combobox');

    await user.click(input);

    const listbox = screen.getByRole('listbox');
    // Browse cap keeps the list short (8 of 12) so you search instead of scroll.
    expect(within(listbox).getAllByRole('option')).toHaveLength(8);
    expect(within(listbox).getByText(/Type to search/)).toBeTruthy();
  });

  it('a selected value does not collapse the list — reopening browses the full catalog', async () => {
    const user = userEvent.setup();
    render(<Harness initialValue="anthropic/claude-3" />);
    const input = screen.getByTestId('model-combobox') as HTMLInputElement;
    expect(input.value).toBe('anthropic/claude-3');

    await user.click(input);

    // Both options are offered even though the value equals one slug — you can
    // search afresh instead of being stuck filtering down to the current pick.
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(2);
  });
});
