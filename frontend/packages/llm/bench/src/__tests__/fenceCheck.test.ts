// The fence checker's contract: PRECISION FIRST. Every "flags" test is a real
// violation; every "does not flag" test is a claim that is either true,
// negated, hypothetical, divisional-context, or too ambiguous to bind safely.

import { describe, expect, it } from "vitest";

import { fenceCheck } from "../fenceCheck";
import type { EngineTruth, TruthPeriod } from "../types";

// Handcrafted truth, deliberately mirroring the Tokyo fixture's shape:
// sun exalted (rules 2), saturn own (rules 7,8), mars yogakaraka (rules 5,10),
// jupiter maha 2012->2028 with a rahu antar 2026->2028.
function period(lord: string, level: TruthPeriod["level"], start: string, end: string): TruthPeriod {
  return { lord, level, start: new Date(start), end: new Date(end) };
}

const TRUTH: EngineTruth = {
  lordships: new Map([
    ["sun", [2]],
    ["moon", [1]],
    ["mars", [5, 10]],
    ["mercury", [3, 12]],
    ["jupiter", [6, 9]],
    ["venus", [4, 11]],
    ["saturn", [7, 8]],
    ["rahu", []],
    ["ketu", []],
  ]),
  dignities: new Map([
    ["sun", "exalted"],
    ["moon", "neutral"],
    ["mars", "neutral"],
    ["mercury", "neutral"],
    ["jupiter", "neutral"],
    ["venus", "neutral"],
    ["saturn", "own"],
    ["rahu", "neutral"],
    ["ketu", "neutral"],
  ]),
  periods: [
    period("mars", "maha", "1990-04-20", "1994-04-20"),
    period("rahu", "maha", "1994-04-20", "2012-11-23"),
    period("jupiter", "maha", "2012-11-23", "2028-11-23"),
    period("saturn", "maha", "2028-11-23", "2047-11-23"),
    period("mercury", "antar", "2017-03-01", "2019-06-15"),
    period("rahu", "antar", "2026-07-01", "2028-11-23"),
    period("rahu", "pratyantar", "2026-07-01", "2026-11-05"),
  ],
  yogaNames: new Set(["budhaaditya", "raja", "sasa", "dhana", "sunapha", "vipareetaraja", "karaka"]),
  yogaCategories: new Set(["auspicious", "raja", "mahapurusha", "dhana", "chandra"]),
};

describe("lordship claims", () => {
  it("flags 'Saturn rules the 3rd house'", () => {
    const v = fenceCheck(TRUTH, "Saturn rules the 3rd house, giving courage.");
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("lordship");
    expect(v[0].detail).toContain("saturn");
  });

  it("does not flag a TRUE lordship (Saturn rules the 7th and 8th houses)", () => {
    expect(fenceCheck(TRUTH, "Saturn rules the 7th and 8th houses.")).toHaveLength(0);
  });

  it("flags only the wrong house in a mixed list", () => {
    const v = fenceCheck(TRUTH, "Mars rules the 5th and 11th houses.");
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain("house 11");
  });

  it("flags the reversed phrasing 'the lord of the 10th house is Jupiter'", () => {
    const v = fenceCheck(TRUTH, "The lord of the 10th house is Jupiter.");
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("lordship");
  });

  it("does not bind across an intervening clause (lord of the 7th is in the 8th with Venus)", () => {
    expect(
      fenceCheck(TRUTH, "The lord of the 7th house is in the 8th with Venus."),
    ).toHaveLength(0);
  });

  it("flags 'Venus, your 7th lord' (planet-first apposition)", () => {
    const v = fenceCheck(TRUTH, "Venus, your 7th lord, brings harmony.");
    expect(v).toHaveLength(1);
  });

  it("flags a node lordship claim (Rahu rules nothing)", () => {
    const v = fenceCheck(TRUTH, "Rahu rules the 7th house in your chart.");
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain("nothing");
  });

  it("supports word ordinals: 'Mercury is the lord of the seventh house'", () => {
    const v = fenceCheck(TRUTH, "Mercury is the lord of the seventh house.");
    expect(v).toHaveLength(1);
  });

  it("ignores house-free rulership talk ('Jupiter rules wisdom')", () => {
    expect(fenceCheck(TRUTH, "Jupiter rules wisdom and Sagittarius.")).toHaveLength(0);
  });

  it("skips negated sentences", () => {
    expect(fenceCheck(TRUTH, "Saturn does not rule the 3rd house.")).toHaveLength(0);
  });

  it("flags a wrong lagna-lord claim", () => {
    const v = fenceCheck(TRUTH, "Your lagna lord is Venus.");
    expect(v).toHaveLength(1);
  });

  it("does not flag the correct lagna lord", () => {
    expect(fenceCheck(TRUTH, "Your lagna lord is Moon.")).toHaveLength(0);
  });

  // --- regression: bound the forward-claim window (aspect-tail false flags) ---

  it("does not bind a trailing aspect clause ('Saturn rules the 7th and aspects the 3rd')", () => {
    expect(fenceCheck(TRUTH, "Saturn rules the 7th and aspects the 3rd.")).toHaveLength(0);
  });

  it("does not bind the aspect tail with 'house' wording either", () => {
    expect(
      fenceCheck(TRUTH, "Saturn rules the 7th house and aspects the 3rd house."),
    ).toHaveLength(0);
  });

  it("still flags the wrong house in a genuine multi-house claim ('Mars rules the 5th and the 3rd houses')", () => {
    const v = fenceCheck(TRUTH, "Mars rules the 5th and the 3rd houses.");
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain("house 3");
  });

  it("still flags a wrong house directly after the verb ('Saturn governs the 3rd and aspects the 7th')", () => {
    const v = fenceCheck(TRUTH, "Saturn governs the 3rd and aspects the 7th.");
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain("house 3");
  });
});

describe("dasha date claims", () => {
  it("flags a year outside every window of the named lord ('Mercury antardasha in 2027')", () => {
    const v = fenceCheck(TRUTH, "An incoming Mercury antardasha in 2027 will sharpen your focus.");
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("dasha_date");
  });

  it("does not flag a correct maha window ('Jupiter mahadasha runs until 2028')", () => {
    expect(fenceCheck(TRUTH, "Your Jupiter mahadasha runs until 2028.")).toHaveLength(0);
  });

  it("does not flag month-year inside the window (Rahu antardasha from July 2026)", () => {
    expect(
      fenceCheck(TRUTH, "Your Rahu antardasha runs from July 2026 to November 2028."),
    ).toHaveLength(0);
  });

  it("flags a month-year outside the window at the hinted level", () => {
    const v = fenceCheck(TRUTH, "Your Rahu antardasha begins in January 2031.");
    expect(v).toHaveLength(1);
  });

  it("stays silent when the sentence names no planet", () => {
    expect(fenceCheck(TRUTH, "A new dasha begins in 2031.")).toHaveLength(0);
  });

  it("stays silent on years without dasha context", () => {
    expect(fenceCheck(TRUTH, "Saturn was prominent for you in 2031.")).toHaveLength(0);
  });

  it("stays silent on birth-year sentences", () => {
    expect(
      fenceCheck(TRUTH, "You were born in 1990, at the start of a Mars dasha."),
    ).toHaveLength(0);
  });

  it("uses any-level checking for mixed-level sentences", () => {
    // 2018 is inside mercury's ANTAR window; sentence mixes maha+antar words.
    expect(
      fenceCheck(TRUTH, "During the Rahu mahadasha, your Mercury antardasha of 2018 was pivotal."),
    ).toHaveLength(0);
  });
});

describe("dignity vocabulary", () => {
  it("flags 'Saturn is exalted' (engine: own)", () => {
    const v = fenceCheck(TRUTH, "Saturn is exalted in your chart.");
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("dignity");
    expect(v[0].detail).toContain('"own"');
  });

  it("does not flag the TRUE 'Sun is exalted'", () => {
    expect(fenceCheck(TRUTH, "Your Sun is exalted in Aries.")).toHaveLength(0);
  });

  it("does not flag the TRUE own-sign claim (Saturn in its own sign)", () => {
    expect(fenceCheck(TRUTH, "Saturn sits in its own sign here.")).toHaveLength(0);
  });

  it("flags 'debilitated Venus' (engine: neutral)", () => {
    const v = fenceCheck(TRUTH, "A debilitated Venus complicates relationships.");
    expect(v).toHaveLength(1);
  });

  it("skips negated dignity ('Saturn is not exalted')", () => {
    expect(fenceCheck(TRUTH, "Saturn is not exalted.")).toHaveLength(0);
  });

  it("skips navamsa-context dignity talk", () => {
    expect(fenceCheck(TRUTH, "In the navamsa, Saturn is exalted.")).toHaveLength(0);
  });

  it("binds to the NEAREST planet, not any planet in the sentence", () => {
    // exalted is adjacent to sun (true); jupiter earlier must not be blamed.
    expect(
      fenceCheck(TRUTH, "Jupiter supports you, and the exalted Sun powers your career."),
    ).toHaveLength(0);
  });

  it("catches Spanish dignity vocabulary ('Saturno está exaltado')", () => {
    const v = fenceCheck(TRUTH, "Saturno está exaltado y eso fortalece tu carrera.");
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("dignity");
  });

  // --- regression tests from the first REAL smoke run (OpenRouter) ---

  it("ignores generic noun preambles ('as for exaltation and debilitation, ...')", () => {
    expect(
      fenceCheck(TRUTH, "As for exaltation and debilitation, Jupiter is placed in Taurus."),
    ).toHaveLength(0);
  });

  it("flags an attributive claim exactly ONCE despite double vocabulary", () => {
    const v = fenceCheck(
      TRUTH,
      "Jupiter is in exaltation here, in Taurus, which is his exalted sign.",
    );
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("dignity");
  });

  it("does not read the es house-lord phrase 'señor de ese domicilio' as own-sign", () => {
    expect(
      fenceCheck(TRUTH, "Marte, como señor de ese domicilio, indica liderazgo."),
    ).toHaveLength(0);
  });

  it("still flags the real es own-sign claim 'Marte está en su domicilio'", () => {
    const v = fenceCheck(TRUTH, "Marte está en su domicilio.");
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain("mars");
  });
});

describe("invented yogas", () => {
  it("flags a yoga the engine never detected (Gaja-Kesari)", () => {
    const v = fenceCheck(TRUTH, "You have the famous Gaja-Kesari yoga.");
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("invented_yoga");
  });

  it("does not flag a detected yoga (Sasa yoga)", () => {
    expect(fenceCheck(TRUTH, "Your Sasa yoga is a mahapurusha combination.")).toHaveLength(0);
  });

  it("does not flag hyphen/spacing variants (Budha Aditya yoga)", () => {
    expect(fenceCheck(TRUTH, "The Budha Aditya yoga sharpens communication.")).toHaveLength(0);
  });

  it("accepts category-generic mentions when the chart has that category (a raja yoga)", () => {
    expect(fenceCheck(TRUTH, "This is a powerful raja yoga.")).toHaveLength(0);
  });

  it("ignores generic non-claims ('this powerful yoga')", () => {
    expect(fenceCheck(TRUTH, "This powerful yoga shapes your decade.")).toHaveLength(0);
  });

  it("flags an invented named yoga the chart does not have (Kemadruma)", () => {
    const v = fenceCheck(TRUTH, "Your chart carries a Kemadruma yoga.");
    expect(v).toHaveLength(1);
  });

  // --- regression tests from the first REAL smoke run (OpenRouter) ---

  it("does not flag generic lowercase prose mentions (smoke-run false flags)", () => {
    expect(fenceCheck(TRUTH, "The chart reveals several significant yogas.")).toHaveLength(0);
    expect(fenceCheck(TRUTH, "Considering the detected yogas, focus on career.")).toHaveLength(0);
    expect(fenceCheck(TRUTH, "I see any yogas as supportive here.")).toHaveLength(0);
    expect(fenceCheck(TRUTH, "La presencia de varios yogas en tu carta es positiva.")).toHaveLength(0);
    expect(fenceCheck(TRUTH, "Aqui estao alguns yogas do seu mapa.")).toHaveLength(0);
  });

  it("accepts the lowercase-invented-name recall gap as the price of precision", () => {
    // Documented blind spot: an all-lowercase invented name is NOT flagged.
    expect(fenceCheck(TRUTH, "you carry the kemadruma yoga.")).toHaveLength(0);
  });
});

describe("clean narration", () => {
  it("returns zero violations for a fully grounded paragraph", () => {
    const clean =
      "You are in your Jupiter mahadasha, which runs until 2028. " +
      "Saturn rules the 7th and 8th houses and sits in its own sign. " +
      "Your Sun is exalted, and the Sasa yoga supports steady discipline.";
    expect(fenceCheck(TRUTH, clean)).toHaveLength(0);
  });
});
