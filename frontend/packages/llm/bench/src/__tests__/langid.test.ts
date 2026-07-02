import { describe, expect, it } from "vitest";

import { scoreLanguage } from "../langid";

const EN = "The chart shows that your career will be steady in the coming years and that is good.";
const ES =
  "Tu carta muestra que tu carrera sera estable durante los proximos anos y es un buen momento con mucha energia.";
const PT =
  "Seu mapa mostra que sua carreira sera estavel e voce pode avancar com seus planos, mas nao ha pressa nas decisoes.";

describe("scoreLanguage", () => {
  it("recognizes each target language", () => {
    expect(scoreLanguage(EN, "en").inLanguage).toBe(true);
    expect(scoreLanguage(ES, "es").inLanguage).toBe(true);
    expect(scoreLanguage(PT, "pt").inLanguage).toBe(true);
  });

  it("rejects a response in the WRONG language", () => {
    expect(scoreLanguage(EN, "es").inLanguage).toBe(false);
    expect(scoreLanguage(EN, "pt").inLanguage).toBe(false);
    expect(scoreLanguage(ES, "pt").inLanguage).toBe(false);
    expect(scoreLanguage(PT, "es").inLanguage).toBe(false);
  });

  it("rejects one-word replies (min-hits guard)", () => {
    expect(scoreLanguage("si", "es").inLanguage).toBe(false);
  });
});
