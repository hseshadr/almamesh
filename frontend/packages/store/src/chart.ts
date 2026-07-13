/**
 * Chart UI Store - Zustand state for chart UI state only (in-memory, no persistence)
 *
 * Browser computation, chart data, and interpretations live in their domain
 * stores. This store only handles chart selection and display preferences.
 *
 * Spec 036 (Cache Consolidation): Removed persist middleware.
 * UI selections don't need to survive page refresh.
 */

import { create, StateCreator } from 'zustand';

export type ChartViewMode = 'rasi' | 'navamsa' | 'both';
export type ChartDisplayStyle = 'north' | 'south';

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
}

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
    }),
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
