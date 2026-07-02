/**
 * ReportPdfRectification — Section XII: Birth Time Authority. Entered vs
 * working time + rising sign, the fit mode, the QUALITATIVE confidence band
 * and the confirm date, the supporting life events, and the honest caveat
 * ("resolves the sign, not the minute"). Phase 2 (Spec 062): when the slice
 * carries the optional snapshot tables (v2 records), the candidate
 * comparison, per-event evidence, quiet-period misses and prior note print
 * too — v1 slices render the classic section unchanged. All values arrive
 * pre-localized on `ReportPdfRectification`; by contract the slice carries NO
 * percentage, margin number, or fit score. Pure presentation.
 */

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { palette, styles, type as typeScale, FONT_MONO } from '../theme';
import type { ReportPdfData } from '../types';
import { ReportPdfHeading } from './ReportPdfHeading';
import { ReportPdfTable } from './ReportPdfTable';

const local = StyleSheet.create({
  factLabel: {
    width: 168,
    fontFamily: FONT_MONO,
    fontSize: typeScale.caption,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: palette.muted,
  },
  factValue: {
    flex: 1,
    fontSize: typeScale.small,
    color: palette.ink,
  },
});

interface ReportPdfRectificationProps {
  readonly data: ReportPdfData;
}

export function ReportPdfRectification({ data }: ReportPdfRectificationProps): ReactElement | null {
  const rectification = data.rectification;
  if (!rectification) {
    return null;
  }
  return (
    <View>
      <ReportPdfHeading
        eyebrow={rectification.chrome.eyebrow}
        title={rectification.chrome.title}
        intro={rectification.chrome.intro}
      />

      <View style={styles.detailPanel} wrap={false}>
        {rectification.facts.map((fact, index) => (
          <View
            key={fact.label}
            style={index === rectification.facts.length - 1 ? styles.detailRowLast : styles.detailRow}
          >
            <Text style={local.factLabel}>{fact.label}</Text>
            <Text style={local.factValue}>{fact.value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.subLabel}>{rectification.eventsHeading}</Text>
      {rectification.events.rows.length === 0 ? (
        <Text style={styles.detailNote}>{rectification.eventsEmpty}</Text>
      ) : (
        <ReportPdfTable table={rectification.events} />
      )}

      {/* Phase 2 (Spec 062): the full evidence story from a v2 snapshot. */}
      {rectification.candidates !== undefined && (
        <>
          <Text style={styles.subLabel}>{rectification.candidatesHeading}</Text>
          <ReportPdfTable table={rectification.candidates} />
        </>
      )}
      {rectification.evidence !== undefined && (
        <>
          <Text style={styles.subLabel}>{rectification.evidenceHeading}</Text>
          <ReportPdfTable table={rectification.evidence} />
        </>
      )}
      {rectification.missNotes !== undefined && rectification.missNotes.length > 0 && (
        <>
          <Text style={styles.subLabel}>{rectification.missesHeading}</Text>
          {rectification.missNotes.map((note) => (
            <Text key={note} style={styles.detailNote}>
              {note}
            </Text>
          ))}
        </>
      )}
      {rectification.priorNote !== undefined && (
        <Text style={styles.detailNote}>{rectification.priorNote}</Text>
      )}

      <Text style={styles.detailNote}>{rectification.caveat}</Text>
    </View>
  );
}
