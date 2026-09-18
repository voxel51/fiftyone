/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

export type LoadableState = "hasValue" | "loading" | "hasError";

export interface Loadable<T> {
  readonly state: LoadableState;
  /** The value, or the pending promise while loading. Read directly by callers. */
  readonly contents: unknown;
  getValue(): T;
  valueMaybe(): T | undefined;
  valueOrThrow(): T;
  toPromise(): Promise<T>;
}

interface Settled {
  ok: boolean;
  value?: unknown;
  error?: unknown;
}

const settled = new WeakMap<Promise<unknown>, Settled>();

/** Records a promise's outcome so a later read reports it without awaiting. */
const watch = (promise: Promise<unknown>) => {
  if (!settled.has(promise)) {
    promise.then(
      (value) => settled.set(promise, { ok: true, value }),
      (error) => settled.set(promise, { ok: false, error }),
    );
  }

  return settled.get(promise);
};

const value = <T>(contents: T): Loadable<T> => ({
  state: "hasValue",
  contents,
  getValue: () => contents,
  valueMaybe: () => contents,
  valueOrThrow: () => contents,
  toPromise: () => Promise.resolve(contents),
});

const error = <T>(thrown: unknown): Loadable<T> => ({
  state: "hasError",
  contents: thrown,
  getValue: () => {
    throw thrown;
  },
  valueMaybe: () => undefined,
  valueOrThrow: () => {
    throw thrown;
  },
  toPromise: () => Promise.reject(thrown),
});

const loading = <T>(promise: Promise<T>): Loadable<T> => ({
  state: "loading",
  contents: promise,
  getValue: () => {
    throw promise;
  },
  valueMaybe: () => undefined,
  valueOrThrow: () => {
    throw promise;
  },
  toPromise: () => promise,
});

export function loadable<T>(raw: T | Promise<T>): Loadable<T> {
  if (!(raw instanceof Promise)) {
    return value(raw);
  }

  const outcome = watch(raw);
  if (!outcome) {
    return loading(raw);
  }

  return outcome.ok ? value(outcome.value as T) : error<T>(outcome.error);
}

/**
 * A read that throws is an error loadable, not an escaping throw — a caller
 * asking for a loadable is asking not to be thrown at. A thrown promise is a
 * suspend rather than a failure, so it stays loading.
 */
export function loadableFrom<T>(read: () => T | Promise<T>): Loadable<T> {
  try {
    return loadable(read());
  } catch (thrown) {
    if (thrown instanceof Promise) {
      return loadable(thrown as Promise<T>);
    }

    return error<T>(thrown);
  }
}

const cache = new WeakMap<
  object,
  { raw: unknown; result: Loadable<unknown> }
>();

/**
 * Loadables are compared by reference in effect dependencies, so an unchanged
 * value must hand back the same object.
 */
export function stableLoadable<T>(
  owner: object,
  raw: T | Promise<T>,
): Loadable<T> {
  const previous = cache.get(owner);
  /**
   * A promise keeps its identity when it settles, so a cached loading result
   * would mask the value. Recompute those and cache only settled ones.
   */
  if (previous && previous.raw === raw && previous.result.state !== "loading") {
    return previous.result as Loadable<T>;
  }

  const result = loadable(raw);
  cache.set(owner, { raw, result });

  return result;
}
