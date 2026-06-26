import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Disclosure } from '../Disclosure';

describe('Disclosure', () => {
  it('renders the summary and a real toggle button', () => {
    render(
      <Disclosure summary={<span>Career outlook</span>}>
        <p>Full career reading.</p>
      </Disclosure>,
    );
    // The toggle is a real <button> (proper semantics, keyboard-focusable).
    const button = screen.getByRole('button');
    expect(button).toBeTruthy();
    // The summary is part of the trigger.
    expect(within(button).getByText('Career outlook')).toBeTruthy();
  });

  it('starts collapsed: aria-expanded is false and panel is hidden', () => {
    render(
      <Disclosure summary={<span>Career outlook</span>}>
        <p>Full career reading.</p>
      </Disclosure>,
    );
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    // The expandable region exists and is wired via aria-controls.
    const panelId = button.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId!);
    expect(panel).toBeTruthy();
    // Collapsed → region is hidden from the a11y tree.
    expect(panel!.getAttribute('aria-hidden')).toBe('true');
  });

  it('expands the full content inline when toggled and flips aria-expanded', () => {
    render(
      <Disclosure summary={<span>Career outlook</span>}>
        <p>Full career reading.</p>
      </Disclosure>,
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(button.getAttribute('aria-controls')!);
    expect(panel!.getAttribute('aria-hidden')).toBe('false');
    // The full content is reachable and visible after expanding.
    expect(screen.getByText('Full career reading.')).toBeTruthy();
  });

  it('collapses again on a second toggle', () => {
    render(
      <Disclosure summary={<span>Career outlook</span>}>
        <p>Full career reading.</p>
      </Disclosure>,
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('honors defaultOpen', () => {
    render(
      <Disclosure summary={<span>Career outlook</span>} defaultOpen>
        <p>Full career reading.</p>
      </Disclosure>,
    );
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('exposes the toggle label to assistive tech via the trigger', () => {
    render(
      <Disclosure summary={<span>Career outlook</span>} toggleLabel="Read full reading">
        <p>Full career reading.</p>
      </Disclosure>,
    );
    // The trigger carries an accessible name describing the action.
    const button = screen.getByRole('button', { name: /Read full reading/i });
    expect(button).toBeTruthy();
  });

  it('renders the full content in the DOM even while collapsed (no remount on toggle)', () => {
    // The grid-rows technique keeps content mounted; this guards against a
    // future regression to conditional `{open && <full/>}` rendering, which
    // would drop in-flight markdown/focus and break smooth animation.
    render(
      <Disclosure summary={<span>Career outlook</span>}>
        <p>Full career reading.</p>
      </Disclosure>,
    );
    // Present in the DOM even before expanding.
    expect(screen.getByText('Full career reading.')).toBeTruthy();
  });
});
