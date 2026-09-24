/**
 * The predictive reference instant the live verify-* journeys seed into a chart.
 *
 * Mirrors `predictiveReferenceInstant(now, timeZone)` in `src/lib/predictive.ts`: midnight
 * (written `...T00:00:00Z`) of the calendar day the CHART's timezone is on. The app keys its
 * predictive request by that value, so a script that seeded the UTC calendar day instead
 * drifted off the app's key whenever the two days differed (Asia/Kolkata: 18:30Z–24:00Z).
 * Parity with the app helper is pinned by `src/lib/predictiveReferenceScript.test.ts`.
 *
 * @param {string} timeZone IANA timezone of the chart (e.g. 'Asia/Kolkata')
 * @param {Date} [now]
 * @returns {string}
 */
export function chartDayReferenceInstant(timeZone, now = new Date()) {
  if (Number.isNaN(now.valueOf())) throw new Error('A valid clock instant is required.')
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T00:00:00Z`
}
