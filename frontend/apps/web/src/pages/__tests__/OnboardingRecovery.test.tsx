import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { ChartEngine } from '@almamesh/browser';
import '../../i18n/config';
import { useOnboardingStore } from '@almamesh/store';

// --- module mocks (declared before importing the page) ---
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const resetAppDataSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/resetAppData', () => ({
  resetAppData: () => resetAppDataSpy(),
}));

// Controllable chart-engine context value.
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

const fakeEngine = { generateChart: vi.fn() } as unknown as ChartEngine;

/** Seed the onboarding store at the generating step with valid birth data. */
function seedReadyToGenerate(): void {
  useOnboardingStore.setState({
    currentStep: 5,
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

describe('Onboarding — in-app bootstrap recovery', () => {
  beforeEach(() => {
    navigateSpy.mockClear();
    resetAppDataSpy.mockClear();
    useOnboardingStore.getState().reset();
  });

  afterEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('on a failed bootstrap, Generate reboots (re-syncs) and lands on the dashboard', async () => {
    const reboot = vi.fn().mockResolvedValue(fakeEngine);
    const whenReady = vi.fn();
    engineValue = {
      engine: null,
      error: new Error('bundle chunk 404'),
      stage: null,
      meta: null,
      reboot,
      whenReady,
      startBootstrap: vi.fn(),
    };
    seedReadyToGenerate();

    renderPage();
    // Drive the last step's "analyze & continue" which triggers generation.
    fireEvent.click(screen.getByTestId('life-events-input'));
    // Skip life events to reach generation directly.
    fireEvent.click(screen.getByText(/skip/i));

    await waitFor(() => expect(reboot).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/dashboard'));
    expect(whenReady).not.toHaveBeenCalled();
  });

  it('during the warming race (no engine, no error), Generate awaits readiness then navigates', async () => {
    const reboot = vi.fn();
    const whenReady = vi.fn().mockResolvedValue(fakeEngine);
    engineValue = {
      engine: null,
      error: null,
      stage: null,
      meta: null,
      reboot,
      whenReady,
      startBootstrap: vi.fn(),
    };
    seedReadyToGenerate();

    renderPage();
    fireEvent.click(screen.getByText(/skip/i));

    await waitFor(() => expect(whenReady).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/dashboard'));
    expect(reboot).not.toHaveBeenCalled();
  });

  it('shows a Reset & reload escape hatch on the error card and wires it to resetAppData', async () => {
    // whenReady that never resolves -> generation surfaces an engine-warming
    // error -> the error card renders with recovery actions.
    const reboot = vi.fn().mockRejectedValue(new Error('still broken'));
    const whenReady = vi.fn().mockRejectedValue(new Error('still broken'));
    engineValue = {
      engine: null,
      error: new Error('bundle chunk 404'),
      stage: null,
      meta: null,
      reboot,
      whenReady,
      startBootstrap: vi.fn(),
    };
    seedReadyToGenerate();

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByText(/skip/i));
    });

    // The error card appears with all three recovery actions.
    const resetButton = await screen.findByTestId('reset-app-data-button');
    expect(resetButton).toBeTruthy();
    expect(screen.getByTestId('retry-generation-button')).toBeTruthy();
    expect(screen.getByTestId('go-to-dashboard-button')).toBeTruthy();

    fireEvent.click(resetButton);
    await waitFor(() => expect(resetAppDataSpy).toHaveBeenCalledTimes(1));
  });
});
