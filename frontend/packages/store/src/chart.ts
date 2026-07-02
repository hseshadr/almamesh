/**
 * Chart UI Store - Zustand state for chart UI state only (in-memory, no persistence)
 *
 * NOTE: Server state (chart data, API responses) is managed by React Query.
 * This store only handles UI-specific state like selected view, filters, etc.
 *
 * Spec 031 Phase 5 additions:
 * - Decoupled chart calculation and interpretation tracking
 * - Streaming interpretation state
 * - Interpretation versioning support
 * - Layman/expert view mode toggle
 *
 * Spec 036 (Cache Consolidation): Removed persist middleware.
 * UI selections don't need to survive page refresh.
 */

import { create, StateCreator } from 'zustand';
import type {
  SepChartCalculationRequest,
  SepChartCalculationResponse,
  SepInterpretationResponse,
  SepInterpretationVersionSummary,
  SepInterpretationVersion,
  SepViewMode,
} from '@almamesh/shared-types';
// NOTE (P3/P4 local-first): chart compute runs in-browser via @almamesh/browser;
// interpretation streaming lives ENTIRELY in the web app's
// `useStreamingInterpretation` hook (@almamesh/llm structured generator +
// `useInterpretationStore`) — this store holds only the UI-side state. The
// Sep* chart-calculation action remains a benign stub (the real compute path
// lives in the app's useChart hook / Onboarding).

export type ChartViewMode = 'rasi' | 'navamsa' | 'both';
export type ChartDisplayStyle = 'north' | 'south';

/**
 * Interpretation view mode for layman/expert toggle (Spec 031)
 */
export type InterpretationViewMode = SepViewMode;

export interface ChartUIStore {
  // UI State
  selectedPersonName: string | null;
  /**
   * Cross-highlight selection shared by the 2D kundli and the 3D force field
   * (planet lowercase id / name, e.g. "sun"), or null. Lifting it here keeps the
   * hero scene and the chart SVGs highlighting the same graha together.
   */
  selectedPlanet: string | null;
  viewMode: ChartViewMode;
  displayStyle: ChartDisplayStyle;
  showPlanetDetails: boolean;
  showHouseDetails: boolean;
  expandedSections: string[];  // Changed from Set<string> - Sets cannot be JSON serialized

  // Conversation/Q&A UI state
  conversationHistory: Array<{
    question: string;
    answer: string;
    timestamp: string;
  }>;

  // ============================================================================
  // Spec 031 Phase 5: Decoupled Chart/Interpretation State
  // ============================================================================

  isCalculatingChart: boolean;
  isStreamingInterpretation: boolean;
  streamedContent: string;
  currentStreamingSection: string | null;
  currentChartResult: SepChartCalculationResponse | null;
  currentInterpretation: SepInterpretationResponse | null;
  interpretationVersions: SepInterpretationVersionSummary[];
  currentVersion: number | null;
  interpretationViewMode: InterpretationViewMode;
  chartError: string | null;
  interpretationError: string | null;

  // Actions
  setSelectedPerson: (name: string | null) => void;
  setSelectedPlanet: (planet: string | null) => void;
  setViewMode: (mode: ChartViewMode) => void;
  setDisplayStyle: (style: ChartDisplayStyle) => void;
  togglePlanetDetails: () => void;
  toggleHouseDetails: () => void;
  toggleSection: (section: string) => void;
  addToConversationHistory: (question: string, answer: string) => void;
  clearConversationHistory: () => void;
  reset: () => void;

  // ============================================================================
  // Spec 031 Phase 5: Decoupled Chart/Interpretation Actions
  // ============================================================================

  calculateChart: (request: SepChartCalculationRequest) => Promise<SepChartCalculationResponse>;

  setInterpretationViewMode: (mode: InterpretationViewMode) => void;
  loadVersionHistory: (chartId: string) => Promise<void>;
  loadVersion: (chartId: string, version: number) => Promise<SepInterpretationVersion>;
  clearStreamedContent: () => void;
  clearErrors: () => void;
  resetChartInterpretationState: () => void;
}

const initialSpec031State = {
  isCalculatingChart: false,
  isStreamingInterpretation: false,
  streamedContent: '',
  currentStreamingSection: null as string | null,
  currentChartResult: null as SepChartCalculationResponse | null,
  currentInterpretation: null as SepInterpretationResponse | null,
  interpretationVersions: [] as SepInterpretationVersionSummary[],
  currentVersion: null as number | null,
  interpretationViewMode: 'layman' as InterpretationViewMode,
  chartError: null as string | null,
  interpretationError: null as string | null,
};

/**
 * Chart UI store state creator (without persistence)
 */
export const chartUIStoreCreator: StateCreator<ChartUIStore> = (set) => ({
  // Initial state
  selectedPersonName: null,
  selectedPlanet: null,
  viewMode: 'rasi',
  displayStyle: 'south',
  showPlanetDetails: true,
  showHouseDetails: false,
  expandedSections: [],
  conversationHistory: [],

  ...initialSpec031State,

  // Actions
  setSelectedPerson: (name) => set({ selectedPersonName: name }),

  setSelectedPlanet: (planet) => set({ selectedPlanet: planet }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setDisplayStyle: (style) => set({ displayStyle: style }),

  togglePlanetDetails: () =>
    set((state) => ({ showPlanetDetails: !state.showPlanetDetails })),

  toggleHouseDetails: () =>
    set((state) => ({ showHouseDetails: !state.showHouseDetails })),

  toggleSection: (section) =>
    set((state) => {
      const isExpanded = state.expandedSections.includes(section);
      if (isExpanded) {
        return { expandedSections: state.expandedSections.filter(s => s !== section) };
      } else {
        return { expandedSections: [...state.expandedSections, section] };
      }
    }),

  addToConversationHistory: (question, answer) =>
    set((state) => ({
      conversationHistory: [
        ...state.conversationHistory,
        {
          question,
          answer,
          timestamp: new Date().toISOString(),
        },
      ],
    })),

  clearConversationHistory: () => set({ conversationHistory: [] }),

  reset: () =>
    set({
      selectedPersonName: null,
      selectedPlanet: null,
      viewMode: 'rasi',
      displayStyle: 'south',
      showPlanetDetails: true,
      showHouseDetails: false,
      expandedSections: [],
      conversationHistory: [],
      ...initialSpec031State,
    }),

  // P3: chart compute moved in-browser. The real path (engine + adapter +
  // persist) lives in the app's useChart hook / Onboarding, which hold the
  // engine handle from the runtime provider. This Sep-flow action is
  // retained for legacy callers and resolves to a benign empty result so the
  // UI never throws if something still invokes it.
  calculateChart: async (_request: SepChartCalculationRequest) => {
    set({
      isCalculatingChart: false,
      chartError: null,
      currentChartResult: null,
    });
    return {
      success: false,
      message: 'Chart calculation now runs in-browser; use the chart engine path.',
    } as SepChartCalculationResponse;
  },

  setInterpretationViewMode: (mode: InterpretationViewMode) =>
    set({ interpretationViewMode: mode }),

  // P4 stub: no on-device version history yet — resolve to an empty list.
  loadVersionHistory: async (_chartId: string) => {
    set({ interpretationVersions: [], currentVersion: null });
  },

  // P4 stub: no on-device versions yet — return a benign placeholder version.
  // Cast through `unknown` at this boundary: the placeholder is intentionally
  // empty (on-device narration is not wired) and never reaches a renderer that
  // relies on its contents until P4 fills this in.
  loadVersion: async (chartId: string, version: number) => {
    set({ currentVersion: version });
    return {
      chart_id: chartId,
      interpretation_id: '',
      version,
      view_mode: 'layman',
      focus_area: null,
      agent_used: '',
      sections_generated: [],
      generated_at: new Date(0).toISOString(),
      interpretation: {},
      token_usage: null,
      processing_time_seconds: 0,
    } as unknown as SepInterpretationVersion;
  },

  clearStreamedContent: () =>
    set({
      streamedContent: '',
      currentStreamingSection: null,
    }),

  clearErrors: () =>
    set({
      chartError: null,
      interpretationError: null,
    }),

  resetChartInterpretationState: () => set(initialSpec031State),
});

/**
 * Chart UI store (in-memory only, no persistence)
 *
 * Spec 036 (Cache Consolidation): Removed persistence.
 * UI selections (tabs, expanded sections) don't need to survive refresh.
 */
export const useChartStore = create<ChartUIStore>()(chartUIStoreCreator);

// Alias for new code
export const useChartUIStore = useChartStore;
