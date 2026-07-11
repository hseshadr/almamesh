import { describe, it, expect, vi, afterEach } from 'vitest';

import { geocodeCitiesOnline } from './onlineGeocoder';

function stubFetch(payload: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const CHENNAI = {
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

describe('geocodeCitiesOnline', () => {
  it('maps an Open-Meteo result to a CityMatch (incl. admin1 -> state)', async () => {
    stubFetch({ results: [CHENNAI] });
    const [m] = await geocodeCitiesOnline('chennai');
    expect(m).toMatchObject({
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      countryCode: 'IN',
      latitude: 13.08784,
      longitude: 80.27847,
      timezone: 'Asia/Kolkata',
      population: 4646732,
    });
    expect(m.displayName).toBe('Chennai, Tamil Nadu, India');
  });

  it('calls the Open-Meteo endpoint with the query, count, language and json format', async () => {
    const fetchMock = stubFetch({ results: [] });
    await geocodeCitiesOnline('paris', { language: 'pt', limit: 5 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('geocoding-api.open-meteo.com/v1/search');
    expect(url).toContain('name=paris');
    expect(url).toContain('count=5');
    expect(url).toContain('language=pt');
    expect(url).toContain('format=json');
  });

  it('returns [] when the response has no results array', async () => {
    stubFetch({ generationtime_ms: 0.1 });
    expect(await geocodeCitiesOnline('zzzznowhere')).toEqual([]);
  });

  it('returns [] without fetching for queries under 2 chars', async () => {
    const fetchMock = stubFetch({ results: [CHENNAI] });
    expect(await geocodeCitiesOnline('a')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-ok response (so the caller can fall back to offline)', async () => {
    stubFetch({}, false, 503);
    await expect(geocodeCitiesOnline('paris')).rejects.toThrow();
  });

  it('throws when the network is unreachable (fetch rejects)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(geocodeCitiesOnline('paris')).rejects.toThrow();
  });

  it('drops non-populated-place results (feature_code not PPL*)', async () => {
    stubFetch({
      results: [
        { name: 'France', latitude: 46, longitude: 2, country: 'France', country_code: 'FR', timezone: 'Europe/Paris', feature_code: 'PCLI' },
        { ...CHENNAI },
      ],
    });
    const out = await geocodeCitiesOnline('fr');
    expect(out).toHaveLength(1);
    expect(out[0].city).toBe('Chennai');
  });

  it('falls back to an on-device IANA timezone when the API omits one', async () => {
    stubFetch({ results: [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, country: 'France', country_code: 'FR', admin1: 'Île-de-France', feature_code: 'PPLC' }] });
    const [m] = await geocodeCitiesOnline('paris');
    expect(m.timezone).toBe('Europe/Paris');
  });

  it('aborts a hung request after the timeout so the caller can fall back', async () => {
    // A fetch that never resolves on its own but rejects when its signal aborts
    // — exactly how the browser behaves on a stalled request. Without a timeout
    // the typeahead would hang forever; with one it rejects and searchCities
    // falls back to the offline list.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }),
      ),
    );
    await expect(geocodeCitiesOnline('paris', { timeoutMs: 30 })).rejects.toThrow();
  });
});
