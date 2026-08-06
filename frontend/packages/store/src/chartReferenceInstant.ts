/**
 * chartReferenceInstant — the ONE clock read on the chart path.
 *
 * WHY IT EXISTS. A chart is not determined by birth data alone. The Vimshottari
 * daśā that is "current" depends on a second input: the instant you are asking
 * about. That instant used to be implicit — `BirthInput.referenceDate` was
 * optional, no caller passed it, and the Python engine quietly substituted
 * `datetime.now(UTC)`. So the same birth data produced a different chart on a
 * different day, while README and docs/ARCHITECTURE promised a deterministic,
 * byte-identical one.
 *
 * The fix is not to remove the instant — a chart whose "current" daśā never
 * moves would be wrong for the user. It is to make the instant an INPUT: minted
 * once, here, then recorded on the chart as `calculation_timestamp` and passed
 * to the engine as `referenceDate`. Both are the same value, so the generation
 * date printed on the report IS the key that reproduces the chart.
 *
 * This is the sibling of `apps/web/src/lib/reportPdfDeterminism.ts`: a single
 * seam file that owns one determinism property end to end, so the property has
 * one place to be true and one place to be tested.
 *
 * THE RULE THIS FILE ENFORCES: `newChartReferenceInstant` is the only sanctioned
 * `new Date()` on the chart path. Everything downstream takes the instant as an
 * argument and never reaches for a clock of its own — that is what makes chart
 * generation a pure function of its recorded inputs.
 */

/**
 * Mint the reference instant for one chart generation.
 *
 * `clock` is injectable so tests pin it; the live app calls it with no
 * argument. The result is ISO-8601 UTC with milliseconds — the same shape
 * `Date.prototype.toISOString` produces, so it round-trips through storage and
 * through Python's `datetime.fromisoformat` unchanged.
 */
export function newChartReferenceInstant(clock: Date = new Date()): string {
  if (Number.isNaN(clock.getTime())) {
    throw new Error('newChartReferenceInstant: clock is an Invalid Date');
  }
  return clock.toISOString();
}

/**
 * Fail closed on an instant the engine could not parse.
 *
 * The engine boundary is a `postMessage` hop into a Worker, and a Worker turns
 * a Python `ValueError` into an opaque error string on the far side. Rejecting
 * here means the caller sees which field was wrong, on the thread that supplied
 * it. Mirrors how `toBirthInput` already fails closed on timezone/lat/lon.
 */
export function requireChartReferenceInstant(value: string, field: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(
      `${field}: "${value}" is not a parseable ISO-8601 instant (the chart's reference instant is a required input, never the wall clock)`,
    );
  }
  return value;
}

/** The instant as a `Date`, for the adapters that stamp `calculation_timestamp`. */
export function chartReferenceInstantAsDate(value: string, field: string): Date {
  return new Date(requireChartReferenceInstant(value, field));
}
