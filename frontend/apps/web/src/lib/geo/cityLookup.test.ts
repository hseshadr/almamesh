import { describe, it, expect } from 'vitest';
import { searchCities, timezoneForCoordinates } from './cityLookup';

describe('cityLookup (offline geocoder)', () => {
    it('resolves Chennai to its coordinates and IANA timezone', async () => {
        const results = await searchCities('Chennai');
        const chennai = results.find((r) => r.city === 'Chennai');

        expect(chennai).toBeDefined();
        expect(chennai!.latitude).toBeCloseTo(13.08, 1);
        expect(chennai!.longitude).toBeCloseTo(80.27, 1);
        expect(chennai!.timezone).toBe('Asia/Kolkata');
        expect(chennai!.country).toBe('India');
        expect(chennai!.countryCode).toBe('IN');
    });

    it('resolves New York to America/New_York', async () => {
        const results = await searchCities('New York');
        const ny = results.find((r) => r.countryCode === 'US' && r.city.startsWith('New York'));

        expect(ny).toBeDefined();
        expect(ny!.timezone).toBe('America/New_York');
        expect(ny!.latitude).toBeCloseTo(40.71, 1);
        expect(ny!.longitude).toBeCloseTo(-74.0, 1);
    });

    it('ranks the most populous match first for an exact-name query', async () => {
        const results = await searchCities('London');
        expect(results.length).toBeGreaterThan(0);
        // London, GB (8M+) should outrank smaller Londons (e.g. Ontario, Ohio).
        expect(results[0].city).toBe('London');
        expect(results[0].countryCode).toBe('GB');
        expect(results[0].timezone).toBe('Europe/London');
    });

    it('returns no results for queries shorter than two characters', async () => {
        expect(await searchCities('')).toEqual([]);
        expect(await searchCities('a')).toEqual([]);
    });

    it('returns an empty list for a nonsense query (city-not-found)', async () => {
        const results = await searchCities('zzzzzqqqqqxxxxx');
        expect(results).toEqual([]);
    });

    it('every result carries a non-empty IANA timezone', async () => {
        const results = await searchCities('Tokyo');
        expect(results.length).toBeGreaterThan(0);
        for (const result of results) {
            expect(result.timezone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+/);
        }
    });

    it('timezoneForCoordinates resolves lat/lon to an IANA zone offline', () => {
        expect(timezoneForCoordinates(13.08, 80.27)).toBe('Asia/Kolkata');
        expect(timezoneForCoordinates(35.68, 139.69)).toBe('Asia/Tokyo');
    });
});
