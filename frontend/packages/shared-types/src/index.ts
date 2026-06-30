/**
 * AlmaMesh Shared Types
 * TypeScript interfaces matching backend API contracts
 *
 * @packageDocumentation
 */

// `PlanetName` lives in ./energy (single source). Import it locally so the
// interfaces below can reference it; it is also re-exported via `export *`.
import type { PlanetName } from './energy';

// `MemberRelationship` lives in ./mesh (single source, backend-aligned).
// Imported locally for the mesh-edge contract below; re-exported via `export *`.
import type { MemberRelationship } from './mesh';

// Animation types for 3D Dasha visualization
export type {
  GrahaName,
  GrahaDef,
  DashaLevel,
  Segment,
  CameraTrack,
  TimeRange,
  AnimationScript,
} from './animation';

// Energy / force-field types + lowercase planet constant tables.
// Includes `PlanetName` (canonical lowercase planet id) — the single source.
export * from './energy';

// Mesh relationship vocabulary (anchor "self" + backend-aligned member values).
export * from './mesh';

// Chat types for Assistant UI integration
export type {
  ChatThread,
  ChatMessage,
  ChatThreadWithMessages,
  StreamingToken,
  StreamingDone,
  StreamingError,
} from './chat';

// (Energy exports are defined above; avoid duplicate re-exports.)

// Spec 031: Chart/Interpretation separation types (prefixed with Sep*)
export type {
  SepAyanamsaType,
  SepHouseSystem,
  SepViewMode,
  SepInterpretationSection,
  SepFocusArea,
  SepChartCalculationRequest,
  SepChartCalculationResponse,
  SepInterpretationRequest,
  SepInterpretationResponse,
  SepStreamingInterpretationRequest,
  SepReinterpretationRequest,
  SepInterpretationVersionSummary,
  SepInterpretationVersionsResponse,
  SepInterpretationVersion,
  SepInterpretationStreamEvent,
  SepInterpretationStreamStart,
  SepInterpretationSectionStart,
  SepInterpretationToken,
  SepInterpretationSectionComplete,
  SepInterpretationStreamComplete,
  SepInterpretationStreamUsage,
  SepInterpretationStreamError,
  SepChartCalculationError,
  SepInterpretationError,
} from './separated-charts';

// ============================================================================
// Base Types
// ============================================================================

export interface BaseResponse {
  success: boolean;
  message: string;
}

export interface ErrorResponse extends BaseResponse {
  success: false;
  error_type:
    | 'validation_error'
    | 'not_found'
    | 'authentication_error'
    | 'authorization_error'
    | 'rate_limit_exceeded'
    | 'internal_error'
    | 'service_unavailable';
  error_details?: {
    field?: string;
    value?: unknown;
    constraint?: string;
  };
  timestamp: string;
}

// ============================================================================
// Auth Types
// ============================================================================

/**
 * Birth data input for registration
 * Matches backend BirthDataInput class
 * Note: state and country are required in backend
 */
export interface BirthDataInput {
  name: string;
  date: string;           // YYYY-MM-DD
  time: string;           // HH:MM or HH:MM AM/PM
  city: string;
  state: string;          // Required in backend
  country: string;        // Required in backend
  email?: string | null;
  transit_city?: string | null;
  transit_state?: string | null;
  transit_country?: string | null;
}

/**
 * Location details from geocoding
 * Matches backend LocationDetails class
 */
export interface LocationDetails {
  city: string;
  state?: string | null;
  country?: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  timezone_offset_hours?: number | null;
  location_name?: string;
}

/**
 * Processed birth data stored in backend
 * Matches backend ProcessedBirthData class
 */
export interface ProcessedBirthData {
  name?: string;
  name_token?: string;
  safe_name?: string;
  birth_datetime_utc: string;
  birth_datetime_local: string;
  birth_location_details: LocationDetails;
  transit_location_details?: LocationDetails | null;
  pii_reference_id?: string | null;
  /**
   * The originally-entered birth time (`HH:MM`) when the chart was computed from
   * a *rectified* time instead. Absent when no rectification was applied. The
   * effective (rectified) instant drives `birth_datetime_utc`/`_local`.
   */
  birth_time_original?: string;
  /** Confidence in the birth time (a `TIME_CONFIDENCE` key from @almamesh/constants). */
  birth_time_confidence?: string;
}

/**
 * User response from API
 * Matches backend UserResponse class
 */
export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  avatar_url?: string | null;
  auth_providers?: string[];
  created_at: string;
  updated_at: string;
  birth_data?: ProcessedBirthData | null;
  preferences?: Record<string, unknown>;
}

/**
 * Request model for updating user profile
 * Matches backend UserUpdateRequest class
 */
export interface UserUpdateRequest {
  name?: string;
  birth_data?: BirthDataInput;
  preferences?: Record<string, unknown>;
}

// ============================================================================
// OAuth Types
// ============================================================================

/**
 * OAuth token response from backend
 */
export interface OAuthTokenResponse extends BaseResponse {
  user: UserResponse;
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  is_new_user: boolean;
}

export interface TokenRefreshRequest {
  refresh_token: string;
}

export interface TokenRefreshResponse extends BaseResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
}

// ============================================================================
// Chart Types
// ============================================================================

// `PlanetName` (lowercase 'sun'..'ketu') is exported from './energy' via the
// `export * from './energy'` above — single source of truth.

export type ZodiacSign =
  | 'aries' | 'taurus' | 'gemini' | 'cancer'
  | 'leo' | 'virgo' | 'libra' | 'scorpio'
  | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

export interface PlanetPosition {
  name: PlanetName;
  longitude: number;
  latitude?: number;
  sign: ZodiacSign;
  sign_degrees: number;
  house: number;
  nakshatra: string;
  nakshatra_pada: number;
  nakshatra_lord: PlanetName;
  sign_lord: PlanetName;
  is_retrograde: boolean;
  is_combust: boolean;
  /** Angular separation to the Sun (deg); null for the Sun and the nodes. */
  combustion_separation_deg?: number | null;
  /** Whole-sign houses this graha lords from the lagna; [] for Rahu/Ketu. */
  houses_ruled?: number[];
  /** Lords both a kendra and a trikona from the lagna (BPHS Yogakaraka). */
  is_yogakaraka?: boolean;
  dignity?: 'exalted' | 'own_sign' | 'debilitated' | 'neutral';
  // NOTE: no per-planet numeric strength exists on the natal contract. Real
  // Shadbala / Ashtakavarga live ONLY in the predictive `StrengthCtx`.
}

// ============================================================================
// Varga (Divisional Chart) Types
// ============================================================================

/**
 * Planet data in a divisional chart
 * Matches backend VargaPlanetData class
 */
export interface VargaPlanetData {
  sign: ZodiacSign;
  house: number;
  sign_lord: PlanetName;
  nakshatra?: string;
}

/**
 * Data for a single divisional chart
 * Matches backend VargaChartData class
 */
export interface VargaChartData {
  name: string;  // D1, D9, D10, etc.
  lagna_sign: ZodiacSign;
  planets: Record<string, VargaPlanetData>;
}

/**
 * Complete divisional charts context
 * Matches backend VargaContext class
 */
export interface VargaContext {
  D1: VargaChartData;   // Rasi chart (required)
  D2?: VargaChartData;  // Hora
  D3?: VargaChartData;  // Drekkana
  D4?: VargaChartData;  // Chaturthamsa
  D7?: VargaChartData;  // Saptamsa
  D9: VargaChartData;   // Navamsa (required)
  D10?: VargaChartData; // Dasamsa
  D12?: VargaChartData; // Dwadasamsa
  D16?: VargaChartData; // Shodasamsa
  D20?: VargaChartData; // Vimsamsa
  D24?: VargaChartData; // Chaturvimsamsa
  D27?: VargaChartData; // Saptavimsamsa
  D30?: VargaChartData; // Trimsamsa
  D40?: VargaChartData; // Khavedamsa
  D45?: VargaChartData; // Akshavedamsa
  D60?: VargaChartData; // Shashtyamsa
}

export interface DashaData {
  lord: PlanetName;
  start_date: string;
  end_date: string;
  level: 'maha' | 'antar' | 'pratyantar' | 'sookshma' | 'prana';
  duration_years: number;
}

/**
 * A maha-dasha sequence row carrying its own dated antardasha tree. Additive:
 * `antar_sequence` is absent on charts computed by older engine bundles, so
 * old persisted charts keep loading unchanged.
 */
export interface MahaDashaData extends DashaData {
  /** That maha's 9 dated antardashas (level 'antar'), engine-computed. */
  antar_sequence?: DashaData[];
}

/**
 * Which dasha-year length built every Vimshottari period (engine
 * DashaYearConvention). Surfaced so the UI/report/LLM can cite it and the
 * convention is never silently switched.
 */
export type DashaYearConvention =
  | 'savana_360'
  | 'gregorian_365_2425'
  | 'julian_365_25';

export interface VimshottariDashaData {
  maha_dasha: DashaData;
  // The engine emits null antar/pratyantar legs when the reference instant falls
  // outside a computed sub-period, so these are genuinely optional (not a lie the
  // adapter casts away). Renderers guard each leg.
  antar_dasha?: DashaData;
  pratyantar_dasha?: DashaData;
  sookshma_dasha?: DashaData;
  prana_dasha?: DashaData;
  full_sequence: MahaDashaData[];
  /**
   * The CURRENT antar's 9 dated pratyantardashas (level 'pratyantar').
   * Absent on older bundles and when the engine emitted null (no current antar).
   */
  pratyantar_sequence?: DashaData[];
  /** Declared dasha-year convention. Absent on older engine bundles. */
  convention?: DashaYearConvention;
}

// ============================================================================
// Predictive Contexts (additive; engine-computed, adapter-reshaped)
//
// UI mirrors of the four optional predictive contexts the Python engine emits
// (backend/src/almamesh/schemas/{transits,vargas,strength,domains}.py). Same
// reshape contract as the rest of this file: planet names are the canonical
// lowercase `PlanetName`, signs are the lowercase `ZodiacSign`, datetimes are
// ISO-8601 UTC strings, and every number/citation is the engine's verbatim.
// ============================================================================

export type TransitSeverity = 'supportive' | 'neutral' | 'challenging';

export type SadeSatiPhase = 'rising' | 'peak' | 'setting' | 'none';

export type TransitEventKind =
  | 'sign_ingress'
  | 'sade_sati_phase'
  | 'return'
  | 'dasha_change'
  | 'station';

/** The 16 Shodasavarga divisional charts, keyed by their BPHS D-number. */
export type DivisionalChartId =
  | 'D1' | 'D2' | 'D3' | 'D4' | 'D7' | 'D9' | 'D10' | 'D12'
  | 'D16' | 'D20' | 'D24' | 'D27' | 'D30' | 'D40' | 'D45' | 'D60';

export type LifeDomain =
  | 'career'
  | 'finances'
  | 'health'
  | 'relationships'
  | 'spiritual'
  | 'education'
  | 'family';

export type StrengthBand = 'strong' | 'moderate' | 'weak';

export type DomainWindowSource = 'dasha' | 'transit';

/** Engine `Dignity` values (constants/astrology.py), serialized lowercase. */
export type DignityName =
  | 'exalted'
  | 'debilitated'
  | 'own'
  | 'great_friend'
  | 'friend'
  | 'neutral'
  | 'enemy'
  | 'bitter_enemy';

// --- transits (gochara) ---

export interface TransitPlacementData {
  graha: PlanetName;
  longitude: number;
  sign: ZodiacSign;
  sign_degrees: number;
  nakshatra: string;
  nakshatra_pada: number;
  is_retrograde: boolean;
  house_from_lagna: number;
  house_from_moon: number;
  natal_sign_occupied: ZodiacSign;
}

export interface GocharaData {
  instant: string;
  transit_ayanamsa: number;
  placements: Partial<Record<PlanetName, TransitPlacementData>>;
}

export interface SadeSatiSegmentData {
  phase: SadeSatiPhase;
  saturn_sign: ZodiacSign;
  start: string;
  end: string;
}

export interface SadeSatiData {
  is_active: boolean;
  current_phase: SadeSatiPhase;
  natal_moon_sign: ZodiacSign;
  cycle: SadeSatiSegmentData[];
  cycle_start: string | null;
  cycle_end: string | null;
}

export interface SlowTransitHitData {
  graha: PlanetName;
  kind: TransitEventKind;
  /** "moon" | "lagna" | "natal_<graha>" (open vocabulary by schema). */
  natal_point: string;
  exact: string;
  severity: TransitSeverity;
}

export interface DashaTransitFusionData {
  instant: string;
  maha_lord: PlanetName;
  antar_lord: PlanetName | null;
  maha_lord_transit_house_from_moon: number;
  maha_lord_transit_house_from_lagna: number;
  reinforcing: PlanetName[];
  afflicting: PlanetName[];
  net_weight: number;
  severity: TransitSeverity;
}

export interface TransitTimelineEventData {
  date: string;
  kind: TransitEventKind;
  graha: PlanetName | null;
  from_sign: ZodiacSign | null;
  to_sign: ZodiacSign | null;
  from_lord: PlanetName | null;
  to_lord: PlanetName | null;
  sade_sati_phase: SadeSatiPhase | null;
  severity: TransitSeverity;
  /** STABLE machine key, e.g. "saturn.ingress.aries" (LLM/i18n narrates it). */
  descriptor: string;
}

export interface TransitTimelineData {
  window_start: string;
  window_end: string;
  events: TransitTimelineEventData[];
}

/** Everything the transit layer emits for one chart + instant. */
export interface TransitCtx {
  instant: string;
  gochara: GocharaData;
  sade_sati: SadeSatiData;
  slow_hits: SlowTransitHitData[];
  fusion: DashaTransitFusionData;
  timeline: TransitTimelineData;
}

// --- full Shodasavarga (distinct from the legacy D9-only VargaContext above) ---

export interface VargaPlacementFullData {
  graha: PlanetName;
  sign: ZodiacSign;
  sign_lord: PlanetName;
}

export interface VargaChartFullData {
  chart: DivisionalChartId;
  lagna_sign: ZodiacSign;
  lagna_sign_lord: PlanetName;
  placements: Partial<Record<PlanetName, VargaPlacementFullData>>;
}

export interface VargottamaFlagData {
  /** A `PlanetName` value or the literal "lagna". */
  point: string;
  sign: ZodiacSign;
}

export interface ShadvargaOwnSignData {
  graha: PlanetName;
  own_sign_count: number;
  charts_in_own_sign: DivisionalChartId[];
}

export interface VimshopakaScoreData {
  graha: PlanetName;
  score: number;
  approximated: boolean;
}

/** All 16 divisional charts + classical strength tallies. */
export interface VargaCtxFull {
  charts: Partial<Record<DivisionalChartId, VargaChartFullData>>;
  vargottama: VargottamaFlagData[];
  shadvarga_own_sign: ShadvargaOwnSignData[];
  vimshopaka: VimshopakaScoreData[];
}

// --- strength (Ashtakavarga + Shadbala) ---

export interface BhinnashtakavargaData {
  planet: PlanetName;
  bindus: Record<ZodiacSign, number>;
  total: number;
}

export interface SarvashtakavargaData {
  bindus: Record<ZodiacSign, number>;
  /** Canonical 337 for every chart. */
  total: number;
}

export interface AshtakavargaData {
  bhinna: Partial<Record<PlanetName, BhinnashtakavargaData>>;
  sarva: SarvashtakavargaData;
}

export interface BalaValueData {
  virupas: number;
  citation: string;
  approximated: boolean;
  note: string | null;
}

export interface SthanaBalaData {
  uccha: BalaValueData;
  saptavargaja: BalaValueData;
  ojayugma: BalaValueData;
  kendradi: BalaValueData;
  drekkana: BalaValueData;
  total_virupas: number;
}

export interface KalaBalaData {
  nathonnatha: BalaValueData;
  paksha: BalaValueData;
  tribhaga: BalaValueData;
  abda: BalaValueData;
  masa: BalaValueData;
  vara: BalaValueData;
  hora: BalaValueData;
  ayana: BalaValueData;
  yuddha: BalaValueData;
  total_virupas: number;
}

export interface PlanetShadbalaData {
  planet: PlanetName;
  sthana: SthanaBalaData;
  dig: BalaValueData;
  kala: KalaBalaData;
  cheshta: BalaValueData;
  naisargika: BalaValueData;
  drik: BalaValueData;
  total_virupas: number;
  total_rupas: number;
  required_rupas: number;
  meets_minimum: boolean;
}

export interface ShadbalaData {
  /** The seven classical grahas (nodes excluded by Parashari Shadbala). */
  planets: Partial<Record<PlanetName, PlanetShadbalaData>>;
}

export interface StrengthCtx {
  /** ISO-8601 UTC civil sunrise preceding birth (Kalabala basis). */
  sunrise_utc_iso: string;
  ashtakavarga: AshtakavargaData;
  shadbala: ShadbalaData;
}

// --- per-life-domain synthesis ---

export interface HouseSignificatorData {
  house: number;
  sign: ZodiacSign;
  lord: PlanetName;
  lord_house: number;
  lord_sign: ZodiacSign;
  lord_dignity: DignityName;
  rule: string;
}

export interface KarakaSignificatorData {
  graha: PlanetName;
  house: number;
  sign: ZodiacSign;
  dignity: DignityName;
  is_retrograde: boolean;
  rule: string;
}

export interface VargaPlacementSummaryData {
  chart: DivisionalChartId;
  graha: PlanetName;
  sign: ZodiacSign;
  sign_lord: PlanetName;
  /** Generalized D1-sign-repeat marker (any varga). */
  same_sign_as_d1: boolean;
  /** Classical BPHS vargottama — claimed ONLY when the varga is the D9. */
  vargottama: boolean;
  rule: string;
}

export interface StrengthSummaryData {
  key_graha: PlanetName;
  key_graha_rupas: number;
  key_graha_meets_minimum: boolean;
  sav_bindus: number;
  band: StrengthBand;
  approximated: boolean;
  note: string;
}

export interface CurrentEmphasisData {
  active_dasha_significator: boolean;
  /** Subset of "maha" / "antar" / "pratyantar" (schema types it as str). */
  dasha_levels: string[];
  matched_dasha_lords: PlanetName[];
  under_sade_sati: boolean;
  transit_severity: TransitSeverity;
  /** transit_severity is a coarse vote-sum heuristic, flagged explicitly. */
  approximated: boolean;
  note: string;
  rule: string;
}

export interface DomainWindowData {
  date: string;
  source: DomainWindowSource;
  kind: TransitEventKind;
  trigger: PlanetName | null;
  severity: TransitSeverity;
  descriptor: string;
}

export interface LifeDomainForecastData {
  domain: LifeDomain;
  houses: HouseSignificatorData[];
  karakas: KarakaSignificatorData[];
  varga: VargaPlacementSummaryData;
  strength_summary: StrengthSummaryData;
  current_emphasis: CurrentEmphasisData;
  upcoming_windows: DomainWindowData[];
}

/** All seven life-domain forecasts for one chart + instant. */
export interface DomainsCtx {
  instant: string;
  forecasts: Record<LifeDomain, LifeDomainForecastData>;
}

// ============================================================================
// Mesh Edge (relational context between two charts; engine-computed,
// adapter-reshaped)
//
// UI mirror of the backend `MeshEdgeContext` (schemas/mesh.py). INTEGRITY
// FRAME: relations are computed FROM two finished natal charts (read-only
// inputs); neither chart is recomputed, reweighted or mutated by the other.
// Same reshape contract as the rest of this file: planet names are the
// canonical lowercase `PlanetName`, signs the lowercase `ZodiacSign`,
// datetimes ISO-8601 UTC strings, every number/citation engine-verbatim.
// In every `MeshEdgeCtx`, `a` is the ANCHOR's chart and `b` the MEMBER's.
// ============================================================================

/** Explicit Melapaka role — stated by the caller, never guessed by the engine. */
export type MatchRole = 'bride' | 'groom';

/** The eight kootas of Ashtakoota Guna Milan (1+2+3+4+5+6+7+8 = 36). */
export type KootaName =
  | 'varna'
  | 'vashya'
  | 'tara'
  | 'yoni'
  | 'graha_maitri'
  | 'gana'
  | 'bhakoot'
  | 'nadi';

/** Classical-convention reading of the /36 total (labels, not verdicts). */
export type CompatibilityBand = 'not_recommended' | 'average' | 'good' | 'excellent';

/** The dosha flags Guna Milan raises (closed set). */
export type MeshDoshaName = 'bhakoot_dosha' | 'nadi_dosha';

/** Reference point Mars's dosha houses are counted from (per school). */
export type MangalReferencePoint = 'lagna' | 'moon' | 'venus';

/** How a guest graha touches a host natal point in the overlay. */
export type OverlayContactKind = 'close_conjunction' | 'same_sign' | 'graha_drishti';

/** A host chart's natal points the overlay targets (lagna + the 9 grahas). */
export type NatalPointName = 'lagna' | PlanetName;

/** The Moon facts Guna Milan reads — verbatim from the natal context. */
export interface MeshMoonData {
  nakshatra: string;
  nakshatra_index: number;
  nakshatra_pada: number;
  sign: ZodiacSign;
  sign_degrees: number;
}

/** One koota's score with its human-readable basis and table citation. */
export interface KootaResultData {
  koota: KootaName;
  earned: number;
  maximum: number;
  basis: string;
  source: string;
}

/** A classical cancellation rule that fired, with its citation. */
export interface DoshaCancellationData {
  rule: string;
  description: string;
  source: string;
}

/** A dosha verdict: present / cancelled, with the rules that decided it. */
export interface DoshaFlagData {
  name: MeshDoshaName;
  present: boolean;
  cancelled: boolean;
  cancellations: DoshaCancellationData[];
  basis: string;
  source: string;
}

/** The full 8-koota / 36-guna Melapaka match between two Moons. */
export interface AshtakootaData {
  bride_moon: MeshMoonData;
  groom_moon: MeshMoonData;
  kootas: KootaResultData[];
  total: number;
  maximum: number;
  band: CompatibilityBand;
  band_basis: string;
  bhakoot_dosha: DoshaFlagData;
  nadi_dosha: DoshaFlagData;
  source: string;
}

/** Mars's dosha verdict counted from ONE reference point (one school). */
export interface MangalReferenceData {
  reference: MangalReferencePoint;
  school: string;
  mars_sign: ZodiacSign;
  mars_house: number;
  in_dosha_house: boolean;
  cancellations: DoshaCancellationData[];
  net_dosha: boolean;
  source: string;
}

/** Mangal dosha for one chart across the three classical references. */
export interface MangalDoshaData {
  references: MangalReferenceData[];
  has_dosha: boolean;
  convention: string;
}

/** Mutual Mangal-dosha comparison between two charts. */
export interface DoshaMatchData {
  a: MangalDoshaData;
  b: MangalDoshaData;
  mutually_cancelled: boolean;
  compatible: boolean;
  basis: string;
  source: string;
}

/** A guest graha placed (read-only) into a host whole-sign house. */
export interface OverlayPlacementData {
  planet: PlanetName;
  sign: ZodiacSign;
  host_house: number;
}

/** One guest-graha -> host-natal-point contact. */
export interface OverlayContactData {
  planet: PlanetName;
  target: NatalPointName;
  kind: OverlayContactKind;
  host_house: number;
  orb_degrees: number | null;
  heuristic: boolean;
  source: string;
}

/** Guest grahas overlaid on a host chart: placements + typed contacts. */
export interface ChartOverlayData {
  host_lagna_sign: ZodiacSign;
  placements: OverlayPlacementData[];
  contacts: OverlayContactData[];
  conjunction_orb_degrees: number;
  convention: string;
}

/** Both overlay directions for a pair of charts (`a` anchor, `b` member). */
export interface OverlayPairData {
  b_in_a: ChartOverlayData;
  a_in_b: ChartOverlayData;
}

/** One window slice where both charts' maha+antar legs are constant. */
export interface SynchronySegmentData {
  start: string;
  end: string;
  a_maha: PlanetName;
  a_antar: PlanetName;
  b_maha: PlanetName;
  b_antar: PlanetName;
  shared_lords: PlanetName[];
  simultaneous_boundary: boolean;
}

/** Two charts' dated Vimshottari timelines joined over an explicit window. */
export interface DashaSynchronyData {
  window_start: string;
  window_end: string;
  segments: SynchronySegmentData[];
  convention_a: DashaYearConvention;
  convention_b: DashaYearConvention;
  basis: string;
}

/** A graha's observable natal condition (verbatim engine facts). */
export interface GrahaConditionData {
  planet: PlanetName;
  sign: ZodiacSign;
  house: number;
  dignity: DignityName;
  is_retrograde: boolean;
  is_combust: boolean;
}

/** One karaka graha's condition, with the karakatva citation. */
export interface KarakaAssessmentData {
  condition: GrahaConditionData;
  source: string;
}

/** The classical house + karaka corroboration for one relation, one chart. */
export interface RelationSignificatorsData {
  relationship: MemberRelationship;
  karaka_house: number;
  house_basis: string;
  house_sign: ZodiacSign;
  house_lord: PlanetName;
  lord_condition: GrahaConditionData;
  occupants: PlanetName[];
  karakas: KarakaAssessmentData[];
}

/**
 * The full relation context between two READ-ONLY natal charts. `a` is the
 * ANCHOR profile's chart and `b` the MEMBER's (the store's `ensureMeshEdge`
 * fixes this order); `significators_a` belongs to the anchor, `b_in_a`
 * overlays the member's grahas on the anchor's houses, and so on.
 */
export interface MeshEdgeCtx {
  relationship: MemberRelationship;
  role_a: MatchRole;
  role_b: MatchRole;
  ashtakoota: AshtakootaData;
  mangal_match: DoshaMatchData;
  overlay: OverlayPairData;
  synchrony: DashaSynchronyData;
  significators_a: RelationSignificatorsData;
  significators_b: RelationSignificatorsData;
  /** The engine's read-only integrity statement, verbatim. */
  integrity_note: string;
}

/** The engine's qualitative yoga grade. There is NO numeric yoga strength. */
export type YogaGrade = 'strong' | 'moderate' | 'weak';

/** The engine's closed yoga-category vocabulary. */
export type YogaCategory =
  | 'mahapurusha'
  | 'raja'
  | 'dhana'
  | 'chandra'
  | 'surya'
  | 'auspicious'
  | 'dosha'
  | 'special';

/** The closed vocabulary of observed factors behind a yoga's grade. */
export type YogaFactorType = 'dignity' | 'combustion' | 'retrograde' | 'house_class';

/**
 * One real, observed factor behind a yoga's qualitative grade — the engine's
 * own words (`value` like "exalted", `basis` a classical citation), verbatim.
 */
export interface YogaStrengthFactorData {
  factor_type: YogaFactorType;
  planet: PlanetName;
  value: string;
  basis: string;
}

/** An explicit formation clause that fired, with its classical source. */
export interface YogaFormationRuleData {
  rule: string;
  description: string;
  source: string;
  planets: PlanetName[];
  houses: number[];
}

/**
 * A detected yoga with a complete, honest trace (engine YogaData verbatim).
 * Every trace list is min-length-1 by backend schema; only FORMED yogas are
 * emitted. The old `strength` / `effective_strength` / `is_active` numeric
 * fields no longer exist anywhere in the contract.
 */
export interface YogaData {
  name: string;
  display_name: string;
  category: YogaCategory;
  description: string;
  effects: string;
  grade: YogaGrade;
  strength_factors: YogaStrengthFactorData[];
  planets_involved: PlanetName[];
  houses_involved: number[];
  planetary_signature: string;
  formation_rules: YogaFormationRuleData[];
}

/**
 * Base persona type with dual-mode content (layman + technical)
 * Matches backend Persona class
 */
export interface Persona {
  layman?: string;
  technical?: string;
}

/**
 * Titled persona with dual-mode content
 * Matches backend TitledPersona, Strength, Challenge, LifeTheme classes
 */
export interface TitledPersona extends Persona {
  title?: string;
}

/**
 * Health guidance with dual-mode content
 * Matches backend HealthGuidance class
 */
export interface HealthGuidance extends Persona {}

/**
 * Education guidance with dual-mode content
 * Matches backend EducationGuidance class
 */
export interface EducationGuidance extends Persona {}

/**
 * Career guidance with dual-mode content
 * Matches backend CareerGuidance class
 */
export interface CareerGuidance extends Persona {}

/**
 * Relationship guidance with dual-mode content
 * Matches backend RelationshipGuidance class
 */
export interface RelationshipGuidance extends Persona {}

/**
 * Finance guidance with dual-mode content
 * Matches backend FinanceGuidance class
 */
export interface FinanceGuidance extends Persona {}

/**
 * Spiritual guidance with dual-mode content
 * Matches backend SpiritualGuidance class
 */
export interface SpiritualGuidance extends Persona {}

/**
 * Life evolution guidance with dual-mode content
 * Matches backend LifeEvolutionGuidance class
 */
export interface LifeEvolutionGuidance extends Persona {}

/**
 * Remedial measures with dual-mode content
 * Matches backend RemedialMeasures class
 */
export interface RemedialMeasures extends Persona {}

/**
 * Integrated yoga narrative with dual-mode content
 * Matches backend IntegratedYogaNarrative class
 */
export interface IntegratedYogaNarrative extends Persona {}

/**
 * Current period guidance (for dasha timing)
 * Used for displaying current astrological period information
 */
export interface CurrentPeriodGuidance {
  current_period?: string;
  period_summary?: string;
  guidance?: string;
  key_themes?: string[];
  opportunities?: string[];
  challenges?: string[];
  timing_advice?: Record<string, string>;
}

/**
 * Vedic interpretation with dual-mode persona-based content
 * Matches backend VedicInterpretation class
 */
export interface VedicInterpretation {
  // Dual-voice headline: `layman` is jargon-free ("For You"), `technical` names
  // the actual placements ("For Astrologer"). Renders pick a voice via
  // `personaText` at the boundary, so toggling re-renders without an LLM call.
  summary: Persona;
  strengths: TitledPersona[];
  challenges: TitledPersona[];
  life_themes: TitledPersona[];

  // Integrated yoga narrative (MANDATORY per backend)
  integrated_yoga_narrative?: IntegratedYogaNarrative;

  // Life area guidance - now Persona objects for dual-mode content
  health_guidance?: HealthGuidance | null;
  education_guidance?: EducationGuidance | null;
  career_guidance?: CareerGuidance | null;
  relationship_guidance?: RelationshipGuidance | null;
  finances_guidance?: FinanceGuidance | null;
  spiritual_guidance?: SpiritualGuidance | null;
  life_evolution_guidance?: LifeEvolutionGuidance | null;

  // Remedial measures
  remedial_measures?: RemedialMeasures | null;

  // The Road Ahead — upcoming engine-dated dasha windows (6th interpretation
  // section). Optional: readings saved before period intelligence landed have
  // no such section and must keep loading/rendering their 5 sections.
  upcoming_periods?: TitledPersona[] | null;

  // Current period guidance (for UI display, may be populated from dasha data)
  current_period_guidance?: CurrentPeriodGuidance | null;
}

// ============================================================================
// Chart Generation (Flow 1)
// ============================================================================

export interface BirthChartGenerationRequest {
  name: string;
  date: string;           // YYYY-MM-DD
  time: string;           // HH:MM
  latitude: number;       // -90 to 90
  longitude: number;      // -180 to 180
  location_name?: string; // Display name for the location
  timezone?: string;      // Default: UTC
  is_primary?: boolean;   // Mark as user's primary chart
}

// ============================================================================
// Astronomical Calculation Types (from chart_data)
// ============================================================================

/**
 * Sidereal planet data from backend calculations
 * Matches backend SiderealPlanet class
 */
export interface SiderealPlanet {
  name: string;
  longitude: number;
  sign: string;
  sign_lord: string;
  nakshatra: string;
  nakshatra_lord: string;
  nakshatra_pada: number;
  house: number;
  is_retrograde: boolean;
  /** Engine combustion flag (asta). Optional: older stored charts omit it. */
  is_combust?: boolean;
  /** Whole-sign houses this graha lords; [] for Rahu/Ketu. Optional (older charts). */
  houses_ruled?: readonly number[];
  /** BPHS Yogakaraka flag. Optional (older charts). */
  is_yogakaraka?: boolean;
}

/**
 * The Lagna (Ascendant) as carried on `SiderealContext`. Historically an
 * untyped `Record<string, unknown>`; the named fields below document what the
 * engine actually emits while the `[key: string]: unknown` index signature
 * keeps it permissive (partial test fixtures like `lagna: {}` still type-check).
 *
 * The three `lagna_*` / `is_near_cusp` fields are the engine's CUSP-PROXIMITY
 * single-source-of-truth — additive, so older stored charts/bundles omit them
 * (the UI's lib/lagnaCusp.ts then falls back to its own measurement).
 */
export interface SiderealLagna {
  readonly sign?: string;
  readonly sign_degrees?: number;
  readonly longitude?: number;
  readonly sign_lord?: string;
  readonly nakshatra?: string;
  readonly nakshatra_pada?: number;
  readonly nakshatra_lord?: string;
  /** Degrees from the Lagna to the NEAREST sign boundary (engine cusp SoT). */
  readonly lagna_cusp_distance_deg?: number;
  /** The sign across that nearest boundary (engine Title-Case). */
  readonly lagna_adjacent_sign?: string | null;
  /** True when within the engine's near-cusp threshold (~3°). */
  readonly is_near_cusp?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Sidereal context containing all planet positions
 * Matches backend SiderealContext class
 */
export interface SiderealContext {
  julian_day: number;
  ayanamsa_value: number;
  ayanamsa_type: string;
  house_system: string;
  sidereal_time: number;
  lagna: SiderealLagna;
  planets: Record<string, SiderealPlanet>;
}

/**
 * Astronomical calculations from chart data
 * Matches backend AstronomicalCalculations class
 */
export interface AstronomicalCalculations {
  sidereal_ctx: SiderealContext;
  varga_ctx?: VargaContext;
  dasha_ctx?: VimshottariDashaData;
  yoga_ctx?: YogaData[];
  /** Ashtakavarga + Shadbala (engine strength_context). Absent on older bundles. */
  strength_ctx?: StrengthCtx;
  /** Transits/Gochara + Sade Sati + 12-month timeline. Absent on older bundles. */
  transit_ctx?: TransitCtx;
  /** All 16 Shodasavarga charts (the D9-only varga_ctx above stays as-is). */
  varga_ctx_full?: VargaCtxFull;
  /** Per-life-domain deterministic synthesis (7 forecasts). */
  domains_ctx?: DomainsCtx;
  calculation_timestamp: string;
  software_version: string;
}

// Note: LocationDetails and ProcessedBirthData are defined above (lines 133-154)
// to avoid duplicate interface declarations

/**
 * Complete chart data structure
 * Matches backend ComprehensiveAstrologicalData class
 */
export interface ChartData {
  birth_data?: ProcessedBirthData;
  astronomical_calculations: AstronomicalCalculations;
  interpretation?: VedicInterpretation | null;
  dual_mode_interpretation?: Record<string, unknown> | null;
  current_conditions_for_query_date?: Record<string, unknown> | null;
}

/**
 * Birth chart generation response
 * Matches backend BirthChartGenerationResponse class
 */
export interface BirthChartGenerationResponse extends BaseResponse {
  person_name: string;
  chart_id?: string | null;
  storage_key?: string | null;
  interpretation?: VedicInterpretation | null;
  chart_data?: ChartData | null;
  chart_data_stored: boolean;
  processing_time_seconds?: number | null;
  generated_at: string;
  llm_metadata?: Record<string, unknown> | null;
  /** Token usage summary for real-time UI updates (populated when user is authenticated) */
  token_usage?: TokenUsageSummary | null;
}

// ============================================================================
// Question Answering (Flow 2)
// ============================================================================

export interface AstrologicalQuestionRequest {
  person_name: string;
  question: string;
  include_timing_analysis?: boolean;
  include_remedies?: boolean;
}

/**
 * Dasha information for question responses
 * Matches backend dict[str, Any] structure with typical fields
 */
export interface DashaInfo {
  system?: string;
  current_mahadasha?: string;
  current_antardasha?: string;
  mahadasha?: string;
  antardasha?: string;
  pratyantar?: string;
  maha_until?: string;
  antar_until?: string;
  [key: string]: unknown; // Allow additional fields from backend
}

/**
 * Astrological question response
 * Matches backend AstrologicalQuestionResponse class
 */
export interface AstrologicalQuestionResponse extends BaseResponse {
  person_name: string;
  question: string;
  answer?: string | null;
  current_dasha_info?: DashaInfo | null;
  timing_guidance?: string | null;
  remedies?: string[] | null;
  chart_found: boolean;
  response_time_seconds?: number | null;
  answered_at: string;
  /** Token usage summary for real-time UI updates (populated when user is authenticated) */
  token_usage?: TokenUsageSummary | null;
}

// ============================================================================
// Rectification Types
// ============================================================================

// Life event category vocabulary for birth-time rectification (Phase 2)
export type LifeEventCategory =
  | 'marriage'
  | 'engagement'
  | 'breakup'
  | 'childbirth'
  | 'career_change'
  | 'promotion'
  | 'job_loss'
  | 'business_start'
  | 'relocation'
  | 'property_purchase'
  | 'windfall'
  | 'expense_shock'
  | 'health_issue'
  | 'surgery'
  | 'higher_studies'
  | 'litigation';

/** All 16 life-event categories for rectification. */
export const LIFE_EVENT_CATEGORIES: readonly LifeEventCategory[] = [
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

// Rectification result mode (cusp-based or window-based time-fitting)
export type RectificationMode = 'cusp' | 'window';

// Confidence band for a rectification result (how near the tie between candidates)
export type RectificationBand = 'near_tie' | 'leans' | 'consistent';

// How precisely the user knows an event's date (drives engine weighting).
export type EventDatePrecision = 'exact' | 'month' | 'year' | 'approx';

/** Life event input for rectification analysis. */
export interface RectificationEventInput {
  readonly date: string;
  readonly category: LifeEventCategory;
  readonly precision: EventDatePrecision;
  /**
   * Optional human-readable description of what happened, in the user's own
   * words. Used only for on-device display (so gathered events are
   * distinguishable); never required and never sent to the engine.
   */
  readonly summary?: string;
}

/** Supporting evidence for a life event in the rectification result. */
export interface EventEvidence {
  readonly eventIndex: number;
  readonly category: LifeEventCategory;
  readonly date: string;
  readonly signals: readonly string[];
  readonly contribution: number;
}

/** One candidate rectified time with supporting event evidence. */
export interface RectificationCandidate {
  readonly ascendantSign: string;
  readonly representativeTimeLocal: string;
  readonly lagnaLongitudeDeg: number;
  readonly lagnaCuspDistanceDeg: number;
  readonly isNearCusp: boolean;
  readonly fitScore: number;
  readonly supportingEvents: readonly EventEvidence[];
}

/** The complete rectification result: mode, candidates, margin, band, honesty note. */
export interface RectificationResult {
  readonly mode: RectificationMode;
  readonly candidates: readonly RectificationCandidate[];
  readonly margin: number;
  readonly band: RectificationBand;
  readonly discriminatingEventCount: number;
  readonly recordedTimeSign: string | null;
  readonly honestyNoteKey: string;
}

export type LifeEventType =
  | 'marriage' | 'child_birth' | 'parent_death'
  | 'career_start' | 'career_promotion' | 'business_start'
  | 'education_start' | 'graduation'
  | 'property_acquisition' | 'relocation'
  | 'major_surgery' | 'accident' | 'relationship_end';

// ============================================================================
// Token Usage Types
// ============================================================================

/**
 * Token usage summary included in API responses (chart generation, Q&A)
 * Enables real-time token usage updates without separate API calls
 * Matches backend TokenUsageSummary class
 */
export interface TokenUsageSummary {
  /** Tokens used for input in this operation */
  operation_input_tokens: number;
  /** Tokens used for output in this operation */
  operation_output_tokens: number;
  /** Total tokens used in this operation */
  operation_total_tokens: number;
  /** User's total tokens used this billing period */
  total_used: number;
  /** User's token limit for this billing period */
  limit: number;
  /** Estimated cost in USD for this operation */
  estimated_cost_usd: number;
}

/**
 * Recent LLM call record
 * Matches backend RecentCallResponse
 */
export interface RecentCall {
  call_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

/**
 * Usage breakdown by call type
 * Matches backend CallTypeBreakdownResponse
 */
export interface CallTypeBreakdown {
  count: number;
  tokens: number;
  cost_usd: number;
}

/**
 * Current month usage summary
 * Matches backend MonthlyUsageResponse
 */
export interface MonthlyUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  budget_usd: number;
  budget_remaining_usd: number;
  budget_used_percent: number;
}

/**
 * Complete usage response
 * Matches backend UsageResponse
 */
export interface UsageResponse {
  current_month: MonthlyUsage;
  by_call_type: Record<string, CallTypeBreakdown>;
  recent_calls: RecentCall[];
}

/**
 * Life event type labels for display
 */
export const LIFE_EVENT_TYPE_LABELS: Record<LifeEventType, string> = {
  marriage: 'Marriage',
  child_birth: 'Child Birth',
  parent_death: 'Parent Death',
  career_start: 'Career Start',
  career_promotion: 'Career Promotion',
  business_start: 'Business Start',
  education_start: 'Education Start',
  graduation: 'Graduation',
  property_acquisition: 'Property Purchase',
  relocation: 'Relocation',
  major_surgery: 'Major Surgery',
  accident: 'Accident',
  relationship_end: 'Relationship End',
};

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * Workflow status enum
 * Matches backend WorkflowStatus enum values (lowercase)
 * Note: Backend Python enum uses UPPERCASE names but lowercase VALUES
 * e.g., WorkflowStatus.COMPLETED = "completed"
 */
export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'terminated';

/**
 * Workflow progress information
 * Matches backend WorkflowProgress model
 */
export interface WorkflowProgress {
  current_step: string;
  percent_complete: number;
  steps_completed: string[];
}

/**
 * Response from starting an onboarding workflow
 * Matches backend WorkflowStartResponse model
 */
export interface WorkflowStartResponse {
  success: boolean;
  workflow_id: string;
  run_id: string;
  status: WorkflowStatus;
  message: string;
  task_queue: string;
}

/**
 * Response from checking workflow status
 * Matches backend WorkflowStatusResponse model
 */
export interface WorkflowStatusResponse {
  success: boolean;
  workflow_id: string;
  status: WorkflowStatus;
  progress?: WorkflowProgress;
  result?: BirthChartGenerationResponse;
  error?: string;
}

/**
 * Response from getting workflow result
 * Matches backend WorkflowResultResponse model
 */
export interface WorkflowResultResponse {
  success: boolean;
  workflow_id: string;
  run_id?: string;
  status: WorkflowStatus;
  result?: BirthChartGenerationResponse;
  progress?: WorkflowProgress;
  error?: string;
}

/**
 * Request to start an onboarding workflow
 * Matches backend StartOnboardingRequest model
 */
export interface StartOnboardingRequest {
  name: string;
  date: string;           // YYYY-MM-DD
  time: string;           // HH:MM
  city: string;
  state?: string;
  country?: string;
  email?: string;
  options?: {
    generate_interpretation?: boolean;
  };
}

// ============================================================================
// Life Events CRUD Types
// ============================================================================

/**
 * Life event stored in user preferences (CRUD model)
 * Matches backend life event structure for CRUD operations
 */
export interface StoredLifeEvent {
  id: string;
  event_type: LifeEventType;
  description: string;
  date: string;                    // YYYY-MM-DD format
  time_known: boolean;
  time?: string | null;            // HH:MM format if known
  created_at: string;              // ISO datetime
  updated_at?: string | null;      // ISO datetime
}

/**
 * Input for creating a new life event
 */
export interface LifeEventCreateInput {
  event_type: LifeEventType;
  description: string;
  date: string;                    // YYYY-MM-DD format
  time_known?: boolean;
  time?: string | null;            // HH:MM format if known
}

/**
 * Input for updating an existing life event
 */
export interface LifeEventUpdateInput {
  event_type?: LifeEventType;
  description?: string;
  date?: string;                   // YYYY-MM-DD format
  time_known?: boolean;
  time?: string | null;            // HH:MM format if known
}

/**
 * Response from GET /users/life-events
 */
export interface LifeEventsResponse {
  events: StoredLifeEvent[];
  count: number;
}

/**
 * Response from DELETE /users/life-events/:id
 */
export interface LifeEventDeleteResponse {
  success: boolean;
  message?: string;
}

// ============================================================================
// Token Budget Types
// ============================================================================

/**
 * User subscription tier for token budgets
 * Matches backend UserTier enum
 */
export type UserTier = 'free' | 'basic' | 'premium' | 'enterprise';

/**
 * User's current token budget status
 * Matches backend TokenBudgetStatus model
 */
export interface TokenBudgetStatus {
  /** User's unique identifier */
  user_id: string;
  /** Total monthly token allocation */
  monthly_budget: number;
  /** Tokens consumed this billing period */
  tokens_used: number;
  /** Tokens still available (0 if exceeded) */
  tokens_remaining: number;
  /** Percentage of budget consumed (0-100) */
  usage_percentage: number;
  /** Date when the budget was last reset (YYYY-MM-DD format) */
  reset_date?: string | null;
  /** True if user has exceeded budget */
  is_exceeded: boolean;
  /** User's subscription tier */
  tier: UserTier;
}

/**
 * Error response for token budget operations
 * Matches backend TokenBudgetError model
 */
export interface TokenBudgetError {
  /** Error message describing the issue */
  error: string;
}
