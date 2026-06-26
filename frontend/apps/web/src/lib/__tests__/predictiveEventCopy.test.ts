import { describe, it, expect } from 'vitest';
import i18n from '../../i18n/config';
import {
  domainWindowLabel,
  grahaName,
  signName,
  slowHitTargetLabel,
  timelineEventLabel,
} from '../predictiveEventCopy';
import { TRANSIT_CTX, DOMAINS_CTX } from '../../test/predictiveFixtures';

const t = i18n.getFixedT('en');

describe('grahaName / signName', () => {
  it('localizes engine tokens', () => {
    expect(grahaName(t, 'saturn')).toBe('Saturn');
    expect(signName(t, 'aquarius')).toBe('Aquarius');
  });

  it('falls back to Title-Case for unknown tokens (verbatim, never invented)', () => {
    expect(grahaName(t, 'chiron')).toBe('Chiron');
  });
});

describe('timelineEventLabel', () => {
  it('renders a sign ingress as "<graha> enters <sign>"', () => {
    const ingress = TRANSIT_CTX.timeline.events[0];
    expect(timelineEventLabel(t, ingress)).toBe('Jupiter enters Cancer');
  });

  it('renders a dasha change with both lords', () => {
    const change = TRANSIT_CTX.timeline.events[1];
    expect(timelineEventLabel(t, change)).toContain('Mercury');
    expect(timelineEventLabel(t, change)).toContain('Ketu');
  });

  it('degrades to the raw engine descriptor when fields are missing', () => {
    const broken = { ...TRANSIT_CTX.timeline.events[0], graha: null };
    expect(timelineEventLabel(t, broken)).toBe('jupiter.ingress.cancer');
  });
});

describe('domainWindowLabel', () => {
  it('recovers the ingress sign from the stable descriptor key', () => {
    const window = DOMAINS_CTX.forecasts.career.upcoming_windows[0];
    expect(domainWindowLabel(t, window)).toBe('Jupiter enters Cancer');
  });

  it('renders a dasha window from its trigger', () => {
    const window = DOMAINS_CTX.forecasts.career.upcoming_windows[1];
    expect(domainWindowLabel(t, window)).toContain('Ketu');
  });
});

describe('slowHitTargetLabel', () => {
  it('maps the open natal-point vocabulary', () => {
    expect(slowHitTargetLabel(t, 'moon')).toBe('natal Moon');
    expect(slowHitTargetLabel(t, 'lagna')).toBe('Lagna');
    expect(slowHitTargetLabel(t, 'natal_saturn')).toBe('natal Saturn');
  });
});
