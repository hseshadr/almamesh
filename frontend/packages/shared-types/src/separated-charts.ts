/**
 * Chart-Interpretation Separation Types (Spec 031)
 *
 * TypeScript interfaces for the decoupled chart calculation and interpretation APIs.
 * These types support:
 * 1. Pure chart calculation (deterministic, cacheable)
 * 2. LLM interpretation generation (streaming, regenerable)
 * 3. Interpretation versioning
 *
 * Note: Types are prefixed with 'Sep' to avoid conflicts with existing types.
 *
 * @packageDocumentation
 */

import type {
  VedicInterpretation,
  ChartData,
  TokenUsageSummary,
} from './index';

// ============================================================================
// Enums and Literals
// ============================================================================

export type SepAyanamsaType = 'lahiri' | 'raman' | 'krishnamurti' | 'fagan_bradley';
export type SepHouseSystem = 'whole_sign' | 'placidus' | 'equal' | 'koch';
export type SepViewMode = 'layman' | 'expert';

export type SepInterpretationSection =
  | 'core_analysis'
  | 'personality'
  | 'career'
  | 'relationships'
  | 'health'
  | 'spiritual'
  | 'yogas'
  | 'dasha'
  | 'remedies'
  | 'timing';

export type SepFocusArea = 'general' | 'career' | 'relationships' | 'health' | 'spiritual';

// ============================================================================
// Chart Calculation Types
// ============================================================================

/**
 * Request for pure chart calculation (no LLM)
 * POST /api/v1/charts/calculate
 */
export interface SepChartCalculationRequest {
  name: string;
  date: string;
  time: string;
  city: string;
  state?: string;
  country?: string;
  email?: string;
  ayanamsa?: SepAyanamsaType;
  house_system?: SepHouseSystem;
  overwrite_existing?: boolean;
}

export interface SepChartCalculationResponse {
  success: boolean;
  message: string;
  chart_id: string;
  person_name: string;
  chart_data: ChartData;
  cache_hit: boolean;
  cache_key: string | null;
  processing_time_seconds: number;
  calculated_at: string;
  has_existing_interpretation: boolean;
}

// ============================================================================
// Interpretation Types
// ============================================================================

/**
 * Request for chart interpretation generation
 * POST /api/v1/charts/{chart_id}/interpret
 */
export interface SepInterpretationRequest {
  view_mode?: SepViewMode;
  sections?: SepInterpretationSection[] | null;
  focus_area?: SepFocusArea | null;
  stream?: boolean;
  max_tokens?: number;
}

export interface SepStreamingInterpretationRequest extends SepInterpretationRequest {
  stream: true;
}

export interface SepInterpretationResponse {
  success: boolean;
  message: string;
  chart_id: string;
  interpretation_id: string;
  interpretation: VedicInterpretation;
  agent_used: string;
  view_mode: SepViewMode;
  sections_generated: string[];
  version: number;
  processing_time_seconds: number;
  token_usage: TokenUsageSummary | null;
  generated_at: string;
}

// ============================================================================
// Reinterpretation Types
// ============================================================================

export interface SepReinterpretationRequest {
  view_mode: SepViewMode;
  focus_area?: SepFocusArea | null;
  sections?: SepInterpretationSection[] | null;
  reason?: string | null;
  stream?: boolean;
}

// ============================================================================
// Interpretation Version Types
// ============================================================================

export interface SepInterpretationVersionSummary {
  interpretation_id: string;
  version: number;
  view_mode: SepViewMode;
  focus_area: SepFocusArea | null;
  agent_used: string;
  sections_generated: string[];
  generated_at: string;
}

export interface SepInterpretationVersionsResponse {
  chart_id: string;
  versions: SepInterpretationVersionSummary[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface SepInterpretationVersion extends SepInterpretationVersionSummary {
  chart_id: string;
  interpretation: VedicInterpretation;
  token_usage: TokenUsageSummary | null;
  processing_time_seconds: number;
}

// ============================================================================
// SSE Streaming Event Types
// ============================================================================

export interface SepInterpretationStreamStart {
  interpretation_id: string;
  agent: string;
}

export interface SepInterpretationSectionStart {
  section: string;
  index: number;
}

export interface SepInterpretationToken {
  content: string;
  section: string;
}

export interface SepInterpretationSectionComplete {
  section: string;
  tokens: number;
}

export interface SepInterpretationStreamComplete {
  total_tokens: number;
  sections: number;
  processing_time: number;
}

export interface SepInterpretationStreamUsage {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface SepInterpretationStreamError {
  error_type: string;
  message: string;
  retryable: boolean;
}

export type SepInterpretationStreamEvent =
  | { type: 'start'; data: SepInterpretationStreamStart }
  | { type: 'section_start'; data: SepInterpretationSectionStart }
  | { type: 'token'; data: SepInterpretationToken }
  | { type: 'section_complete'; data: SepInterpretationSectionComplete }
  | { type: 'complete'; data: SepInterpretationStreamComplete }
  | { type: 'usage'; data: SepInterpretationStreamUsage }
  | { type: 'error'; data: SepInterpretationStreamError };

// ============================================================================
// Error Types
// ============================================================================

export interface SepChartCalculationError {
  success: false;
  error_type: 'validation_error' | 'geocoding_error' | 'calculation_error' | 'storage_error';
  error_message: string;
  error_details: Record<string, unknown> | null;
  retryable: boolean;
}

export interface SepInterpretationError {
  success: false;
  error_type: 'chart_not_found' | 'llm_timeout' | 'llm_error' | 'agent_error' | 'security_blocked';
  error_message: string;
  partial_content: string | null;
  retryable: boolean;
}

