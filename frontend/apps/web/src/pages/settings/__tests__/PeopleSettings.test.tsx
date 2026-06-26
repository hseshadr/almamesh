/**
 * PeopleSettings — the mesh "people layer" management surface.
 *
 * Drives the REAL profiles store (no mocks): relationship badges, the
 * one-anchor "This is me" flow, the relationship picker, the honest empty
 * state, and the add-a-person CTA that reuses the existing onboarding flow.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLanguageStore, useProfilesStore } from '@almamesh/store';

import '../../../i18n/config';
import PeopleSettings from '../PeopleSettings';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/people']}>
        <Routes>
          <Route path="/settings/people" element={<PeopleSettings />} />
          <Route path="/onboarding" element={<div data-testid="onboarding-probe" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seed(name: string): string {
  return useProfilesStore.getState().createProfile(name);
}

describe('PeopleSettings', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
    useProfilesStore.setState({ profiles: {}, activeProfileId: null, hydrated: true });
  });

  it('shows the honest empty-mesh explainer while no members exist', () => {
    seed('Asha');
    renderPage();
    expect(screen.getByText('Your mesh is empty')).toBeTruthy();
    expect(screen.getByText(/Add the people close to you — family first/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a person' })).toBeTruthy();
  });

  it('lists every profile with its relationship badge', () => {
    const me = seed('Asha');
    const mom = seed('Amma');
    const plain = seed('Stranger');
    useProfilesStore.getState().setAnchor(me);
    useProfilesStore.getState().setRelationship(mom, 'mother');
    renderPage();

    expect(within(screen.getByTestId(`person-row-${me}`)).getByText('You')).toBeTruthy();
    expect(
      within(screen.getByTestId(`person-row-${mom}`)).getByTestId('relationship-badge')
        .textContent,
    ).toBe('Mother');
    const plainRow = screen.getByTestId(`person-row-${plain}`);
    expect(
      (within(plainRow).getByLabelText('Relationship of Stranger to you') as HTMLSelectElement)
        .value,
    ).toBe('');
  });

  it('"This is me" marks the anchor and removes the option from other rows', () => {
    const a = seed('Alice');
    const b = seed('Bob');
    renderPage();

    // Before any anchor: every row offers "This is me".
    expect(screen.getAllByRole('button', { name: 'This is me' })).toHaveLength(2);
    fireEvent.click(within(screen.getByTestId(`person-row-${a}`)).getByRole('button', { name: 'This is me' }));

    expect(useProfilesStore.getState().getAnchorProfile()?.id).toBe(a);
    expect(within(screen.getByTestId(`person-row-${a}`)).getByText('You')).toBeTruthy();
    // The one-anchor invariant: no other row may offer "This is me" now.
    expect(screen.queryByRole('button', { name: 'This is me' })).toBeNull();
    expect(useProfilesStore.getState().profiles[b]?.relationship).toBeUndefined();
  });

  it('assigning a relationship through the picker updates the store and links the anchor', () => {
    const me = seed('Asha');
    const mom = seed('Amma');
    useProfilesStore.getState().setAnchor(me);
    renderPage();

    fireEvent.change(screen.getByLabelText('Relationship of Amma to you'), {
      target: { value: 'mother' },
    });

    expect(useProfilesStore.getState().profiles[mom]?.relationship).toBe('mother');
    expect(useProfilesStore.getState().profiles[mom]?.relatedTo).toBe(me);
    expect(
      within(screen.getByTestId(`person-row-${mom}`)).getByTestId('relationship-badge')
        .textContent,
    ).toBe('Mother');
  });

  it('shows the mesh-ready status once an anchor and a member exist', () => {
    const me = seed('Asha');
    const mom = seed('Amma');
    useProfilesStore.getState().setAnchor(me);
    useProfilesStore.getState().setRelationship(mom, 'mother');
    renderPage();
    expect(screen.getByText(/Mesh ready — 1 person connected to you/)).toBeTruthy();
  });

  it('unmark releases the anchor so someone else can be chosen', () => {
    const me = seed('Asha');
    useProfilesStore.getState().setAnchor(me);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Unmark' }));

    expect(useProfilesStore.getState().getAnchorProfile()).toBeUndefined();
    expect(screen.getAllByRole('button', { name: 'This is me' })).toHaveLength(1);
  });

  it('add a person creates the profile, assigns the relationship, and routes into onboarding', () => {
    const me = seed('Asha');
    useProfilesStore.getState().setAnchor(me);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add a person' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Amma' } });
    fireEvent.change(screen.getByLabelText('Relationship to you'), {
      target: { value: 'mother' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add & enter birth details' }));

    // Routed through the EXISTING flow: new person active, sent to onboarding.
    expect(screen.getByTestId('onboarding-probe')).toBeTruthy();
    const created = useProfilesStore
      .getState()
      .listProfiles()
      .find((p) => p.name === 'Amma');
    expect(created).toBeDefined();
    expect(created?.relationship).toBe('mother');
    expect(created?.relatedTo).toBe(me);
    expect(useProfilesStore.getState().activeProfileId).toBe(created?.id);
  });
});
