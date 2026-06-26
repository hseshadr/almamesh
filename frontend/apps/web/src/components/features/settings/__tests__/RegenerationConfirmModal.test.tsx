import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useLanguageStore } from '@almamesh/store';
import type { RegenerationScope } from '@almamesh/store';

import '../../../../i18n/config';
import { RegenerationConfirmModal } from '../RegenerationConfirmModal';

const BASE = {
  isOpen: true,
  onClose: () => {},
  scope: 'chart+interpretation' as RegenerationScope,
  estimatedCost: 0,
};

function confirmButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /Confirm & Regenerate/i }) as HTMLButtonElement;
}

describe('RegenerationConfirmModal — rising-sign flip acknowledgement', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('does NOT require acknowledgement when the rising sign does not change', () => {
    render(<RegenerationConfirmModal {...BASE} onConfirm={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByTestId('regen-flip-ack')).toBeNull();
    expect(confirmButton().disabled).toBe(false);
  });

  it('requires an explicit flip acknowledgement before confirming when the rising sign changes', () => {
    const onConfirm = vi.fn();
    render(
      <RegenerationConfirmModal {...BASE} onConfirm={onConfirm} signFlip={{ from: 'Aquarius', to: 'Pisces' }} />,
    );

    // States the consequence in plain language: which sign flips and that houses move.
    const ack = screen.getByTestId('regen-flip-ack');
    expect(ack.textContent).toMatch(/Aquarius → Pisces/);
    expect(ack.textContent).toMatch(/every house/);

    // Confirm is blocked until the box is checked.
    expect(confirmButton().disabled).toBe(true);
    fireEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();

    // Acknowledge -> confirm enabled -> proceeds.
    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirmButton().disabled).toBe(false);
    fireEvent.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
