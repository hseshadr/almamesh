import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ReplayMismatch, SignatureInvalid, generateSeedHex, publicKeyHex } from "@edgeproc/avow";

import {
  sealDomainStrengths,
  signDomainStrength,
  verifyDomainStrength,
  type DomainStrengthSubject,
} from "../strengthReceipt";
import type { LifeDomainsContext, StrengthSummary } from "../predictive";

const HERE = dirname(fileURLToPath(import.meta.url));
// repo-root/testdata — the ONE fixture both language suites consume.
const VECTORS = resolve(HERE, "../../../../../../testdata/vectors/domain-strength-receipt.json");

interface ReceiptVector {
  readonly subject: DomainStrengthSubject;
  readonly canonical_hex: string;
  readonly payload_hash: string;
  readonly signature: string;
}
interface VectorFile {
  readonly seed_hex: string;
  readonly public_key: string;
  readonly receipts: readonly ReceiptVector[];
}

const vectors: VectorFile = JSON.parse(readFileSync(VECTORS, "utf8")) as VectorFile;

function summary(overrides: Partial<StrengthSummary> = {}): StrengthSummary {
  return {
    key_graha: "saturn",
    key_graha_rupas: 7.5,
    key_graha_meets_minimum: true,
    sav_bindus: 31,
    band: "moderate",
    shadbala_pct: 60,
    sav_pct: 55.357142857142854,
    strength_pct: 55.357142857142854,
    strength_tier: "model",
    approximated: true,
    note: "test fixture",
    ...overrides,
  } as StrengthSummary;
}

function domainsContext(domains: readonly string[]): LifeDomainsContext {
  const forecasts = Object.fromEntries(
    domains.map((domain, index) => [
      domain,
      // Only `strength_summary` is read by the sealer; the rest of the forecast
      // is irrelevant to the receipt and deliberately left minimal here.
      { domain, strength_summary: summary({ sav_bindus: 20 + index }) },
    ]),
  );
  return { instant: "2026-07-11T12:00:00Z", forecasts } as unknown as LifeDomainsContext;
}

/**
 * THE byte-compatibility proof. These vectors were produced by the PYTHON `avow`
 * kernel (rfc8785 + PyNaCl). If the TypeScript signer diverges by even one byte —
 * key ordering, float formatting, hash input — these fail. This is what licenses
 * moving signing out of Pyodide and into the Worker's TypeScript.
 */
describe("golden vectors: TS signing is byte-identical to the Python avow kernel", () => {
  it("has vectors covering the JCS number hazards", () => {
    expect(vectors.receipts.length).toBeGreaterThanOrEqual(2);
    // 60.0 -> 60, 5.0 -> 5, 1e-07 -> 1e-7 are exactly where a naive encoder drifts.
    const hexes = vectors.receipts.map((r) => r.canonical_hex).join("");
    expect(hexes).toContain("36302c"); // ..."shadbala_pct":60,
    expect(hexes).toContain("31652d372c"); // ..."sav_pct":1e-7,
  });

  for (const vector of vectors.receipts) {
    it(`reproduces Python's receipt for domain "${vector.subject.domain}"`, async () => {
      const receipt = await signDomainStrength(
        vector.subject.domain,
        vector.subject.summary,
        vectors.seed_hex,
      );

      expect(receipt.payload_hash).toBe(vector.payload_hash);
      expect(receipt.signature).toBe(vector.signature);
      expect(receipt.public_key).toBe(vectors.public_key);
      expect(receipt.payload).toEqual(vector.subject);
    });

    it(`verifies Python's own receipt for domain "${vector.subject.domain}"`, async () => {
      // The other direction: a receipt minted in Python must verify in TypeScript.
      await expect(
        verifyDomainStrength(
          {
            payload: vector.subject,
            payload_hash: vector.payload_hash,
            public_key: vectors.public_key,
            signature: vector.signature,
          },
          vectors.public_key,
        ),
      ).resolves.toBeUndefined();
    });
  }

  it("derives the vector's public key from the vector's seed", async () => {
    expect(await publicKeyHex(vectors.seed_hex)).toBe(vectors.public_key);
  });
});

describe("sealDomainStrengths", () => {
  it("seals EVERY forecast — sealing is total, never a narrowed subset", async () => {
    const seed = generateSeedHex();
    const ctx = domainsContext(["career", "finances", "health"]);

    const receipts = await sealDomainStrengths(ctx, seed);

    expect(Object.keys(receipts).sort()).toEqual(["career", "finances", "health"]);
  });

  it("seals the summary VERBATIM — the receipt introduces no new number", async () => {
    const seed = generateSeedHex();
    const ctx = domainsContext(["career"]);

    const receipts = await sealDomainStrengths(ctx, seed);

    expect(receipts.career.payload.summary).toEqual(ctx.forecasts.career.strength_summary);
    expect(receipts.career.payload.domain).toBe("career");
  });

  it("round-trips: every sealed receipt verifies under the sealing key", async () => {
    const seed = generateSeedHex();
    const expected = await publicKeyHex(seed);
    const ctx = domainsContext(["career", "finances"]);

    const receipts = await sealDomainStrengths(ctx, seed);

    for (const receipt of Object.values(receipts)) {
      await expect(verifyDomainStrength(receipt, expected)).resolves.toBeUndefined();
    }
  });

  it("is deterministic: identical facts under one key seal to identical bytes", async () => {
    const seed = generateSeedHex();
    const ctx = domainsContext(["career"]);

    const first = await sealDomainStrengths(ctx, seed);
    const second = await sealDomainStrengths(ctx, seed);

    expect(first.career.signature).toBe(second.career.signature);
  });
});

describe("verifyDomainStrength fails closed", () => {
  it("detects a mutated strength_pct (the tamper case the receipt exists for)", async () => {
    const seed = generateSeedHex();
    const expected = await publicKeyHex(seed);
    const receipt = await signDomainStrength("career", summary(), seed);

    const tampered = {
      ...receipt,
      payload: { ...receipt.payload, summary: { ...receipt.payload.summary, strength_pct: 99 } },
    };

    await expect(verifyDomainStrength(tampered, expected)).rejects.toThrow(ReplayMismatch);
  });

  it("rejects a receipt that is not from the pinned signer", async () => {
    const receipt = await signDomainStrength("career", summary(), generateSeedHex());
    const other = await publicKeyHex(generateSeedHex());

    await expect(verifyDomainStrength(receipt, other)).rejects.toThrow(SignatureInvalid);
  });
});
