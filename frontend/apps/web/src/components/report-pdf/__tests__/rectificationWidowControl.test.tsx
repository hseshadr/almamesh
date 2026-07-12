import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReportPdfData, ReportPdfTable } from '../types';
import { ReportPdfRectification } from '../sections/ReportPdfRectification';

vi.mock('@react-pdf/renderer', () => ({
  Font: {
    register: vi.fn(),
    registerHyphenationCallback: vi.fn(),
  },
  StyleSheet: { create: <T,>(styles: T): T => styles },
  Text: ({
    children,
    minPresenceAhead,
  }: {
    readonly children?: ReactNode;
    readonly minPresenceAhead?: number;
  }) => <span data-min-presence-ahead={minPresenceAhead}>{children}</span>,
  View: ({
    children,
    wrap,
    minPresenceAhead,
  }: {
    readonly children?: ReactNode;
    readonly wrap?: boolean;
    readonly minPresenceAhead?: number;
  }) => (
    <div
      data-pdf-view="true"
      data-pdf-wrap={wrap === undefined ? undefined : String(wrap)}
      data-min-presence-ahead={minPresenceAhead}
    >
      {children}
    </div>
  ),
}));

const TABLE: ReportPdfTable = {
  headers: ['Column'],
  rows: [{ cells: ['Body row'] }],
};

const HEADINGS = ['Events', 'Candidates', 'Evidence', 'Misses'] as const;

const DATA = {
  rectification: {
    chrome: { eyebrow: 'Section XII', title: 'Birth Time Authority', intro: 'Introduction' },
    facts: [],
    eventsHeading: HEADINGS[0],
    events: TABLE,
    eventsEmpty: 'No events',
    candidatesHeading: HEADINGS[1],
    candidates: TABLE,
    evidenceHeading: HEADINGS[2],
    evidence: TABLE,
    missesHeading: HEADINGS[3],
    missNotes: ['A quiet-period miss'],
    caveat: 'Caveat',
  },
} as unknown as ReportPdfData;

describe('ReportPdfRectification subsection widow control', () => {
  it('reserves 120pt after every subsection heading', () => {
    render(<ReportPdfRectification data={DATA} />);

    for (const heading of HEADINGS) {
      const wrapper = screen.getByText(heading).closest('[data-pdf-view="true"]');
      expect(wrapper?.getAttribute('data-pdf-wrap'), heading).toBe('false');
      expect(screen.getByText(heading).getAttribute('data-min-presence-ahead'), heading).toBe('180');
    }
  });
});
