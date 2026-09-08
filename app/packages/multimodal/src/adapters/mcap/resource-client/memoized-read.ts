export interface MemoizedReadCache<Value> {
  delete(key: string): boolean;
  get(key: string): Promise<Value> | undefined;
  set(key: string, value: Promise<Value>): unknown;
}

/** Memoizes one async read and evicts only the same rejected promise. */
export function memoizedRead<Value>(
  cache: MemoizedReadCache<Value>,
  key: string,
  load: () => Promise<Value>,
): Promise<Value> {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const read = load().catch((error) => {
    if (cache.get(key) === read) {
      cache.delete(key);
    }
    throw error;
  });
  cache.set(key, read);
  return read;
}
