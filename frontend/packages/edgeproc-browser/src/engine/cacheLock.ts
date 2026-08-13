const CACHE_LOCK = "edgeproc-browser-sync";

export interface CacheLockManager {
	request<T>(name: string, operation: () => Promise<T>): Promise<T>;
}

export function runWithCacheLock<T>(
	locks: CacheLockManager | undefined,
	operation: () => Promise<T>,
): Promise<T> {
	return locks ? locks.request(CACHE_LOCK, operation) : operation();
}
