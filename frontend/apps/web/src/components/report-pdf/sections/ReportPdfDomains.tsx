/**
 * ReportPdfDomains — Section XI: the seven life-domain forecast blocks. Each
 * almanac card carries the domain name + strength band, the key-graha line,
 * the current-emphasis line and the dated upcoming windows — all pre-formatted
 * on `ReportPdfDomains` (the engine's deterministic synthesis, not AI). Cards
 * never split across pages (`wrap={false}`).
 */

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { palette, type as typeScale, FONT_DISPLAY, FONT_MONO } from '../theme';
import type { ReportPdfData, ReportPdfDomainBlock } from '../types';
import { ReportPdfHeading } from './ReportPdfHeading';

const local = StyleSheet.create({
  card: {
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: palette.rule,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: palette.card,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 3,
  },
  name: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 600,
    fontSize: typeScale.lead,
    color: palette.inkSoft,
  },
  band: {
    fontFamily: FONT_MONO,
    fontSize: typeScale.micro,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: palette.brassDeep,
  },
  line: {
    fontSize: typeScale.caption,
    color: palette.ink,
    lineHeight: 1.5,
    marginBottom: 2,
  },
  windowsLabel: {
    fontFamily: FONT_MONO,
    fontSize: typeScale.micro,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: palette.faint,
    marginTop: 4,
    marginBottom: 2,
  },
  window: {
    fontSize: typeScale.caption,
    color: palette.muted,
    lineHeight: 1.5,
  },
});

function DomainCard({ block }: { block: ReportPdfDomainBlock }): ReactElement {
  return (
    <View style={local.card} wrap={false}>
      <View style={local.head}>
        <Text style={local.name}>{block.name}</Text>
        <Text style={local.band}>{block.band}</Text>
      </View>
      <Text style={local.line}>{block.strengthLine}</Text>
      <Text style={local.line}>{block.emphasisLine}</Text>
      <Text style={local.windowsLabel}>{block.windowsLabel}</Text>
      {block.windows.length === 0 ? (
        <Text style={local.window}>{block.windowsEmpty}</Text>
      ) : (
        block.windows.map((window, index) => (
          <Text key={index} style={local.window}>
            {window}
          </Text>
        ))
      )}
    </View>
  );
}

interface ReportPdfDomainsProps {
  readonly data: ReportPdfData;
}

export function ReportPdfDomains({ data }: ReportPdfDomainsProps): ReactElement | null {
  const domains = data.domains;
  if (!domains) {
    return null;
  }
  return (
    <View>
      <ReportPdfHeading
        eyebrow={domains.chrome.eyebrow}
        title={domains.chrome.title}
        intro={domains.chrome.intro}
      />
      {domains.blocks.map((block) => (
        <DomainCard key={block.name} block={block} />
      ))}
    </View>
  );
}
