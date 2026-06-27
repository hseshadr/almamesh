import { describe, it, expect } from 'vitest';
import type { LifeEventCategory } from './index';
import { LIFE_EVENT_CATEGORIES } from './index';

describe('rectification types', () => {
  it('LIFE_EVENT_CATEGORIES contains all 16 life-event categories with correct exhaustiveness', () => {
    // Value-guard: must be a readonly array of LifeEventCategory values
    const categories: readonly LifeEventCategory[] = LIFE_EVENT_CATEGORIES;

    // Length check: exactly 16 categories
    expect(categories).toHaveLength(16);

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
    ];

    expectedCategories.forEach((category) => {
      expect(LIFE_EVENT_CATEGORIES).toContain(category);
    });
  });
});
