import { describe, expect, it } from "vitest";

import {
  composeDomainStrength,
  composeDomainStrengths,
} from "../strengthAssay";
import type {
  LifeDomainsContext,
  StrengthSummary,
} from "../predictive";

function summary(overrides: Partial<StrengthSummary> = {}): StrengthSummary {
  return {
    key_graha: "saturn",
    key_graha_rupas: 7.5,
    key_graha_meets_minimum: true,
    sav_bindus: 31,
    band: "moderate",
    shadbala_pct: 82.5,
    sav_pct: 51.79,
    strength_pct: 51.79,
    strength_tier: "model",
    approximated: true,
    note: "test fixture",
    ...overrides,
  };
}

function domainsContext(domains: readonly string[]): LifeDomainsContext {
  const forecasts = Object.fromEntries(
    domains.map((domain, index) => [
      domain,
      {
        domain,
        strength_summary: summary({
          shadbala_pct: 70 + index,
          sav_pct: 50 + index,
          strength_pct: 50 + index,
        }),
      },
    ]),
  );
  return { instant: "2026-08-16T12:00:00Z", forecasts } as unknown as LifeDomainsContext;
}

describe("composeDomainStrength", () => {
  it("explains the unchanged headline as Assay's minimum of the two Python-owned axes", () => {
    const result = composeDomainStrength(summary());

    expect(result).toMatchObject({
      schema: "assay.result/v1",
      method: { id: "minimum", version: "almamesh.domain-strength.v1" },
      score: 0.5179,
      selected_component_id: "sav_pct",
      interval: null,
      clamp: "reject",
      intercept: null,
      weight_total: null,
    });
    expect(result.components).toEqual([
      {
        id: "shadbala_pct",
        raw: 82.5,
        normalized: 0.825,
        declared_weight: null,
        operation: "add",
        coefficient: 1,
        contribution: 0.825,
        contribution_interval: null,
      },
      {
        id: "sav_pct",
        raw: 51.79,
        normalized: 0.5179,
        declared_weight: null,
        operation: "add",
        coefficient: 1,
        contribution: 0.5179,
        contribution_interval: null,
      },
    ]);
    expect(result.components.find((row) => row.id === result.selected_component_id)?.raw).toBe(
      51.79,
    );
  });

  it("uses declaration order to explain an equal-axis headline deterministically", () => {
    const result = composeDomainStrength(
      summary({ shadbala_pct: 60, sav_pct: 60, strength_pct: 60 }),
    );

    expect(result.selected_component_id).toBe("shadbala_pct");
    expect(result.score).toBe(0.6);
  });

  it("refuses to relabel a divergent engine headline as Assay's minimum", () => {
    expect(() =>
      composeDomainStrength(
        summary({ shadbala_pct: 60, sav_pct: 55, strength_pct: 99 }),
      ),
    ).toThrow(/engine headline.*assay minimum/i);
  });
});

describe("composeDomainStrengths", () => {
  it("returns one typed explanation for every forecast without changing the engine context", () => {
    const context = domainsContext(["career", "health", "family"]);
    const before = structuredClone(context);

    const results = composeDomainStrengths(context);

    expect(Object.keys(results).sort()).toEqual(["career", "family", "health"]);
    expect(results.career.selected_component_id).toBe("sav_pct");
    expect(results.health.components[1]?.raw).toBe(51);
    expect(context).toEqual(before);
  });
});
