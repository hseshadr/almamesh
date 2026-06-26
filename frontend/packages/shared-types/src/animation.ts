/**
 * Animation Script Types
 * TypeScript interfaces matching backend animation models
 *
 * @packageDocumentation
 */

// ============================================================================
// Graha (Planet) Types
// ============================================================================

/**
 * Names of the nine Vedic planets (Navagrahas)
 */
export type GrahaName =
  | 'Sun'
  | 'Moon'
  | 'Mars'
  | 'Mercury'
  | 'Jupiter'
  | 'Venus'
  | 'Saturn'
  | 'Rahu'
  | 'Ketu';

/**
 * Definition of a Graha including visual properties
 */
export interface GrahaDef {
  name: GrahaName;
  color: string;
  glyph: string;
  dasha_years: number;
}

// ============================================================================
// Dasha Segment Types
// ============================================================================

/**
 * Level of the Dasha period
 */
export type DashaLevel = 'mahadasha' | 'antardasha' | 'pratyantardasha';

/**
 * A segment of a Dasha period for animation
 */
export interface Segment {
  id: string;
  level: DashaLevel;
  graha: GrahaName;
  start_date: string;
  end_date: string;
  duration_days: number;
  intensity: number;
  parent_id: string | null;
  children_ids: string[];
}

// ============================================================================
// Camera Track Types
// ============================================================================

/**
 * Camera tracking information for smooth transitions
 */
export interface CameraTrack {
  target_segment_id: string;
  position: [number, number, number];
  look_at: [number, number, number];
  transition_duration_ms: number;
  easing: string;
}

// ============================================================================
// Animation Script Types
// ============================================================================

/**
 * Time range for the animation
 */
export interface TimeRange {
  start: string;
  end: string;
}

/**
 * Complete animation script for 3D Dasha visualization
 */
export interface AnimationScript {
  version: string;
  generated_at: string;
  chart_id: string;
  user_id: string;
  time_range: TimeRange;
  graha_definitions: Record<GrahaName, GrahaDef>;
  segments: Segment[];
  camera_tracks: CameraTrack[];
  metadata: Record<string, unknown>;
}
