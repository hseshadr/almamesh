/**
 * ProfileSettings — the read-only "Your rectification" record section.
 *
 * Proves that once a rectification has been CONFIRMED (a RectificationRecord
 * persisted for the active profile), Settings shows a standing account of it
 * (was X → now Y, with a re-run link) — and shows NOTHING when no record exists.
 *
 * Heavy engine/chart deps are stubbed; the real stores drive the behavior.
 * Synthetic data only — no real birth details.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useProfilesStore, useRectificationRecordsStore } from '@almamesh/store';
import type { RectificationRecord } from '@almamesh/shared-types';
import type { LocalBirthInput } from '@almamesh/store';

import '../../../i18n/config';
import { useSettingsStore } from '../../../stores/settings';

// --- Heavy/engine deps stubbed so the page renders without the runtime ------

vi.mock('../../../providers/AlmaMeshRuntimeProvider', () => ({
  useChartEngine: () => ({ engine: null, error: null }),
}));

const useLagnaPreviewMock = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useLagnaPreview', () => ({
  useLagnaPreview: (...args: unknown[]) => useLagnaPreviewMock(...args),
}));

vi.mock('../../../lib/localChartRead', () => ({
  readLocalPrimaryChart: () =>
    Promise.resolve({
      success: true,
      person_name: 'Test User',
      chart_data: {
        birth_data: {
          birth_datetime_local: '1990-05-15T07:30',
          birth_time_original: '07:30',
          birth_location_details: {
            latitude: 18.5,
            longitude: 73.8,
            timezone: 'Asia/Kolkata',
            city: 'Pune',
            country: 'India',
          },
        },
      },
    }),
}));

vi.mock('../../../components/shared/LocationSearch', () => ({
  LocationSearch: () => <div data-testid="location-search-stub" />,
}));

vi.mock('../../../components/features/settings/BirthTimeComparison', () => ({
  BirthTimeComparison: () => null,
}));

import ProfileSettings from '../ProfileSettings';

const PROFILE_ID = 'profile-rec';

function sampleRecord(overrides: Partial<RectificationRecord> = {}): RectificationRecord {
  return {
    profileId: PROFILE_ID,
    confirmedAt: '2026-06-29T12:00:00.000Z',
    mode: 'cusp',
    band: 'leans',
    margin: 0.04,
    originalTime: '07:30',
    originalSign: 'aquarius',
    rectifiedTime: '07:45',
    rectifiedSign: 'pisces',
    supportingEventIds: ['evt-1', 'evt-2'],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/profile']}>
      <Routes>
        <Route path="/settings/profile" element={<ProfileSettings />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProfileSettings — rectification record', () => {
  beforeEach(() => {
    useLagnaPreviewMock.mockReset();
    useLagnaPreviewMock.mockReturnValue({ status: 'idle' as const });
    useSettingsStore.getState().clearPendingChanges();
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
    useRectificationRecordsStore.setState({ recordsByProfile: {} });
  });

  it('shows the record (original → rectified sign/time + re-run link) when one exists', async () => {
    useRectificationRecordsStore.getState().setRecord(sampleRecord());

    renderPage();

    const section = await screen.findByTestId('rectification-record');
    // Original vs rectified rising signs (title-cased) and times appear.
    expect(section.textContent).toContain('Aquarius');
    expect(section.textContent).toContain('Pisces');
    expect(section.textContent).toContain('07:30');
    expect(section.textContent).toContain('07:45');
    // A link back into the wizard to re-run the rectification.
    const rerun = within(section).getByRole('link');
    expect(rerun.getAttribute('href')).toBe(`/rectify/${PROFILE_ID}`);
  });

  it('renders nothing when the active profile has no rectification record', async () => {
    renderPage();

    // The page itself renders (rectification editing block is always present)…
    expect(await screen.findByText('Birth time rectification')).toBeTruthy();
    // …but the read-only record section is absent.
    expect(screen.queryByTestId('rectification-record')).toBeNull();
  });

  it('does not allow saving a rectified time before both lagna previews resolve', async () => {
    useLagnaPreviewMock.mockImplementation(
      (_engine: unknown, _error: unknown, input: LocalBirthInput | null) => {
        if (input === null) return { status: 'idle' as const };
        const clock = input.rectifiedTime ?? input.time;
        if (clock === '07:15') return { status: 'loading' as const };
        return {
          status: 'ready' as const,
          lagna: { sign: 'Leo', signDegrees: 0.1, nakshatra: 'Magha' },
        };
      },
    );

    const { container } = renderPage();
    await screen.findByText('Birth time rectification');
    const rectifiedTime = screen.getByLabelText<HTMLInputElement>('Rectified time');
    fireEvent.change(rectifiedTime, { target: { value: '07:15' } });

    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save Changes' });
    await waitFor(() => expect(save.disabled).toBe(true));

    // Keyboard/programmatic form submission must not bypass the disabled button.
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('surfaces an entered-time preview failure and retries both previews', async () => {
    useLagnaPreviewMock.mockImplementation(
      (
        _engine: unknown,
        _error: unknown,
        input: LocalBirthInput | null,
        retryAttempt = 0,
      ) => {
        if (input === null) return { status: 'idle' as const };
        const clock = input.rectifiedTime ?? input.time;
        if (clock === '07:30' && retryAttempt === 0) return { status: 'error' as const };
        return {
          status: 'ready' as const,
          lagna: {
            sign: clock === '07:15' ? 'Cancer' : 'Leo',
            signDegrees: 1,
            nakshatra: 'Magha',
          },
        };
      },
    );

    renderPage();
    await screen.findByText('Birth time rectification');
    fireEvent.change(screen.getByLabelText('Rectified time'), { target: { value: '07:15' } });

    const failure = await screen.findByTestId('rectification-preview-failure');
    expect(failure.textContent).toContain('Could not preview the Ascendant');
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save Changes' });
    expect(save.disabled).toBe(true);

    fireEvent.click(within(failure).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByTestId('rectification-preview-failure')).toBeNull());
    expect(save.disabled).toBe(false);
  });
});
