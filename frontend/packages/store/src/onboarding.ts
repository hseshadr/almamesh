/**
 * Onboarding Store - Zustand state for onboarding flow (in-memory, no persistence)
 *
 * Spec 036 (Cache Consolidation): Removed persist middleware.
 * Onboarding status is fetched from API endpoint /users/me/onboarding-status.
 * Each step triggers an optional save callback for incremental backend saves.
 */

import { create, StateCreator } from 'zustand';
import type { TimeConfidence } from '@almamesh/constants';

/**
 * Format a Date as YYYY-MM-DD in LOCAL timezone (not UTC)
 * IMPORTANT: Do NOT use toISOString().split('T')[0] as it converts to UTC
 * which can shift dates by a day depending on timezone
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Callback type for saving onboarding progress after each step.
 * This is called after each step completion for incremental backend saves.
 */
export type OnboardingSaveCallback = (data: OnboardingData, step: number) => Promise<void>;

export interface OnboardingData {
  // Step 1: Name
  name: string;

  // Step 2: Birth Date
  birthDate: Date | null;

  // Step 3: Birth Time
  birthTime: string; // HH:MM format
  timeConfidence: TimeConfidence;

  // Step 4: Birth Location
  city: string;
  state: string;
  country: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;

  // Step 5: Preferences (optional)
  interests: string[];

  // Rectification (if time unknown)
  needsRectification: boolean;
  rectificationSessionId?: string;
}

export interface OnboardingStore {
  // State
  currentStep: number;
  data: OnboardingData;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  lastSavedStep: number;

  // Save callback (set by platform-specific code)
  _saveCallback: OnboardingSaveCallback | null;
  setSaveCallback: (callback: OnboardingSaveCallback | null) => void;

  // Navigation
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;

  // Data updates with optional save
  setName: (name: string) => void;
  setBirthDate: (date: Date) => void;
  setBirthTime: (time: string, confidence: TimeConfidence) => void;
  setLocation: (location: {
    city: string;
    state: string;
    country: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
  }) => void;
  setInterests: (interests: string[]) => void;
  setRectificationSession: (sessionId: string) => void;

  // Incremental save - call after each step completion
  saveProgress: () => Promise<void>;

  // Load saved progress (for resume functionality)
  loadProgress: (data: Partial<OnboardingData>, step: number) => void;

  // Utils
  reset: () => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  isStepValid: (step: number) => boolean;
  getFormattedBirthData: () => {
    name: string;
    date: string;
    time: string;
    latitude: number;
    longitude: number;
    location_name?: string;
    timezone?: string;
    is_primary?: boolean;
  } | null;
}

const initialData: OnboardingData = {
  name: '',
  birthDate: null,
  birthTime: '',
  timeConfidence: 'exact',
  city: '',
  state: '',
  country: '',
  interests: [],
  needsRectification: false,
};

/**
 * Onboarding store state creator
 * Supports incremental save callbacks for backend sync.
 */
export const onboardingStoreCreator: StateCreator<OnboardingStore> = (set, get) => ({
  // Initial state
  currentStep: 1,
  data: initialData,
  isLoading: false,
  error: null,
  isSaving: false,
  lastSavedStep: 0,

  // Save callback management
  _saveCallback: null,
  setSaveCallback: (callback) => set({ _saveCallback: callback }),

  // Navigation - now triggers save on step advance
  nextStep: () => {
    const { currentStep, isStepValid, saveProgress } = get();
    if (isStepValid(currentStep)) {
      set({ currentStep: currentStep + 1, error: null });
      // Fire and forget save - don't block navigation
      saveProgress().catch((err) => {
        console.error('Failed to save onboarding progress:', err);
      });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 1) {
      set({ currentStep: currentStep - 1, error: null });
    }
  },

  goToStep: (step: number) => {
    set({ currentStep: step, error: null });
  },

  // Data updates
  setName: (name: string) => {
    set((state) => ({
      data: { ...state.data, name },
      error: null,
    }));
  },

  setBirthDate: (date: Date) => {
    set((state) => ({
      data: { ...state.data, birthDate: date },
      error: null,
    }));
  },

  setBirthTime: (time: string, confidence: TimeConfidence) => {
    const needsRectification = confidence === 'unknown';
    set((state) => ({
      data: {
        ...state.data,
        birthTime: time,
        timeConfidence: confidence,
        needsRectification,
      },
      error: null,
    }));
  },

  setLocation: (location) => {
    set((state) => ({
      data: { ...state.data, ...location },
      error: null,
    }));
  },

  setInterests: (interests: string[]) => {
    set((state) => ({
      data: { ...state.data, interests },
      error: null,
    }));
  },

  setRectificationSession: (sessionId: string) => {
    set((state) => ({
      data: { ...state.data, rectificationSessionId: sessionId },
    }));
  },

  // Incremental save to backend
  saveProgress: async () => {
    const { _saveCallback, data, currentStep, isSaving, lastSavedStep } = get();

    // Skip if no callback, already saving, or already saved this step
    if (!_saveCallback || isSaving || currentStep <= lastSavedStep) {
      return;
    }

    set({ isSaving: true });

    try {
      await _saveCallback(data, currentStep);
      set({ lastSavedStep: currentStep, isSaving: false });
    } catch (error) {
      console.error('Onboarding save failed:', error);
      set({ isSaving: false });
      // Don't throw - save failures shouldn't block onboarding
    }
  },

  // Load saved progress for resume functionality
  loadProgress: (savedData: Partial<OnboardingData>, step: number) => {
    set((state) => ({
      data: { ...state.data, ...savedData },
      currentStep: step,
      lastSavedStep: step - 1, // Mark previous steps as saved
    }));
  },

  // Utils
  reset: () => {
    set({
      currentStep: 1,
      data: initialData,
      isLoading: false,
      error: null,
      isSaving: false,
      lastSavedStep: 0,
    });
  },

  setError: (error: string | null) => set({ error }),

  setLoading: (loading: boolean) => set({ isLoading: loading }),

  isStepValid: (step: number) => {
    const { data } = get();

    switch (step) {
      case 1:
        return data.name.trim().length >= 1;
      case 2:
        return data.birthDate !== null;
      case 3:
        // Time is valid if provided, or if user selected "unknown"
        return data.timeConfidence === 'unknown' || data.birthTime.length >= 4;
      case 4:
        return data.city.trim().length >= 1;
      case 5:
        return true; // Preferences are optional
      default:
        return false;
    }
  },

  getFormattedBirthData: () => {
    const { data } = get();

    if (!data.birthDate || !data.latitude || !data.longitude) {
      return null;
    }

    // Format date as YYYY-MM-DD in local timezone
    const date = formatLocalDate(data.birthDate);

    // Use default time if unknown
    const time = data.birthTime || '12:00';

    // Build location_name from city, state, country
    const locationParts = [data.city, data.state, data.country].filter(Boolean);
    const location_name = locationParts.length > 0 ? locationParts.join(', ') : undefined;

    return {
      name: data.name,
      date,
      time,
      latitude: data.latitude,
      longitude: data.longitude,
      location_name,
      timezone: data.timezone,
      is_primary: true, // First chart during onboarding is the primary chart
    };
  },
});

/**
 * Onboarding store (in-memory only, no persistence)
 *
 * Spec 036 (Cache Consolidation): Removed persistence.
 * Onboarding status is fetched from API endpoint.
 */
export const useOnboardingStore = create<OnboardingStore>()(onboardingStoreCreator);
