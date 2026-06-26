/**
 * ReportProse — paper-themed markdown renderer for the print-first report.
 *
 * The interpretation text the LLM emits is markdown (**bold**, `- lists`,
 * `## headings`). The old report dumped it into a raw `<p>` with
 * `white-space: pre-wrap`, so the syntax leaked into the PDF as literal
 * asterisks/hashes and a squashed wall of text. This renders that markdown as
 * sanitized HTML, scoped to the `.report-prose` class so the paper/ink
 * typography in `report-print.css` styles it (and never collides with the dark
 * app's shared `.prose` / `MarkdownContent`).
 *
 * It is intentionally tiny and self-contained to the report directory: it does
 * NOT touch the shared `components/ui/MarkdownContent.tsx`.
 */

import type { ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

interface ReportProseProps {
  /** Raw interpretation text, possibly containing markdown. */
  readonly text: string;
  /**
   * Optional extra classes (e.g. `report-avoid-break`) merged onto the prose
   * wrapper. The `.report-prose` base class is always present so the print
   * stylesheet's paper typography applies.
   */
  readonly className?: string;
  /** Optional test id forwarded to the wrapper for the report contract tests. */
  readonly testid?: string;
}

/** Render report interpretation markdown as paper-themed, sanitized HTML. */
export function ReportProse({ text, className, testid }: ReportProseProps): ReactElement {
  const wrapperClass = className ? `report-prose ${className}` : 'report-prose';
  return (
    <div className={wrapperClass} data-testid={testid}>
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown>
    </div>
  );
}
