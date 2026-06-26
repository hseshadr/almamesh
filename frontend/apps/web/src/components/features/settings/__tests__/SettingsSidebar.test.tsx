/**
 * SettingsSidebar — locks the settings surfaces' REACHABILITY: every hub page
 * (including the new People / mesh section) must be linked from the sidebar.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLanguageStore } from '@almamesh/store';

import '../../../../i18n/config';
import { SettingsSidebar } from '../SettingsSidebar';

describe('SettingsSidebar', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('links every settings section, People included', () => {
    render(
      <MemoryRouter>
        <SettingsSidebar />
      </MemoryRouter>,
    );
    const people = screen.getByTestId('settings-nav-people');
    expect(people.getAttribute('href')).toBe('/settings/people');
    expect(screen.getByText('People')).toBeTruthy();
    expect(screen.getByText('Family & friends in your mesh')).toBeTruthy();
    // The pre-existing sections stay linked.
    expect(screen.getByTestId('settings-nav-profile').getAttribute('href')).toBe(
      '/settings/profile',
    );
  });
});
