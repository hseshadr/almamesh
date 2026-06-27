/**
 * Zustand Stores - UI State Management (in-memory only)
 *
 * Architecture:
 * - Zustand handles UI-specific state (not server data)
 * - React Query handles server state (API responses, caching)
 * - All stores are in-memory only (no localStorage persistence)
 *
 * Spec 036 (Cache Consolidation): Removed all persist middleware.
 * UI state doesn't need to survive page refresh.
 *
 * Stores:
 * - useOnboardingStore: Onboarding flow state
 * - useChartUIStore: Chart display preferences and UI state
 * - useChartLibraryStore: On-device chart library (IndexedDB-backed)
 * - useChatStore: Per-profile chat history (threads + messages, IndexedDB-backed)
 * - useContentModeStore: "For You" vs "For Astrologer" toggle
 * - useLanguageStore: UI + AI language preference (localStorage-persisted)
 * - useSettingsStore: Pending settings changes
 *
 * @packageDocumentation
 */

export * from './onboarding';
export * from './chart';
export * from './chartLibrary';
export * from './lifeEvents';
export * from './chat';
export * from './profiles';
export * from './adapters/chart';
export * from './adapters/chartGeometry';
export * from './adapters/energy';
export * from './adapters/mesh';
export * from './adapters/predictive';
export * from './adapters/rectification';
export * from './predictive';
export * from './mesh';
export * from './rectification';
export * from './contentMode';
export * from './language';
export * from './interpretation';
export * from './settings';
export * from './events';
export * from './regenerate';
