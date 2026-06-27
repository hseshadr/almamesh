// i18n must be initialized before any component that calls useTranslation
import '../i18n/config';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useChartLibraryStore, useProfilesStore, appEvents } from '@almamesh/store';
import { useRectification } from '../hooks/useRectification';
import { RectifyPage } from '../pages/Rectify';

// ---------------------------------------------------------------------------
// Hoisted helpers (available before vi.mock factories run)
// ---------------------------------------------------------------------------
const mockNavigate = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Heavy dep mocks — hoisted by Vitest before all imports
// ---------------------------------------------------------------------------

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: { div: 'div' as unknown as React.ComponentType },
}));

vi.mock('../providers/chartEngineContext', () => ({
  useOptionalChartEngine: () => null,
  useChartEngine: () => null,
}));

vi.mock('../lib/predictive', () => ({
  predictiveReferenceInstant: () => '2026-01-01T00:00:00Z',
}));

vi.mock('../hooks/useRectification', () => ({
  useRectification: vi.fn(),
}));

vi.mock('../components/features/rectify/EventEntryStep', () => ({
  EventEntryStep: ({ onContinue }: { onContinue: () => void }) => (
    <div data-testid="event-entry-step">
      <button onClick={onContinue} data-testid="events-continue-btn">
        Continue
      </button>
    </div>
  ),
}));

vi.mock('../components/features/rectify/RectifyResults', () => ({
  RectifyResults: ({
    onConfirm,
    onKeepRecorded,
    result,
  }: {
    onConfirm: (c: unknown) => void;
    onKeepRecorded: () => void;
    result: { candidates: unknown[] };
  }) => (
    <div data-testid="rectify-results">
      <button onClick={() => onConfirm(result.candidates[0])} data-testid="confirm-candidate-btn">
        Use this time
      </button>
      <button onClick={onKeepRecorded} data-testid="keep-recorded-btn">
        Keep recorded
      </button>
    </div>
  ),
}));

vi.mock('../components/features/settings/RegenerationConfirmModal', () => {
  const Stub = ({
    isOpen,
    onConfirm,
    onClose,
    signFlip,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onClose: () => void;
    signFlip?: { from: string; to: string } | null;
  }) => {
    const [acked, setAcked] = React.useState(false);
    if (!isOpen) return null;
    return (
      <div data-testid="regen-modal">
        {signFlip && (
          <label data-testid="regen-flip-ack">
            <input
              type="checkbox"
              checked={acked}
              onChange={(e) => setAcked(e.target.checked)}
            />
          </label>
        )}
        <button
          onClick={onConfirm}
          disabled={signFlip != null && !acked}
          data-testid="regen-confirm-btn"
        >
          Confirm
        </button>
        <button onClick={onClose} data-testid="regen-cancel-btn">
          Cancel
        </button>
      </div>
    );
  };
  return { RegenerationConfirmModal: Stub };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ profileId: 'profile-abc' }),
    useNavigate: () => mockNavigate,
  };
});

// ---------------------------------------------------------------------------
// Synthetic test fixtures — NO real birth data
// ---------------------------------------------------------------------------

const PROFILE_ID = 'profile-abc';

const MOCK_CHART = {
  chart_id: 'chart-1',
  profile_id: PROFILE_ID,
  is_primary: true,
  person_name: 'Test User',
  birth_data: {
    birth_datetime_utc: '1990-05-15T02:00:00Z',
    birth_datetime_local: '1990-05-15T07:30',
    birth_location_details: {
      latitude: 18.5,
      longitude: 73.8,
      timezone: 'Asia/Kolkata',
      location_name: 'Pune, India',
    },
    birth_time_original: '07:30',
  },
};

const MOCK_RESULT = {
  mode: 'cusp' as const,
  candidates: [
    {
      ascendantSign: 'pisces',
      representativeTimeLocal: '07:45',
      lagnaLongitudeDeg: 333.8,
      lagnaCuspDistanceDeg: 3.8,
      isNearCusp: true,
      fitScore: 0.72,
      supportingEvents: [],
    },
    {
      ascendantSign: 'aquarius',
      representativeTimeLocal: '07:30',
      lagnaLongitudeDeg: 328.8,
      lagnaCuspDistanceDeg: 1.2,
      isNearCusp: true,
      fitScore: 0.68,
      supportingEvents: [],
    },
  ],
  margin: 0.04,
  band: 'leans' as const,
  discriminatingEventCount: 2,
  recordedTimeSign: 'aquarius',
  honestyNoteKey: 'rectify.honesty.leans',
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderRectify() {
  return render(
    <MemoryRouter initialEntries={['/rectify/profile-abc']}>
      <Routes>
        <Route path="/rectify/:profileId" element={<RectifyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RectifyPage', () => {
  let mockRun: ReturnType<typeof vi.fn>;
  let mockReset: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRun = vi.fn().mockResolvedValue(undefined);
    mockReset = vi.fn();
    mockNavigate.mockReset();

    vi.mocked(useRectification).mockReturnValue({
      state: { status: 'idle', result: null, error: null },
      engineReady: true,
      hasEnoughEvents: true,
      detectedMode: 'cusp' as const,
      run: mockRun as never,
      reset: mockReset as never,
      retry: vi.fn() as never,
    });

    useChartLibraryStore.setState({ charts: { 'chart-1': MOCK_CHART as never } });
    useProfilesStore.setState({
      activeProfileId: PROFILE_ID,
      profiles: {
        [PROFILE_ID]: {
          id: PROFILE_ID,
          name: 'Test User',
          createdAt: '2026-01-01T00:00:00Z',
          avatarTint: '#888888',
        } as never,
      },
    });

    vi.spyOn(appEvents, 'emit');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChartLibraryStore.setState({ charts: {} });
  });

  /** Navigate from fit step to results by updating the mock and rerendering. */
  async function navigateToResults(rerender: ReturnType<typeof renderRectify>['rerender']) {
    vi.mocked(useRectification).mockReturnValue({
      state: { status: 'ready', result: MOCK_RESULT as never, error: null },
      engineReady: true,
      hasEnoughEvents: true,
      detectedMode: 'cusp' as const,
      run: mockRun as never,
      reset: mockReset as never,
      retry: vi.fn() as never,
    });
    rerender(
      <MemoryRouter initialEntries={['/rectify/profile-abc']}>
        <Routes>
          <Route path="/rectify/:profileId" element={<RectifyPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByTestId('rectify-results');
  }

  it('renders intro step', async () => {
    renderRectify();
    expect(await screen.findByText('Refine Your Birth Time')).toBeTruthy();
    expect(screen.getByText('Narrow your rising sign')).toBeTruthy();
    expect(screen.getByTestId('intro-start-btn')).toBeTruthy();
  });

  it('Start navigates to events step', async () => {
    renderRectify();
    const startBtn = await screen.findByTestId('intro-start-btn');
    fireEvent.click(startBtn);
    expect(await screen.findByTestId('event-entry-step')).toBeTruthy();
  });

  it('EventEntryStep Continue calls run(cusp) and shows fit step', async () => {
    renderRectify();
    fireEvent.click(await screen.findByTestId('intro-start-btn'));
    const continueBtn = await screen.findByTestId('events-continue-btn');
    fireEvent.click(continueBtn);
    expect(mockRun).toHaveBeenCalledWith('cusp');
    expect(await screen.findByText('Analysing your events…')).toBeTruthy();
  });

  it('rerender with ready status shows results', async () => {
    const { rerender } = renderRectify();
    fireEvent.click(await screen.findByTestId('intro-start-btn'));
    fireEvent.click(await screen.findByTestId('events-continue-btn'));
    await navigateToResults(rerender);
    expect(screen.getByTestId('rectify-results')).toBeTruthy();
  });

  it('confirm candidate with sign flip opens modal and blocks without ack', async () => {
    const { rerender } = renderRectify();
    fireEvent.click(await screen.findByTestId('intro-start-btn'));
    fireEvent.click(await screen.findByTestId('events-continue-btn'));
    await navigateToResults(rerender);

    fireEvent.click(screen.getByTestId('confirm-candidate-btn'));

    const modal = await screen.findByTestId('regen-modal');
    expect(modal).toBeTruthy();
    // sign flip: pisces (candidate) != aquarius (recorded) → checkbox shown
    expect(screen.getByTestId('regen-flip-ack')).toBeTruthy();
    // confirm button disabled until ack
    expect((screen.getByTestId('regen-confirm-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('ack enables confirm which fires emit and navigates', async () => {
    const { rerender } = renderRectify();
    fireEvent.click(await screen.findByTestId('intro-start-btn'));
    fireEvent.click(await screen.findByTestId('events-continue-btn'));
    await navigateToResults(rerender);

    // Open modal
    fireEvent.click(screen.getByTestId('confirm-candidate-btn'));
    await screen.findByTestId('regen-modal');

    // Check the ack checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Confirm button should now be enabled
    const confirmBtn = screen.getByTestId('regen-confirm-btn') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);

    // Click confirm
    fireEvent.click(confirmBtn);

    expect(appEvents.emit).toHaveBeenCalledWith(
      'birth-info-changed',
      expect.objectContaining({
        birth: expect.objectContaining({
          time: '07:30',
          rectifiedTime: '07:45',
          latitude: 18.5,
          longitude: 73.8,
        }),
        profileId: PROFILE_ID,
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('keep recorded fires no emit and navigates back', async () => {
    const { rerender } = renderRectify();
    fireEvent.click(await screen.findByTestId('intro-start-btn'));
    fireEvent.click(await screen.findByTestId('events-continue-btn'));
    await navigateToResults(rerender);

    fireEvent.click(screen.getByTestId('keep-recorded-btn'));

    expect(appEvents.emit).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('window mode: run is called with "window" when detectedMode is window', async () => {
    vi.mocked(useRectification).mockReturnValue({
      state: { status: 'idle', result: null, error: null },
      engineReady: true,
      hasEnoughEvents: true,
      detectedMode: 'window' as const,
      run: mockRun as never,
      reset: mockReset as never,
      retry: vi.fn() as never,
    });

    renderRectify();
    fireEvent.click(await screen.findByTestId('intro-start-btn'));
    fireEvent.click(await screen.findByTestId('events-continue-btn'));
    expect(mockRun).toHaveBeenCalledWith('window');
  });
});
