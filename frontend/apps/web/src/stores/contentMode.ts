/**
 * Web content mode store (in-memory only, no persistence)
 *
 * Spec 036 (Cache Consolidation): Removed localStorage persistence.
 * Default to "For You" (layman), user toggles per session.
 */

export { useContentModeStore } from '@almamesh/store';
