/**
 * exportGate — pure predicate for the Dashboard's "Export PDF" button.
 *
 * Export is gated on a real, finished interpretation so the print/PDF report is
 * never empty or full of "generating…" placeholders: the structured generation
 * must be `complete` AND the merged reading must carry real (non-placeholder)
 * content.
 */

import type { InterpretationStatus } from '@almamesh/store';

const PLACEHOLDERS = [
  'pending',
  'analysis pending',
  'please retry',
  'generating',
  'loading',
  'llm call failed',
];

/** True when `text` is empty or a known placeholder/incomplete marker. */
export function isPlaceholderContent(text: string | null | undefined): boolean {
  if (!text) return true;
  const normalized = text.trim().toLowerCase();
  return PLACEHOLDERS.some((p) => normalized === p || normalized.startsWith(p));
}

/**
 * True only when a real (non-placeholder) interpretation has finished
 * generating. `hasValidContent` is the Dashboard's existing "at least one real
 * insight field" check on the merged interpretation.
 */
export function canExportPdf(status: InterpretationStatus, hasValidContent: boolean): boolean {
  return status === 'complete' && hasValidContent;
}
