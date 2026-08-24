interface HydrationApi {
  hasHydrated(): boolean;
  onFinishHydration(callback: () => void): () => void;
}

/** Wait without missing hydration that finishes between the check and subscription. */
export function whenHydrated(api: HydrationApi | undefined): Promise<void> {
  if (api === undefined || api.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = () => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve();
    };
    unsubscribe = api.onFinishHydration(finish);
    if (api.hasHydrated()) finish();
  });
}
