/**
 * Web onboarding store (in-memory only, no persistence)
 *
 * Spec 036 (Cache Consolidation): Removed localStorage persistence.
 * Onboarding status is fetched from API endpoint.
 */

export { useOnboardingStore } from '@almamesh/store';
