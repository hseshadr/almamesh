import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  CanonicalLifeEventDraft,
  EventDatePrecision,
  LifeEventCategory,
  RectificationEventInput,
} from './index';
import { LIFE_EVENT_CATEGORIES } from './index';

describe('rectification types', () => {
  it('LIFE_EVENT_CATEGORIES contains all 17 life-event categories with correct exhaustiveness', () => {
    // Value-guard: must be a readonly array of LifeEventCategory values
    const categories: readonly LifeEventCategory[] = LIFE_EVENT_CATEGORIES;

    // Length check: exactly 17 categories
    expect(categories).toHaveLength(17);

    // Verify the expected categories are present
    const expectedCategories: LifeEventCategory[] = [
      'marriage',
      'engagement',
      'breakup',
      'childbirth',
      'career_change',
      'promotion',
      'job_loss',
      'business_start',
      'relocation',
      'property_purchase',
      'windfall',
      'expense_shock',
      'health_issue',
      'surgery',
      'higher_studies',
      'litigation',
      'family_rupture',
    ];

    expectedCategories.forEach((category) => {
      expect(LIFE_EVENT_CATEGORIES).toContain(category);
    });
  });
});

describe('EventDatePrecision contract', () => {
  it('is the four-member union', () => {
    expectTypeOf<EventDatePrecision>().toEqualTypeOf<'exact' | 'month' | 'year' | 'approx'>();
  });
  it('RectificationEventInput carries precision', () => {
    const ev: RectificationEventInput = { date: '2005-06-01', category: 'marriage', precision: 'year' };
    expectTypeOf(ev.precision).toEqualTypeOf<EventDatePrecision>();
  });

  it('separates local summaries from the engine input contract', () => {
    const draft: CanonicalLifeEventDraft = {
      date: '2005-06-01',
      category: 'marriage',
      precision: 'year',
      summary: 'Married my partner',
    };
    expectTypeOf(draft.summary).toEqualTypeOf<string | undefined>();

    // @ts-expect-error summaries are local/display data, never engine input
    const wire: RectificationEventInput = { ...draft, summary: draft.summary };
    expect(wire.date).toBe(draft.date);
  });
});
