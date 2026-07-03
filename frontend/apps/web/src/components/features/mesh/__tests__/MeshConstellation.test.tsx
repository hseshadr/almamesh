/**
 * MeshConstellation — the ghost "+" star: one extra orbit slot that invites
 * adding a person in place. The constellation only reports the intent
 * (`onAddPerson`); the page owns the shared AddPersonDialog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLanguageStore, type Profile } from '@almamesh/store';

import '../../../../i18n/config';
import { MeshConstellation, type MeshNodeVM } from '../MeshConstellation';

const ANCHOR: Profile = {
  id: 'p-anchor',
  name: 'Asha Rao',
  createdAt: '2026-01-01T00:00:00Z',
  avatarTint: '#C9A24B',
  relationship: 'self',
};

const SPOUSE: Profile = {
  id: 'p-spouse',
  name: 'Dev Rao',
  createdAt: '2026-01-02T00:00:00Z',
  avatarTint: '#3A4FB0',
  relationship: 'spouse',
  relatedTo: 'p-anchor',
};

const anchorVM: MeshNodeVM = { profile: ANCHOR, hasChart: true, lagnaSign: 'Aquarius' };
const spouseVM: MeshNodeVM = { profile: SPOUSE, hasChart: true, lagnaSign: 'Leo' };

function renderConstellation(onAddPerson: () => void): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <MeshConstellation
        anchor={anchorVM}
        members={[spouseVM]}
        onGenerateChart={vi.fn()}
        onAddPerson={onAddPerson}
      />
    </MemoryRouter>,
  );
}

describe('MeshConstellation', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders a ghost add-a-person star on the orbit alongside the members', () => {
    renderConstellation(vi.fn());

    const addNode = screen.getByTestId('mesh-node-add');
    expect(addNode.tagName).toBe('BUTTON');
    expect(addNode.getAttribute('aria-label')).toBe('Add a person to your mesh');
    // The existing member star keeps its slot next to the ghost one.
    expect(screen.getByTestId('mesh-node-p-spouse')).toBeTruthy();
  });

  it('fires onAddPerson when the ghost star is clicked', () => {
    const onAddPerson = vi.fn();
    renderConstellation(onAddPerson);

    fireEvent.click(screen.getByTestId('mesh-node-add'));

    expect(onAddPerson).toHaveBeenCalledTimes(1);
  });
});
