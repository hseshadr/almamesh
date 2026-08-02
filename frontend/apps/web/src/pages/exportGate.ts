/**
 * exportGate — the placeholder rules for reading QUALITY checks.
 *
 * REVERSED CONTRACT (deliberate): this module used to also export
 * `canExportPdf(status, hasValidContent)`, which blocked the Dashboard's
 * "Export PDF" button until a real, finished AI interpretation existed. That
 * was the defect, not the feature — everything the report needs is already
 * persisted on the device, so a user with no AI key could never export a
 * document that is complete without any AI at all. The only real precondition
 * is a stored chart, and `useReportPdfExport` owns it (`canExport`).
 *
 * What remains here is `isPlaceholderContent`: the single source of truth for
 * "is this string a real reading, or a 'generating…' stub?", used by the
 * Dashboard to decide whether to RENDER reading prose — never whether to allow
 * an export.
 */

const PLACEHOLDERS = [
  'pending',
  'analysis pending',
  'please retry',
  'generating',
  'loading',
  'llm call failed',
];

/**
 * True when `text` is empty, whitespace-only, or a known placeholder marker.
 *
 * The whitespace case is deliberate: a summary of `"   "` is not a reading, and
 * treating it as real content rendered an empty prose block on screen.
 */
export function isPlaceholderContent(text: string | null | undefined): boolean {
  if (!text) return true;
  const normalized = text.trim().toLowerCase();
  if (normalized === '') return true;
  return PLACEHOLDERS.some((p) => normalized === p || normalized.startsWith(p));
}
