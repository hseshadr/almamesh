// Synthetic life-event stories with known-correct extractions for the
// structureLifeEvents benchmark task.
//
// ALL SYNTHETIC — no real natives, no real birth data, no PII. Every date and
// event below is invented. Together the expected rows cover all 17
// LifeEventCategory values (incl. family_rupture) and all 4 precisions
// (exact / month / year / approx).
//
// Scoring semantics (see scoreExtractor.ts): month-precision rows only use
// unambiguous phrasings ("in March 2020", never "early 2020") so the expected
// YYYY-MM is deterministic.

import type { BenchStory } from "../src/types";

export const STORIES: readonly BenchStory[] = [
  {
    id: "en-exact-1",
    language: "en",
    text: "I got married on 12 June 2014. Our first child was born on 3 March 2016. I had knee surgery on 21 August 2019.",
    expected: [
      { date: "2014-06-12", category: "marriage", precision: "exact" },
      { date: "2016-03-03", category: "childbirth", precision: "exact" },
      { date: "2019-08-21", category: "surgery", precision: "exact" },
    ],
  },
  {
    id: "en-vague-2",
    language: "en",
    text: "I lost my job in March 2020, then started my own business sometime in 2021. Around 2010 I moved to a new city.",
    expected: [
      { date: "2020-03-01", category: "job_loss", precision: "month" },
      { date: "2021-01-01", category: "business_start", precision: "year" },
      { date: "2010-01-01", category: "relocation", precision: "year" },
    ],
  },
  {
    id: "en-mixed-3",
    language: "en",
    text: "We got engaged on 14 February 2013 and broke up in November 2015. I received a completely unexpected inheritance on 9 May 2017, but a huge unplanned medical bill hit us in January 2018.",
    expected: [
      { date: "2013-02-14", category: "engagement", precision: "exact" },
      { date: "2015-11-01", category: "breakup", precision: "month" },
      { date: "2017-05-09", category: "windfall", precision: "exact" },
      { date: "2018-01-01", category: "expense_shock", precision: "month" },
    ],
  },
  {
    id: "en-family-4",
    language: "en",
    text: "I was promoted to team lead on 1 April 2022. I bought my first flat on 15 October 2018. My brother and I stopped speaking entirely after a big falling-out in July 2012.",
    expected: [
      { date: "2022-04-01", category: "promotion", precision: "exact" },
      { date: "2018-10-15", category: "property_purchase", precision: "exact" },
      { date: "2012-07-01", category: "family_rupture", precision: "month" },
    ],
  },
  {
    id: "en-long-5",
    language: "en",
    text: "I started my master's degree in September 2011. A lawsuit against my old landlord was filed on 5 May 2015. I changed careers from accounting to design around 2019. I was diagnosed with a chronic illness on 20 December 2020. Sometime in my late twenties — I honestly can't pin down the year — I relocated abroad.",
    expected: [
      { date: "2011-09-01", category: "higher_studies", precision: "month" },
      { date: "2015-05-05", category: "litigation", precision: "exact" },
      { date: "2019-01-01", category: "career_change", precision: "year" },
      { date: "2020-12-20", category: "health_issue", precision: "exact" },
      { date: "2000-01-01", category: "relocation", precision: "approx" },
    ],
  },
  {
    id: "es-1",
    language: "es",
    text: "Me casé el 12 de junio de 2014 y mi hija nació el 3 de marzo de 2016. Perdí mi trabajo en marzo de 2020.",
    expected: [
      { date: "2014-06-12", category: "marriage", precision: "exact" },
      { date: "2016-03-03", category: "childbirth", precision: "exact" },
      { date: "2020-03-01", category: "job_loss", precision: "month" },
    ],
  },
  {
    id: "pt-1",
    language: "pt",
    text: "Comecei meu mestrado em setembro de 2011. Comprei minha primeira casa em 15 de outubro de 2018. Por volta de 2010 me mudei de cidade.",
    expected: [
      { date: "2011-09-01", category: "higher_studies", precision: "month" },
      { date: "2018-10-15", category: "property_purchase", precision: "exact" },
      { date: "2010-01-01", category: "relocation", precision: "year" },
    ],
  },
];
