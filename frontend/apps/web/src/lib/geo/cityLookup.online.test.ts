import { describe, it, expect, vi, afterEach } from 'vitest';

import { searchCities } from './cityLookup';

const CHENNAI_ONLINE = {
  name: 'Chennai',
  latitude: 13.08784,
  longitude: 80.27847,
  country: 'India',
  country_code: 'IN',
  admin1: 'Tamil Nadu',
  timezone: 'Asia/Kolkata',
  population: 4646732,
  feature_code: 'PPLA',
};

function stubOnline(navigatorOnLine = true) {
  vi.stubGlobal('navigator', { onLine: navigatorOnLine });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchCities (online-primary + offline fallback)', () => {
  it('uses the online geocoder when reachable (result carries admin1 -> state)', async () => {
    stubOnline(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ results: [CHENNAI_ONLINE] }) }));
    const results = await searchCities('chennai');
    expect(results[0].city).toBe('Chennai');
    expect(results[0].state).toBe('Tamil Nadu'); // only the online path supplies admin1
  });

  it('falls back to the bundled offline list when the online request fails', async () => {
    stubOnline(true);
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const results = await searchCities('Chennai');
    expect(fetchMock).toHaveBeenCalled(); // it tried online first
    expect(results.length).toBeGreaterThan(0); // then resolved offline
    expect(results.some((r) => r.city === 'Chennai')).toBe(true);
    expect(results[0].timezone).toBeTruthy(); // offline still resolves an IANA zone
  });

  it('skips the network entirely and uses the offline list when navigator is offline', async () => {
    stubOnline(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const results = await searchCities('Chennai');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(results.some((r) => r.city === 'Chennai')).toBe(true);
  });

  it('returns [] for queries under two chars without any network call', async () => {
    stubOnline(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await searchCities('a')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
