import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { ChartEngine } from '@almamesh/browser';
import { timeConfidenceMargin } from '@almamesh/constants';
import {
  appEvents,
  useLifeEventsStore,
  useOnboardingStore,
  useProfilesStore,
  type BirthInfoChanged,
} from '@almamesh/store';
import '../../i18n/config';

// --- module mocks (declared before importing the page) ---
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock('../../lib/resetAppData', () => ({
  resetAppData: () => Promise.resolve(),
}));

const fakeEngine = { generateChart: vi.fn() } as unknown as ChartEngine;
type EngineValue = {
  engine: ChartEngine | null;
  error: Error | null;
  stage: null;
  meta: null;
  reboot: () => Promise<ChartEngine>;
  whenReady: () => Promise<ChartEngine>;
  startBootstrap: () => void;
};
let engineValue: EngineValue;
vi.mock('../../providers/AlmaMeshRuntimeProvider', () => ({
  useChartEngine: () => engineValue,
}));

import OnboardingPage from '../Onboarding';

function readyEngine(): void {
  engineValue = {
    engine: fakeEngine,
    error: null,
    stage: null,
    meta: null,
    reboot: vi.fn().mockResolvedValue(fakeEngine),
    whenReady: vi.fn().mockResolvedValue(fakeEngine),
    startBootstrap: vi.fn(),
  };
}

function seedAt(step: number, partial: Partial<ReturnType<typeof useOnboardingStore.getState>['data']> = {}): void {
  useOnboardingStore.setState({
    currentStep: step,
    data: {
      name: 'Asha',
      birthDate: new Date('1990-01-15T00:00:00'),
      birthTime: '12:00',
      timeConfidence: 'exact',
      city: 'Pune',
      state: '',
      country: 'India',
      latitude: 18.52,
      longitude: 73.85,
      timezone: 'Asia/Kolkata',
      interests: [],
      needsRectification: false,
      ...partial,
    },
    isLoading: false,
    error: null,
    isSaving: false,
    lastSavedStep: 0,
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <OnboardingPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateSpy.mockClear();
  readyEngine();
  useOnboardingStore.getState().reset();
  useProfilesStore.setState({ profiles: {}, activeProfileId: null });
  useLifeEventsStore.setState({ eventsByProfile: {} });
});

afterEach(() => {
  useOnboardingStore.getState().reset();
});

describe('timeConfidenceMargin helper (TIME_CONFIDENCE.margin consumer path)', () => {
  it('exposes the margin for each confidence key', () => {
    expect(timeConfidenceMargin('exact')).toBe(0);
    expect(timeConfidenceMargin('approximate')).toBe(15);
    expect(timeConfidenceMargin('rough')).toBe(60);
    expect(timeConfidenceMargin('unknown')).toBeNull();
  });
});

describe('Onboarding — birth-time confidence selector', () => {
  it('persists the selected confidence onto the onboarding (profile) birth details', () => {
    seedAt(4);
    renderPage();

    fireEvent.click(screen.getByTestId('confidence-option-approximate'));
    expect(useOnboardingStore.getState().data.timeConfidence).toBe('approximate');
    expect(useOnboardingStore.getState().data.needsRectification).toBe(false);

    fireEvent.click(screen.getByTestId('confidence-option-unknown'));
    expect(useOnboardingStore.getState().data.timeConfidence).toBe('unknown');
    expect(useOnboardingStore.getState().data.needsRectification).toBe(true);
  });

  it('carries the chosen confidence into the emitted birth metadata at generation', async () => {
    seedAt(5, { timeConfidence: 'approximate' });
    let captured: BirthInfoChanged | null = null;
    const handler = (e: BirthInfoChanged) => {
      captured = e;
    };
    appEvents.on('birth-info-changed', handler);
    renderPage();

    fireEvent.click(screen.getByText(/skip/i));

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/dashboard'));
    appEvents.off('birth-info-changed', handler);
    expect(captured).not.toBeNull();
    expect(captured!.birth.timeConfidence).toBe('approximate');
  });
});

describe('Onboarding — honest life-events copy', () => {
  it('does not claim analysis that does not happen', () => {
    seedAt(5);
    renderPage();

    // No element in the life-events step claims to "analyze" the narrative.
    expect(screen.queryByText(/analyz/i)).toBeNull();
    // The CTA is still reachable (a real button, just honestly labeled).
    expect(screen.getByTestId('extract-events-button')).toBeTruthy();
  });
});

describe('Onboarding — life events persist per profile', () => {
  it('saves the captured life events to the active profile on generation', async () => {
    seedAt(5);
    renderPage();

    fireEvent.change(screen.getByTestId('life-events-input'), {
      target: { value: 'I got married in 2015 and changed careers in 2020.' },
    });
    fireEvent.click(screen.getByTestId('extract-events-button'));

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/dashboard'), { timeout: 6000 });

    const profileId = useProfilesStore.getState().activeProfileId;
    expect(profileId).toBeTruthy();
    const events = useLifeEventsStore.getState().getEvents(profileId as string);
    expect(events).toHaveLength(1);
    expect(events[0].description).toContain('married');
  }, 8000);
});
