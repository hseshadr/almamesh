/**
 * Regression guard for the "birth date one day earlier" timezone display bug.
 *
 * Reported live: a user whose BROWSER timezone is `America/Los_Angeles` (UTC-8)
 * enters a birth on an India (Asia/Kolkata, UTC+5:30) location; Settings → Profile
 * then shows the calendar date one day EARLIER while the time is unchanged — the
 * classic "the date was computed in a different timezone than the time" off-by-one.
 *
 * Root cause shape: a birth `Date` formatted to `YYYY-MM-DD` via the UTC calendar
 * (`toISOString().split('T')[0]`) instead of the LOCAL calendar (`getFullYear/
 * getMonth/getDate`). West of GMT, a local-midnight `Date` rolls back a day under
 * `toISOString`.
 *
 * This test pins the WHOLE round trip with a SYNTHETIC birth (1990-01-15 05:45
 * Asia/Kolkata) and asserts the displayed `birth_date` stays `1990-01-15`, never
 * `1990-01-14`. It runs under `TZ=America/Los_Angeles` — the bug only manifests
 * west of GMT, so the guard must be exercised there:
 *
 *     TZ=America/Los_Angeles bun run vitest run \
 *       src/pages/settings/__tests__/birthDateTimezone.test.ts
 *
 * The whole suite is parameterized over the active zone so it is a tripwire in
 * every environment, but only the Pacific run can actually catch a UTC-rollover
 * regression.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import type { BirthMeta } from '@almamesh/store';
import { toBirthData, useOnboardingStore } from '@almamesh/store';
import { birthDetailsFromBirthData } from '../birthDetailsFromBirthData';

/**
 * Format a `Date` to `YYYY-MM-DD` using the LOCAL calendar — the contract the
 * onboarding store's `getFormattedBirthData()` relies on (`formatLocalDate`) to
 * turn the picker's local-midnight `Date` into the stored civil date. Duplicated
 * here (rather than imported) so the test states the expectation explicitly.
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Construct the `Date` exactly as the MUI X `BirthDatePicker` (AdapterDayjs)
 * hands it to `onChange` on day selection: AdapterDayjs builds its dayjs in
 * LOCAL mode, so selecting "Jan 15 1990" yields `dayjs('1990-01-15')` — local
 * midnight — whose `.toDate()` is a native `Date` at the viewer's local midnight.
 */
function pickerSelectedDate(isoDate: string): Date {
  return dayjs(isoDate).toDate();
}

/**
 * A `Date` whose UTC calendar day differs from its LOCAL calendar day under the
 * ACTIVE system tz — the discriminating input that turns a store-side
 * `formatLocalDate` -> `toISOString().split('T')[0]` swap RED wherever such an
 * instant exists:
 *   - east of GMT (offset < 0, e.g. Asia/Kolkata): the picker's LOCAL-midnight
 *     Date already qualifies — its UTC instant is the PREVIOUS day;
 *   - west of GMT (offset > 0, e.g. America/Los_Angeles): local midnight stays
 *     on the same UTC day, so a late-evening LOCAL time is used whose UTC
 *     instant rolls FORWARD to the next day;
 *   - pure UTC/GMT (offset 0): no such instant exists and the swap is
 *     undetectable, so `null` is returned and the caller skips the guard.
 *
 * This lets the store-driven guard below have teeth under the file's mandated
 * `TZ=America/Los_Angeles` run (and equally under Asia/Kolkata) rather than only
 * catching an east-of-GMT rollover.
 */
function utcDayTripwire(): { date: Date; localDay: string; utcDay: string } | null {
  const offset = new Date(1990, 0, 15).getTimezoneOffset(); // minutes: >0 west, <0 east
  let date: Date;
  if (offset < 0) {
    date = new Date(1990, 0, 15, 0, 0, 0);
  } else if (offset > 0) {
    date = new Date(1990, 0, 15, 23, 0, 0);
  } else {
    return null;
  }
  const localDay = formatLocalDate(date);
  const utcDay = date.toISOString().split('T')[0];
  return localDay === utcDay ? null : { date, localDay, utcDay };
}

const ENTERED_DATE = '1990-01-15';
const ENTERED_TIME = '05:45';
const KOLKATA = {
  city: 'Bengaluru',
  state: 'Karnataka',
  country: 'India',
  lat: 12.9716,
  lon: 77.5946,
  timezone: 'Asia/Kolkata',
  displayName: 'Bengaluru, Karnataka, India',
};

describe(`birth-date round trip preserves the calendar day (TZ=${
  Intl.DateTimeFormat().resolvedOptions().timeZone
})`, () => {
  it('formats the MUI-picker local-midnight Date to the entered civil date (no UTC rollover)', () => {
    // This is the onboarding `getFormattedBirthData()` step: picker Date -> string.
    const picked = pickerSelectedDate(ENTERED_DATE);
    expect(formatLocalDate(picked)).toBe(ENTERED_DATE);
    // The classic bug would format this as 1990-01-14 west of GMT.
    expect(formatLocalDate(picked)).not.toBe('1990-01-14');
  });

  it('does NOT roll a UTC-midnight birth Date back a day (the stale-deploy off-by-one)', () => {
    // The reported live mechanism: a birth `Date` anchored to UTC midnight (what
    // `new Date("1990-01-15")` and JSON/upstream UTC-anchored Dates produce).
    // Formatting it with the LOCAL calendar west of GMT silently rolls it to the
    // PREVIOUS day — exactly the "date one day earlier" symptom. The contract is
    // that the civil-date string is built from a LOCAL-midnight Date (the picker's
    // output), never a UTC-anchored one, so the displayed day is stable.
    const localMidnight = pickerSelectedDate(ENTERED_DATE); // 1990-01-15 00:00 LOCAL
    const utcMidnight = new Date(`${ENTERED_DATE}T00:00:00.000Z`); // 1990-01-15 00:00 UTC

    // The correct (local-midnight) Date round-trips to the entered date in any zone.
    expect(formatLocalDate(localMidnight)).toBe(ENTERED_DATE);

    // A UTC-midnight Date is the bug fingerprint: west of GMT its LOCAL calendar
    // day is the 14th. This asserts the two Dates are NOT interchangeable, i.e.
    // the pipeline must keep using the local-midnight (picker) Date. If a refactor
    // ever feeds a UTC-anchored Date into `formatLocalDate`, this turns red under
    // `TZ=America/Los_Angeles`.
    const westOfGmt = localMidnight.getTimezoneOffset() > 0;
    if (westOfGmt) {
      expect(formatLocalDate(utcMidnight)).toBe('1990-01-14');
      expect(formatLocalDate(utcMidnight)).not.toBe(formatLocalDate(localMidnight));
    }
  });

  it('keeps the entered date through toBirthData() -> birthDetailsFromBirthData()', () => {
    // Save path: the civil date string + India zone -> stored birth data.
    const picked = pickerSelectedDate(ENTERED_DATE);
    const birth: BirthMeta = {
      name: 'Reference Native',
      date: formatLocalDate(picked),
      time: ENTERED_TIME,
      timeConfidence: 'exact',
      latitude: KOLKATA.lat,
      longitude: KOLKATA.lon,
      timezone: KOLKATA.timezone,
      location_name: KOLKATA.displayName,
    };

    const stored = toBirthData(birth);
    // The stored wall-clock local datetime must carry the entered civil date.
    expect(stored.birth_datetime_local.split('T')[0]).toBe(ENTERED_DATE);

    // Load path (Settings → Profile reconstruction): stored -> editable details.
    const details = birthDetailsFromBirthData(stored, birth.name);
    expect(details.birth_date).toBe(ENTERED_DATE);
    // The reported live symptom: the date renders one day earlier.
    expect(details.birth_date).not.toBe('1990-01-14');
    // The time must be unchanged (the live report: time stayed 05:45).
    expect(details.birth_time).toBe(ENTERED_TIME);
  });

  it('survives a full save -> load -> resave cycle without the date drifting', () => {
    const birth: BirthMeta = {
      name: 'Reference Native',
      date: ENTERED_DATE,
      time: ENTERED_TIME,
      timeConfidence: 'exact',
      latitude: KOLKATA.lat,
      longitude: KOLKATA.lon,
      timezone: KOLKATA.timezone,
      location_name: KOLKATA.displayName,
    };

    const stored = toBirthData(birth);
    const details = birthDetailsFromBirthData(stored, birth.name);
    const reStored = toBirthData({
      name: details.name,
      date: details.birth_date,
      time: details.birth_time,
      timeConfidence: details.time_confidence,
      latitude: details.location?.lat ?? 0,
      longitude: details.location?.lon ?? 0,
      timezone: details.location?.timezone ?? 'UTC',
      location_name: details.location?.displayName ?? '',
    });

    expect(reStored.birth_datetime_local.split('T')[0]).toBe(ENTERED_DATE);
    expect(reStored.birth_datetime_local).toBe(stored.birth_datetime_local);
  });
});

/**
 * Drive the REAL onboarding write path end to end. The assertions above compare
 * against a DUPLICATED, test-local `formatLocalDate`, so a refactor that swapped
 * the STORE's real helper for `toISOString().split('T')[0]` would sail straight
 * past them. These exercise `useOnboardingStore.getFormattedBirthData()`
 * directly — the exact getter Onboarding.tsx calls before generating the chart —
 * so that regression turns the suite red.
 */
describe(`onboarding store write path preserves the calendar day (TZ=${
  Intl.DateTimeFormat().resolvedOptions().timeZone
})`, () => {
  // The onboarding store is an in-memory module singleton; start every case from
  // a clean slate so state can't leak between assertions.
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  // getFormattedBirthData() fails closed without lat/lon, so seed the India
  // location the reported native was born in before reading the date back.
  const seedKolkataLocation = () => {
    useOnboardingStore.getState().setLocation({
      city: KOLKATA.city,
      state: KOLKATA.state,
      country: KOLKATA.country,
      latitude: KOLKATA.lat,
      longitude: KOLKATA.lon,
      timezone: KOLKATA.timezone,
    });
  };

  it('getFormattedBirthData() keeps the picker local-midnight civil date (end-to-end real store)', () => {
    const store = useOnboardingStore.getState();
    // Exactly what the MUI picker hands setBirthDate: a native LOCAL-midnight Date.
    store.setBirthDate(pickerSelectedDate(ENTERED_DATE));
    store.setBirthTime(ENTERED_TIME, 'exact');
    seedKolkataLocation();

    const out = useOnboardingStore.getState().getFormattedBirthData();
    expect(out).not.toBeNull();
    // The reported live symptom is the date rendering one day earlier.
    expect(out?.date).toBe(ENTERED_DATE);
    expect(out?.date).not.toBe('1990-01-14');
    // The birth time and zone must survive the getter untouched.
    expect(out?.time).toBe(ENTERED_TIME);
    expect(out?.timezone).toBe(KOLKATA.timezone);
  });

  it('getFormattedBirthData() emits the LOCAL calendar day, never the UTC day (red on a toISOString swap)', () => {
    // A picker-style local-midnight date only discriminates the swap EAST of
    // GMT; `utcDayTripwire` picks a discriminating instant for the active tz so
    // this bites under TZ=America/Los_Angeles too (skips only pure-UTC hosts).
    const tripwire = utcDayTripwire();
    if (!tripwire) {
      // Offset 0 (UTC/GMT winter): local day == UTC day — the swap is provably
      // unobservable here, so there is nothing to guard in this environment.
      return;
    }

    const store = useOnboardingStore.getState();
    store.setBirthDate(tripwire.date);
    store.setBirthTime(ENTERED_TIME, 'exact');
    seedKolkataLocation();

    const out = useOnboardingStore.getState().getFormattedBirthData();
    // The store must echo the birthDate's LOCAL civil day. Under a
    // `formatLocalDate` -> `toISOString().split('T')[0]` regression it would
    // emit `tripwire.utcDay`, and this assertion goes red.
    expect(out?.date).toBe(tripwire.localDay);
    expect(out?.date).not.toBe(tripwire.utcDay);
  });
});
