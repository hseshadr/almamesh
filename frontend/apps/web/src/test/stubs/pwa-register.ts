// Test stub for `virtual:pwa-register`.
//
// That module is synthesised by vite-plugin-pwa during a production build, so
// Vite's import analysis cannot resolve it under vitest and any file importing
// it fails to load. Aliased in vitest.config.ts. Before this existed, tests
// worked around it by mocking away whole components that pull the PWA hooks —
// which is how the update banner ended up with no unit coverage at all.
//
// It registers nothing and never reports an update, so a test that wants the
// `needRefresh` signal should drive it explicitly rather than rely on this.

export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => undefined;
}
