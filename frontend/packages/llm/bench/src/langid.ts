// Stopword-based language heuristic for the es/pt spot checks. Deliberately
// crude (Spec 063 D4 allows "langid heuristic: stopword check is fine"):
// we only need to know whether a response is IN the requested language,
// not to identify arbitrary languages.

import { deaccent } from "./fenceCheck";

export type LangTarget = "en" | "es" | "pt";

// Deaccented, language-DISTINCTIVE stopwords. Tokens shared between es and pt
// (de, que, para, como, por...) are deliberately excluded — they carry no
// discriminating signal between the two.
const STOPWORDS: Readonly<Record<LangTarget, ReadonlySet<string>>> = {
  en: new Set([
    "the", "is", "are", "of", "and", "to", "in", "that", "your", "for",
    "with", "will", "this", "it", "you", "be", "during", "period", "when",
  ]),
  es: new Set([
    "el", "los", "las", "y", "es", "con", "su", "tu", "esta", "este",
    "tiene", "pero", "durante", "puede", "muy", "cuando", "hay", "ser",
    "una", "del", "tus",
  ]),
  pt: new Set([
    "o", "os", "as", "e", "nao", "voce", "um", "uma", "do", "da", "no",
    "na", "em", "seu", "sua", "pode", "mas", "durante", "quando", "isso",
    "mais", "ser", "seus", "suas",
  ]),
};

export interface LanguageScore {
  readonly inLanguage: boolean;
  readonly counts: Readonly<Record<LangTarget, number>>;
}

/**
 * Score whether `text` is written in `target`. In-language when the target's
 * distinctive-stopword count strictly beats every other language's count and
 * there are at least 3 hits (guards against one-word replies).
 */
export function scoreLanguage(text: string, target: LangTarget): LanguageScore {
  const words = deaccent(text).split(/[^a-z0-9']+/);
  const counts: Record<LangTarget, number> = { en: 0, es: 0, pt: 0 };
  for (const word of words) {
    for (const lang of ["en", "es", "pt"] as const) {
      if (STOPWORDS[lang].has(word)) {
        counts[lang] += 1;
      }
    }
  }
  const others = (["en", "es", "pt"] as const).filter((l) => l !== target);
  const inLanguage =
    counts[target] >= 3 && others.every((l) => counts[target] > counts[l]);
  return { inLanguage, counts };
}
