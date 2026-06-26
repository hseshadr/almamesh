/**
 * Web settings store (in-memory only, no persistence)
 *
 * Spec 036 (Cache Consolidation): Removed localStorage persistence.
 * Settings are fetched from API endpoint.
 */

export { useSettingsStore } from '@almamesh/store';
