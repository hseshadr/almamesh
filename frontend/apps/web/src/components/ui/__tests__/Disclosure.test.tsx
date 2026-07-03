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

describe('Disclosure collapsed footprint (grid-rows 0fr trick)', () => {
  // Padding/borders on the SAME element as `overflow-hidden` still contribute
  // to the collapsed 0fr row height (the box's own padding+border are not part
  // of the content that 0fr collapses). Ten closed reading sections each
  // carried ~37px of dead space + a stray border hairline this way. The
  // caller's `contentClassName` must therefore land on an INNER wrapper, never
  // on the overflow-hidden panel itself.
  it('applies contentClassName to an inner wrapper, not the overflow-hidden panel', () => {
    render(
      <Disclosure
        summary={<span>Career outlook</span>}
        contentClassName="pt-4 pb-5 border-t"
      >
        <p>Full career reading.</p>
      </Disclosure>,
    );
    const button = screen.getByRole('button');
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel.className).toContain('overflow-hidden');
    // The collapsing panel itself must stay free of caller box styles…
    expect(panel.className).not.toContain('pt-4');
    expect(panel.className).not.toContain('border-t');
    // …which instead live on a wrapper inside it, around the content.
    const inner = panel.firstElementChild as HTMLElement;
    expect(inner.className).toContain('pt-4');
    expect(inner.className).toContain('border-t');
    expect(within(panel).getByText('Full career reading.')).toBeTruthy();
  });
});
