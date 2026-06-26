/**
 * ReportPdfCover — the branded first page of the @react-pdf Vedic report.
 *
 * Editorial cover: the AlmaMesh wordmark + brass kicker pinned top; a faint vector
 * "observatory" motif (concentric ecliptic rings crossed by a node axis with the
 * brass diamond at centre) fills the upper register so the page is no longer
 * top-heavy; then the audience badge, "Prepared for", the person's name set large
 * in Fraunces display, an italic subtitle, a star-ornament rule; and a hairline
 * meta footer (prepared-for / generated-on) anchoring the base. All copy arrives
 * pre-localized via `ReportPdfData`.
 */

import type { ReactElement } from 'react';
import { Circle, Line, Svg, Text, View } from '@react-pdf/renderer';
import { palette, styles } from '../theme';
import type { ReportPdfData } from '../types';

interface ReportPdfCoverProps {
  readonly data: ReportPdfData;
}

/**
 * A faint, purely-vector observatory mark: three concentric ecliptic rings, a
 * tilted node axis, twelve tick marks at the ring edge (the zodiac houses), and
 * the report's signature brass diamond at centre. Font-independent — no glyph is
 * embedded, so it can never trip fontkit on a subsetted face.
 */
function ObservatoryMotif(): ReactElement {
  const s = 150;
  const c = s / 2;
  const rings = [70, 54, 38];
  const ticks = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6);
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {rings.map((r, i) => (
        <Circle
          key={r}
          cx={c}
          cy={c}
          r={r}
          stroke={i === 0 ? palette.ruleStrong : palette.rule}
          strokeWidth={i === 0 ? 0.8 : 0.5}
          fill="none"
        />
      ))}
      {ticks.map((angle, i) => {
        const inner = 70;
        const outer = 76;
        return (
          <Line
            key={i}
            x1={c + Math.cos(angle) * inner}
            y1={c + Math.sin(angle) * inner}
            x2={c + Math.cos(angle) * outer}
            y2={c + Math.sin(angle) * outer}
            stroke={palette.ruleStrong}
            strokeWidth={0.6}
          />
        );
      })}
      {/* The Rāhu–Ketu node axis, tilted. */}
      <Line
        x1={c - Math.cos(0.32) * 70}
        y1={c - Math.sin(0.32) * 70}
        x2={c + Math.cos(0.32) * 70}
        y2={c + Math.sin(0.32) * 70}
        stroke={palette.rule}
        strokeWidth={0.5}
      />
      {/* Brass node markers + centre diamond. */}
      <Circle cx={c - Math.cos(0.32) * 70} cy={c - Math.sin(0.32) * 70} r={2.4} fill={palette.brass} />
      <Circle cx={c + Math.cos(0.32) * 70} cy={c + Math.sin(0.32) * 70} r={2.4} fill={palette.brass} />
      <Circle cx={c} cy={c} r={3.4} fill={palette.brass} />
      <Circle cx={c} cy={c} r={1.3} fill={palette.paper} />
    </Svg>
  );
}

/**
 * A thin brass diamond flanked by hairlines — the report's signature motif.
 * Drawn as a rotated square (pure vector) so it is FONT-INDEPENDENT.
 */
function StarOrnament(): ReactElement {
  return (
    <View style={styles.ornamentRow}>
      <View style={styles.ornamentLine} />
      <View style={styles.ornamentDiamondOuter}>
        <View style={styles.ornamentDiamondInner} />
      </View>
      <View style={styles.ornamentLine} />
    </View>
  );
}

export function ReportPdfCover({ data }: ReportPdfCoverProps): ReactElement {
  return (
    <View style={styles.cover}>
      <View style={styles.coverTopRow}>
        <Text style={styles.wordmark}>AlmaMesh</Text>
        <Text style={styles.coverKicker}>{data.kicker}</Text>
      </View>

      <View style={styles.coverMotifWrap}>
        <ObservatoryMotif />
      </View>

      <View style={styles.coverCenter}>
        <Text style={styles.badge}>{data.audienceLabel}</Text>
        <View style={{ height: 22 }} />
        <Text style={styles.coverEyebrow}>{data.labels.preparedFor}</Text>
        <Text style={styles.coverName}>{data.personName}</Text>
        <StarOrnament />
        <Text style={styles.coverSubtitle}>{data.subtitle}</Text>
      </View>

      <View style={styles.coverMeta}>
        <Text style={styles.coverMetaValue}>{data.labels.footerNote}</Text>
        <Text style={styles.coverGenerated}>{data.generatedOn}</Text>
      </View>
    </View>
  );
}
