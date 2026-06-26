/**
 * AlmaMesh - Astrological Constants
 * Vedic astrology data for UI display
 */

// Planet names and symbols
export const PLANETS = {
  sun: { name: 'Sun', symbol: '\u2609', sanskrit: 'Surya' },
  moon: { name: 'Moon', symbol: '\u263D', sanskrit: 'Chandra' },
  mars: { name: 'Mars', symbol: '\u2642', sanskrit: 'Mangal' },
  mercury: { name: 'Mercury', symbol: '\u263F', sanskrit: 'Budha' },
  jupiter: { name: 'Jupiter', symbol: '\u2643', sanskrit: 'Guru' },
  venus: { name: 'Venus', symbol: '\u2640', sanskrit: 'Shukra' },
  saturn: { name: 'Saturn', symbol: '\u2644', sanskrit: 'Shani' },
  rahu: { name: 'Rahu', symbol: '\u260A', sanskrit: 'Rahu' },
  ketu: { name: 'Ketu', symbol: '\u260B', sanskrit: 'Ketu' },
} as const;

// Zodiac signs
export const SIGNS = {
  aries: { name: 'Aries', symbol: '\u2648', sanskrit: 'Mesha', element: 'Fire' },
  taurus: { name: 'Taurus', symbol: '\u2649', sanskrit: 'Vrishabha', element: 'Earth' },
  gemini: { name: 'Gemini', symbol: '\u264A', sanskrit: 'Mithuna', element: 'Air' },
  cancer: { name: 'Cancer', symbol: '\u264B', sanskrit: 'Karka', element: 'Water' },
  leo: { name: 'Leo', symbol: '\u264C', sanskrit: 'Simha', element: 'Fire' },
  virgo: { name: 'Virgo', symbol: '\u264D', sanskrit: 'Kanya', element: 'Earth' },
  libra: { name: 'Libra', symbol: '\u264E', sanskrit: 'Tula', element: 'Air' },
  scorpio: { name: 'Scorpio', symbol: '\u264F', sanskrit: 'Vrishchika', element: 'Water' },
  sagittarius: { name: 'Sagittarius', symbol: '\u2650', sanskrit: 'Dhanu', element: 'Fire' },
  capricorn: { name: 'Capricorn', symbol: '\u2651', sanskrit: 'Makara', element: 'Earth' },
  aquarius: { name: 'Aquarius', symbol: '\u2652', sanskrit: 'Kumbha', element: 'Air' },
  pisces: { name: 'Pisces', symbol: '\u2653', sanskrit: 'Meena', element: 'Water' },
} as const;

// Nakshatras (27 lunar mansions)
export const NAKSHATRAS = [
  { name: 'Ashwini', lord: 'ketu', deity: 'Ashwini Kumaras' },
  { name: 'Bharani', lord: 'venus', deity: 'Yama' },
  { name: 'Krittika', lord: 'sun', deity: 'Agni' },
  { name: 'Rohini', lord: 'moon', deity: 'Brahma' },
  { name: 'Mrigashira', lord: 'mars', deity: 'Soma' },
  { name: 'Ardra', lord: 'rahu', deity: 'Rudra' },
  { name: 'Punarvasu', lord: 'jupiter', deity: 'Aditi' },
  { name: 'Pushya', lord: 'saturn', deity: 'Brihaspati' },
  { name: 'Ashlesha', lord: 'mercury', deity: 'Nagas' },
  { name: 'Magha', lord: 'ketu', deity: 'Pitris' },
  { name: 'Purva Phalguni', lord: 'venus', deity: 'Bhaga' },
  { name: 'Uttara Phalguni', lord: 'sun', deity: 'Aryaman' },
  { name: 'Hasta', lord: 'moon', deity: 'Savitar' },
  { name: 'Chitra', lord: 'mars', deity: 'Tvashtar' },
  { name: 'Swati', lord: 'rahu', deity: 'Vayu' },
  { name: 'Vishakha', lord: 'jupiter', deity: 'Indra-Agni' },
  { name: 'Anuradha', lord: 'saturn', deity: 'Mitra' },
  { name: 'Jyeshtha', lord: 'mercury', deity: 'Indra' },
  { name: 'Mula', lord: 'ketu', deity: 'Nirriti' },
  { name: 'Purva Ashadha', lord: 'venus', deity: 'Apas' },
  { name: 'Uttara Ashadha', lord: 'sun', deity: 'Vishvedevas' },
  { name: 'Shravana', lord: 'moon', deity: 'Vishnu' },
  { name: 'Dhanishta', lord: 'mars', deity: 'Vasus' },
  { name: 'Shatabhisha', lord: 'rahu', deity: 'Varuna' },
  { name: 'Purva Bhadrapada', lord: 'jupiter', deity: 'Aja Ekapada' },
  { name: 'Uttara Bhadrapada', lord: 'saturn', deity: 'Ahir Budhnya' },
  { name: 'Revati', lord: 'mercury', deity: 'Pushan' },
] as const;

// Vimshottari Dasha periods (in years)
export const DASHA_PERIODS = {
  sun: 6,
  moon: 10,
  mars: 7,
  rahu: 18,
  jupiter: 16,
  saturn: 19,
  mercury: 17,
  ketu: 7,
  venus: 20,
} as const;

// Life areas for interest selection
export const LIFE_AREAS = [
  { id: 'career', name: 'Career', icon: '\uD83D\uDCBC', houses: [10, 6, 2] },
  { id: 'money', name: 'Money', icon: '\uD83D\uDCB0', houses: [2, 11, 5] },
  { id: 'relationships', name: 'Relationships', icon: '\uD83D\uDC95', houses: [7, 5, 11] },
  { id: 'family', name: 'Family', icon: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67', houses: [4, 5, 9] },
  { id: 'health', name: 'Health', icon: '\uD83C\uDFE5', houses: [1, 6, 8] },
  { id: 'spiritual', name: 'Spiritual', icon: '\uD83E\uDDD8', houses: [9, 12, 5] },
] as const;

// Birth time confidence levels
export const TIME_CONFIDENCE = {
  exact: { label: 'Exact (from birth certificate)', margin: 0 },
  approximate: { label: 'Approximate (within 15 min)', margin: 15 },
  rough: { label: 'Rough estimate (within 1 hour)', margin: 60 },
  unknown: { label: "I don't know my birth time", margin: null },
} as const;

export type PlanetName = keyof typeof PLANETS;
export type SignName = keyof typeof SIGNS;
export type TimeConfidence = keyof typeof TIME_CONFIDENCE;
