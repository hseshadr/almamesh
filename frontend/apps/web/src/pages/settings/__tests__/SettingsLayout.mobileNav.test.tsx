/**
 * SettingsLayout — the mobile settings nav must expose every section the
 * desktop sidebar does. People was missing, which stranded the mesh's
 * "this is me" control on small screens (no path to /settings/people).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useLanguageStore } from '@almamesh/store';

import '../../../i18n/config';
import SettingsLayout from '../SettingsLayout';

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/settings/people']}>
      <Routes>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route path="people" element={<div data-testid="people-content" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('SettingsLayout mobile navigation', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('offers the same sections as the desktop sidebar — including People', () => {
    renderLayout();

    // Two navs share the "Settings navigation" label: the desktop sidebar
    // (a list) and the mobile tab strip (bare links).
    const navs = screen.getAllByRole('navigation', { name: 'Settings navigation' });
    expect(navs).toHaveLength(2);
    const sidebar = navs.find((nav) => nav.querySelector('ul') !== null);
    const mobile = navs.find((nav) => nav.querySelector('ul') === null);
    expect(sidebar).toBeDefined();
    expect(mobile).toBeDefined();

    // People must be reachable on mobile — it holds the mesh "this is me" control.
    expect(within(mobile as HTMLElement).getByRole('link', { name: 'People' })).toBeTruthy();

    // The property, not the shape: the mobile nav mirrors every sidebar section.
    const hrefsOf = (nav: HTMLElement): Set<string | null> =>
      new Set(
        within(nav)
          .getAllByRole('link')
          .map((a) => a.getAttribute('href')),
      );
    expect(hrefsOf(mobile as HTMLElement)).toEqual(hrefsOf(sidebar as HTMLElement));
  });
});
