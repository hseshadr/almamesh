import { describe, expect, it } from 'vitest';

import { createChatAgentTools, currentDateTimeForZone } from '../chatAgentTools';
import type { SiderealChart } from '@almamesh/browser/types';

describe('currentDateTimeForZone', () => {
  const now = new Date('2026-03-08T09:30:00.000Z');

  it('formats the caller-pinned instant in an IANA timezone across DST', () => {
    expect(currentDateTimeForZone(now, 'America/Los_Angeles')).toEqual({
      isoUtc: '2026-03-08T09:30:00.000Z',
      localDate: '2026-03-08',
      localTime: '01:30:00',
      utcOffset: '-08:00',
      timeZone: 'America/Los_Angeles',
    });
  });

  it('handles a non-DST half-hour timezone deterministically', () => {
    expect(currentDateTimeForZone(now, 'Asia/Kolkata')).toMatchObject({
      localDate: '2026-03-08',
      localTime: '15:00:00',
      utcOffset: '+05:30',
      timeZone: 'Asia/Kolkata',
    });
  });

  it('fails closed for an invalid timezone', () => {
    expect(() => currentDateTimeForZone(now, 'not/a-zone')).toThrow(/timezone/i);
  });
});

describe('createChatAgentTools', () => {
  const chart = {
    ayanamsa_value: 24,
    lagna: { sign: 'aries', longitude: 10 },
    planets: [],
    houses: [],
    yogas: [],
  } as unknown as SiderealChart;

  it('exposes exactly the three bounded read-only capabilities', () => {
    const tools = createChatAgentTools({
      chart,
      chartTimeZone: 'Asia/Kolkata',
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      'get_current_datetime',
      'get_chart_facts',
      'get_current_timing',
    ]);
  });

  it('uses the turn-pinned clock and chart timezone without wall-clock reads', async () => {
    const [timeTool] = createChatAgentTools({
      chart,
      chartTimeZone: 'Asia/Kolkata',
    });
    await expect(
      Promise.resolve(
        timeTool.execute(
          { scope: 'chart' },
          { now: new Date('2026-03-08T09:30:00.000Z'), signal: new AbortController().signal },
        ),
      ),
    ).resolves.toMatchObject({
      scope: 'chart',
      localTime: '15:00:00',
      timeZone: 'Asia/Kolkata',
    });
  });

  it('exposes only chart and UTC time scopes and rejects device context', () => {
    const [timeTool] = createChatAgentTools({ chart, chartTimeZone: 'Asia/Kolkata' });

    expect(timeTool.parameters).toMatchObject({
      properties: {
        scope: { enum: ['chart', 'utc'] },
      },
    });
    expect(() =>
      timeTool.execute(
        { scope: 'device' },
        { now: new Date('2026-03-08T09:30:00.000Z'), signal: new AbortController().signal },
      ),
    ).toThrow(/scope must be one of: chart, utc/);
  });

  it('returns only sanitizer-allowlisted chart data', async () => {
    const chartWithPii = { ...chart, name: 'Private Name', city: 'Secret City' } as SiderealChart;
    const tools = createChatAgentTools({ chart: chartWithPii, chartTimeZone: 'UTC' });
    const overview = await tools[1].execute(
      { section: 'overview' },
      { now: new Date('2026-03-08T09:30:00.000Z'), signal: new AbortController().signal },
    );
    expect(JSON.stringify(overview)).not.toContain('Private Name');
    expect(JSON.stringify(overview)).not.toContain('Secret City');
  });
});
