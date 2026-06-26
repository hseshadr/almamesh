// Shared, hand-built engine PREDICTIVE context fixtures (transits, strength,
// full vargas, life domains) in the exact `model_dump(mode="json")` shapes the
// engine emits on `SiderealChart` (`transit_context` / `strength_context` /
// `varga_context_full` / `domains_context`). Used by the sanitize/facts/prompt
// tests to prove the new contexts flow through the privacy boundary compactly,
// with every absolute date reduced to month precision.

import type {
  BalaValue,
  KalaBala,
  LifeDomainsContext,
  NavamsaChart,
  PlanetShadbala,
  SthanaBala,
  StrengthContext,
  TransitContext,
  VargaContextFull,
} from "@almamesh/browser/types";

export const NAVAMSA_FIXTURE: NavamsaChart = {
  name: "D9",
  lagna_sign: "scorpio",
  lagna_sign_lord: "mars",
  planets: {
    mars: { name: "mars", sign: "capricorn", sign_lord: "saturn" },
    venus: { name: "venus", sign: "pisces", sign_lord: "jupiter" },
  },
};

export const TRANSIT_CTX_FIXTURE: TransitContext = {
  instant: "2030-01-01T00:00:00Z",
  gochara: {
    instant: "2030-01-01T00:00:00Z",
    transit_ayanamsa: 24.2,
    placements: {
      saturn: {
        graha: "saturn",
        longitude: 330.5,
        sign: "pisces",
        sign_degrees: 0.5,
        nakshatra: "purva_bhadrapada",
        nakshatra_pada: 4,
        is_retrograde: true,
        house_from_lagna: 12,
        house_from_moon: 8,
        natal_sign_occupied: "cancer",
      },
    },
  },
  sade_sati: {
    is_active: true,
    current_phase: "peak",
    natal_moon_sign: "aquarius",
    cycle: [
      {
        phase: "peak",
        saturn_sign: "aquarius",
        start: "2028-03-01T00:00:00Z",
        end: "2030-06-15T00:00:00Z",
      },
    ],
    cycle_start: "2026-01-15T00:00:00Z",
    cycle_end: "2033-04-01T00:00:00Z",
  },
  slow_hits: [
    {
      graha: "jupiter",
      kind: "return",
      natal_point: "jupiter",
      exact: "2030-05-20T00:00:00Z",
      severity: "supportive",
    },
  ],
  fusion: {
    instant: "2030-01-01T00:00:00Z",
    maha_lord: "saturn",
    antar_lord: "mercury",
    maha_lord_transit_house_from_moon: 8,
    maha_lord_transit_house_from_lagna: 12,
    reinforcing: ["jupiter"],
    afflicting: ["mars"],
    net_weight: -0.4,
    severity: "challenging",
  },
  timeline: {
    window_start: "2030-01-01T00:00:00Z",
    window_end: "2031-01-01T00:00:00Z",
    events: [
      {
        date: "2030-03-29T00:00:00Z",
        kind: "sign_ingress",
        graha: "saturn",
        from_sign: "aquarius",
        to_sign: "pisces",
        from_lord: null,
        to_lord: null,
        sade_sati_phase: null,
        severity: "challenging",
        descriptor: "Saturn enters Pisces",
      },
    ],
  },
};

function bala(virupas: number): BalaValue {
  return { virupas, citation: "BPHS", approximated: false, note: null };
}

function sthana(): SthanaBala {
  return {
    uccha: bala(30),
    saptavargaja: bala(20),
    ojayugma: bala(15),
    kendradi: bala(60),
    drekkana: bala(10),
    total_virupas: 135,
  };
}

function kala(): KalaBala {
  return {
    nathonnatha: bala(30),
    paksha: bala(40),
    tribhaga: bala(0),
    abda: bala(15),
    masa: bala(0),
    vara: bala(0),
    hora: bala(0),
    ayana: bala(20),
    yuddha: bala(0),
    total_virupas: 105,
  };
}

function shadbalaFor(planet: string, rupas: number, meets: boolean): PlanetShadbala {
  return {
    planet,
    sthana: sthana(),
    dig: bala(20),
    kala: kala(),
    cheshta: bala(30),
    naisargika: bala(60),
    drik: bala(-5),
    total_virupas: rupas * 60,
    total_rupas: rupas,
    required_rupas: 5,
    meets_minimum: meets,
  };
}

export const STRENGTH_CTX_FIXTURE: StrengthContext = {
  sunrise_utc_iso: "2030-01-01T01:23:00Z",
  ashtakavarga: {
    bhinna: {
      saturn: { planet: "saturn", bindus: { aries: 3, taurus: 4 }, total: 39 },
    },
    sarva: { bindus: { aries: 28, taurus: 30 }, total: 337 },
  },
  shadbala: {
    planets: {
      saturn: shadbalaFor("saturn", 5.21, true),
      mars: shadbalaFor("mars", 4.4, false),
    },
  },
};

export const VARGA_CTX_FULL_FIXTURE: VargaContextFull = {
  charts: {
    D9: {
      chart: "D9",
      lagna_sign: "scorpio",
      lagna_sign_lord: "mars",
      placements: {
        mars: { graha: "mars", sign: "capricorn", sign_lord: "saturn" },
      },
    },
  },
  vargottama: [{ point: "moon", sign: "taurus" }],
  shadvarga_own_sign: [
    { graha: "jupiter", own_sign_count: 3, charts_in_own_sign: ["D1", "D9", "D12"] },
  ],
  vimshopaka: [{ graha: "jupiter", score: 16.5, approximated: false }],
};

export const DOMAINS_CTX_FIXTURE: LifeDomainsContext = {
  instant: "2030-01-01T00:00:00Z",
  forecasts: {
    career: {
      domain: "career",
      houses: [
        {
          house: 10,
          sign: "leo",
          lord: "sun",
          lord_house: 11,
          lord_sign: "virgo",
          lord_dignity: "neutral",
          rule: "10th lord in the 11th: gains through vocation.",
        },
      ],
      karakas: [
        {
          graha: "saturn",
          house: 4,
          sign: "cancer",
          dignity: "debilitated",
          is_retrograde: true,
          rule: "Career karaka Saturn debilitated: effort-first profile.",
        },
      ],
      varga: {
        chart: "D10",
        graha: "saturn",
        sign: "aquarius",
        sign_lord: "saturn",
        same_sign_as_d1: false,
        vargottama: false,
        rule: "D10 dashamsha placement of the career karaka.",
      },
      strength_summary: {
        key_graha: "saturn",
        key_graha_rupas: 5.21,
        key_graha_meets_minimum: true,
        sav_bindus: 28,
        band: "strong",
        approximated: false,
        note: "Saturn meets its Shadbala minimum.",
      },
      current_emphasis: {
        active_dasha_significator: true,
        dasha_levels: ["maha"],
        matched_dasha_lords: ["saturn"],
        under_sade_sati: true,
        transit_severity: "neutral",
        approximated: true,
        note: "Transit severity is a coarse vote-sum heuristic.",
        rule: "Maha lord is a career significator.",
      },
      upcoming_windows: [
        {
          date: "2030-03-29T00:00:00Z",
          source: "transit",
          kind: "sign_ingress",
          trigger: "saturn",
          severity: "supportive",
          descriptor: "Career window opens as Saturn changes sign",
        },
      ],
    },
  },
};
