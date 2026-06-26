/**
 * Test runtime setup. `fake-indexeddb/auto` installs an in-memory IndexedDB
 * polyfill on `globalThis`, so the vector store exercises its real persist →
 * reload path (via `idb-keyval`) under Node instead of silently degrading to
 * memory-only. Imported once per test file by vitest's `setupFiles`.
 */
import "fake-indexeddb/auto";
