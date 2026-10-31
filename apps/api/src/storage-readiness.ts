export function cachedStorageProbe(
  probe: () => Promise<unknown>,
  intervalMs: number,
  clock: () => number = Date.now,
): () => Promise<unknown> {
  if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 900_000) {
    throw new Error('Storage health interval must be between 1000 and 900000 milliseconds');
  }
  let pending: Promise<unknown> | undefined;
  let expiresAt = 0;
  return () => {
    if (!pending || clock() >= expiresAt) {
      // Share an in-flight request; a slow provider must not cause a probe burst.
      expiresAt = Number.POSITIVE_INFINITY;
      pending = Promise.resolve()
        .then(probe)
        .then(
          (result) => {
            expiresAt = clock() + intervalMs;
            return result;
          },
          (error: unknown) => {
            // Fail closed, but allow recovery sooner than the healthy-result TTL.
            expiresAt = clock() + Math.min(intervalMs, 60_000);
            throw error;
          },
        );
    }
    return pending;
  };
}
