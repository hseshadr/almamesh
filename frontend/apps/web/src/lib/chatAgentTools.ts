import type { SiderealChart } from '@almamesh/browser/types';
import { sanitizeChartForLlm, type AgentJsonObject, type AgentTool } from '@almamesh/llm';

export interface ZonedDateTime {
  readonly isoUtc: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly utcOffset: string;
  readonly timeZone: string;
}

function partsRecord(parts: readonly Intl.DateTimeFormatPart[]): Record<string, string> {
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function normalizeOffset(value: string | undefined): string {
  if (value === 'GMT' || value === 'UTC') return '+00:00';
  const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(value ?? '');
  if (!match) throw new Error('The timezone offset could not be resolved.');
  return `${match[1]}${match[2].padStart(2, '0')}:${match[3] ?? '00'}`;
}

/** Format one caller-pinned instant without consulting the wall clock. */
export function currentDateTimeForZone(now: Date, timeZone: string): ZonedDateTime {
  if (Number.isNaN(now.valueOf())) throw new Error('A valid clock instant is required.');
  let values: Record<string, string>;
  try {
    values = partsRecord(
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        timeZoneName: 'longOffset',
      }).formatToParts(now),
    );
  } catch (error) {
    throw new Error(`Invalid timezone: ${timeZone}`, { cause: error });
  }
  return {
    isoUtc: now.toISOString(),
    localDate: `${values.year}-${values.month}-${values.day}`,
    localTime: `${values.hour}:${values.minute}:${values.second}`,
    utcOffset: normalizeOffset(values.timeZoneName),
    timeZone,
  };
}

export interface CreateChatAgentToolsInput {
  readonly chart: SiderealChart;
  readonly chartTimeZone: string;
}

function enumArgument(args: AgentJsonObject, key: string, allowed: readonly string[]): string {
  const value = args[key];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${key} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

/** Build the fixed, read-only capability set for one already-loaded chart. */
export function createChatAgentTools(input: CreateChatAgentToolsInput): readonly AgentTool[] {
  const chartSections = ['overview', 'planets', 'houses', 'yogas', 'dashas'] as const;
  const timingSections = ['dashas', 'transits', 'domains', 'strength'] as const;

  return [
    {
      name: 'get_current_datetime',
      description:
        'Return the pinned current date and time for the chart timezone or UTC.',
      statusLabel: 'Checking the current time',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['chart', 'utc'] },
        },
        required: ['scope'],
        additionalProperties: false,
      },
      execute: (args, context) => {
        const scope = enumArgument(args, 'scope', ['chart', 'utc']);
        const zone = scope === 'chart' ? input.chartTimeZone : 'UTC';
        return { scope, ...currentDateTimeForZone(context.now, zone) };
      },
    },
    {
      name: 'get_chart_facts',
      description:
        'Read one deterministic, identifier-free section of the active chart. Never computes or infers facts.',
      statusLabel: 'Reading chart facts',
      parameters: {
        type: 'object',
        properties: { section: { type: 'string', enum: chartSections } },
        required: ['section'],
        additionalProperties: false,
      },
      execute: (args, context) => {
        const section = enumArgument(args, 'section', chartSections);
        const chart = sanitizeChartForLlm(input.chart, context.now);
        switch (section) {
          case 'overview':
            return {
              ayanamsa_value: chart.ayanamsa_value,
              lagna: chart.lagna,
              navamsa: chart.navamsa,
            };
          case 'planets':
            return chart.planets;
          case 'houses':
            return chart.houses;
          case 'yogas':
            return chart.yogas;
          case 'dashas':
            return chart.dashas ?? { available: false };
          default:
            throw new Error('Unsupported chart section.');
        }
      },
    },
    {
      name: 'get_current_timing',
      description:
        'Read cached deterministic timing data already calculated on this device. Never starts a calculation or network request.',
      statusLabel: 'Reading current timing',
      parameters: {
        type: 'object',
        properties: { section: { type: 'string', enum: timingSections } },
        required: ['section'],
        additionalProperties: false,
      },
      execute: (args, context) => {
        const section = enumArgument(
          args,
          'section',
          timingSections,
        ) as (typeof timingSections)[number];
        const chart = sanitizeChartForLlm(input.chart, context.now);
        if (section === 'dashas') return chart.dashas ?? { available: false };
        const predictive = chart.predictive;
        if (!predictive) return { available: false };
        const value = predictive[section];
        return value ?? { available: false };
      },
    },
  ];
}
