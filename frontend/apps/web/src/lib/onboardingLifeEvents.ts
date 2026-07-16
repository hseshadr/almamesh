import { structureLifeEvents, type PromptLanguage, type ProviderConfig } from '@almamesh/llm';
import type { LifeEventCategory } from '@almamesh/shared-types';
import type { LifeEventInput } from '@almamesh/store';

interface PreparationOptions {
  readonly aiConfigured: boolean;
  readonly config: ProviderConfig;
  readonly language: PromptLanguage;
}

interface CategoryRule {
  readonly category: LifeEventCategory;
  readonly pattern: RegExp;
}

const CATEGORY_RULES: readonly CategoryRule[] = [
  { category: 'marriage', pattern: /\b(marri(?:ed|age)|wedding|casei|case|casou|matrimonio|casamento)\b/i },
  { category: 'engagement', pattern: /\bengag(?:ed|ement)\b/i },
  { category: 'breakup', pattern: /\b(divorc(?:e|ed)|breakup|separat(?:ed|ion))\b/i },
  { category: 'childbirth', pattern: /\b(childbirth|gave birth|child was born|baby was born)\b/i },
  { category: 'promotion', pattern: /\bpromot(?:ed|ion)\b/i },
  { category: 'job_loss', pattern: /\b(lost my job|laid off|redundan(?:t|cy))\b/i },
  { category: 'business_start', pattern: /\b(started|launched|founded)\b.{0,24}\b(business|company|consulting|practice)\b/i },
  { category: 'career_change', pattern: /\b(changed|switched|new|cambie|cambio|mudei|mudanca)\b.{0,20}\b(careers?|jobs?|roles?|carrera|trabajo|carreira|emprego)\b/i },
  { category: 'relocation', pattern: /\b(moved|relocated|relocation)\b/i },
  { category: 'property_purchase', pattern: /\b(bought|purchased)\b.{0,20}\b(home|house|property)\b/i },
  { category: 'windfall', pattern: /\b(inheritance|windfall|lottery)\b/i },
  { category: 'expense_shock', pattern: /\b(major expense|debt crisis|financial loss)\b/i },
  { category: 'surgery', pattern: /\b(surgery|operation)\b/i },
  { category: 'health_issue', pattern: /\b(diagnos(?:ed|is)|illness|health issue)\b/i },
  { category: 'higher_studies', pattern: /\b(university|college|graduat(?:ed|ion)|degree)\b/i },
  { category: 'litigation', pattern: /\b(lawsuit|litigation|court case|legal dispute)\b/i },
  { category: 'family_rupture', pattern: /\b(estranged|family rupture|family conflict)\b/i },
];

const ISO_DATE = /\b((?:19|20)\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/;
const YEAR = /\b((?:19|20)\d{2})\b/;
const DATE_TOKEN =
  /\b(?:(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:[0-2]\d|3[01])|(?:19|20)\d{2})\b/g;

function categoryOf(text: string): LifeEventCategory | undefined {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return CATEGORY_RULES.find((rule) => rule.pattern.test(normalized))?.category;
}

function datedEvents(text: string): readonly LifeEventInput[] {
  const matches = [...text.matchAll(DATE_TOKEN)];
  return matches.flatMap((match, index) => {
    const token = match[0];
    const tokenStart = match.index ?? 0;
    const previous = matches[index - 1];
    const start = previous ? (previous.index ?? 0) + previous[0].length : 0;
    const next = matches[index + 1];
    const nextStart = next?.index ?? text.length;
    const beforeDate = text.slice(start, tokenStart).trim();
    const afterDate = text.slice(tokenStart + token.length, nextStart).trim();
    const beforeCategory = categoryOf(beforeDate);
    const category = beforeCategory ?? categoryOf(afterDate);
    const exact = ISO_DATE.test(token);
    const year = YEAR.exec(token);
    if (!category || (!exact && !year) || tokenStart < start) return [];
    const date = exact ? token : `${year?.[1]}-01-01`;
    const summary = `${beforeCategory ? beforeDate : token} ${beforeCategory ? token : afterDate}`
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    return [{
      description: summary,
      summary,
      date,
      category,
      precision: exact ? 'exact' : 'year',
    }];
  });
}

export function deterministicallyStructureNarrative(text: string): readonly LifeEventInput[] {
  return text
    .split(/(?:\r?\n)+|[.!?;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => datedEvents(part));
}

function typedRows(
  rows: Awaited<ReturnType<typeof structureLifeEvents>>,
): readonly LifeEventInput[] {
  if (rows.status !== 'ok') return [];
  return rows.events.map((event) => {
    const description = event.summary ?? event.category.replaceAll('_', ' ');
    return { ...event, description };
  });
}

/**
 * Turn onboarding prose into one persisted row per event. Configured AI gets
 * the first attempt through the allowlisted typed structurer; deterministic
 * date/category extraction is the zero-egress fallback. If neither can safely
 * structure a row, retain one local draft for manual completion later.
 */
export async function prepareOnboardingLifeEvents(
  text: string,
  options: PreparationOptions,
): Promise<readonly LifeEventInput[]> {
  const narrative = text.trim();
  if (options.aiConfigured) {
    const result = await structureLifeEvents(
      narrative,
      options.config,
      options.language,
    ).catch(() => ({ status: 'error' }) as const);
    const structured = typedRows(result);
    if (structured.length > 0) return structured;
  }
  const deterministic = deterministicallyStructureNarrative(narrative);
  return deterministic.length > 0 ? deterministic : [{ description: narrative }];
}
