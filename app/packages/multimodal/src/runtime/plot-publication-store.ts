/** Defers one publication batch and returns a way to cancel that batch. */
export type PlotPublicationFrameScheduler = (publish: () => void) => () => void;

/** Source-bound writer that becomes inert when cancelled or superseded. */
export interface PlotPublicationSourceEpoch<Key, Value> {
  cancel(): void;
  delete(key: Key): void;
  set(key: Key, value: Value): void;
}

/**
 * Per-key plot state with frame-coalesced writes and source-epoch isolation.
 *
 * `getSnapshot()` returns committed state. Writes become visible together on
 * the next scheduled frame, but only listeners for keys whose values changed
 * are called. `reset()` is immediate: source changes must clear old values and
 * invalidate queued publications before another render can observe them.
 */
export interface PlotPublicationStore<Key, Value> {
  /** Clears prior source state and returns a writer for the new source epoch. */
  beginSourceEpoch(): PlotPublicationSourceEpoch<Key, Value>;
  delete(key: Key): void;
  getSnapshot(key: Key): Value | undefined;
  reset(): void;
  set(key: Key, value: Value): void;
  subscribe(key: Key, listener: () => void): () => void;
}

type PendingPublication<Value> =
  | { readonly kind: "delete" }
  | { readonly kind: "set"; readonly value: Value };

interface ScheduledPublication {
  readonly cancel: () => void;
  readonly id: number;
}

/** Creates a plot-specific keyed publication store. */
export function createPlotPublicationStore<Key, Value>({
  scheduleFrame,
}: {
  readonly scheduleFrame: PlotPublicationFrameScheduler;
}): PlotPublicationStore<Key, Value> {
  const listenersByKey = new Map<Key, Set<() => void>>();
  const valuesByKey = new Map<Key, Value>();
  let pendingByKey = new Map<Key, PendingPublication<Value>>();
  let generation = 0;
  let nextScheduleId = 0;
  let scheduled: ScheduledPublication | undefined;

  const notify = (key: Key) => {
    const listeners = listenersByKey.get(key);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const cancelScheduled = () => {
    const active = scheduled;
    scheduled = undefined;
    active?.cancel();
  };

  const invalidatePending = () => {
    generation += 1;
    cancelScheduled();
    pendingByKey.clear();
  };

  const flush = (scheduledGeneration: number, scheduleId: number) => {
    if (generation !== scheduledGeneration || scheduled?.id !== scheduleId) {
      return;
    }
    scheduled = undefined;

    const pending = pendingByKey;
    pendingByKey = new Map();
    const changedKeys: Key[] = [];
    for (const [key, publication] of pending) {
      if (publication.kind === "delete") {
        if (valuesByKey.delete(key)) changedKeys.push(key);
        continue;
      }
      if (
        valuesByKey.has(key) &&
        Object.is(valuesByKey.get(key), publication.value)
      ) {
        continue;
      }
      valuesByKey.set(key, publication.value);
      changedKeys.push(key);
    }

    for (const key of changedKeys) {
      if (generation !== scheduledGeneration) return;
      notify(key);
    }
  };

  const ensureFrame = () => {
    if (scheduled) return;
    const scheduledGeneration = generation;
    const scheduleId = ++nextScheduleId;
    const cancel = scheduleFrame(() => flush(scheduledGeneration, scheduleId));
    scheduled = { cancel, id: scheduleId };
  };

  const set = (key: Key, value: Value) => {
    pendingByKey.set(key, { kind: "set", value });
    ensureFrame();
  };

  const deleteValue = (key: Key) => {
    pendingByKey.set(key, { kind: "delete" });
    ensureFrame();
  };

  const reset = () => {
    invalidatePending();
    const changedKeys = [...valuesByKey.keys()];
    valuesByKey.clear();
    for (const key of changedKeys) notify(key);
  };

  return {
    beginSourceEpoch() {
      reset();
      const epochGeneration = generation;
      let cancelled = false;
      const isActive = () => !cancelled && generation === epochGeneration;
      return {
        cancel() {
          if (!isActive()) {
            cancelled = true;
            return;
          }
          cancelled = true;
          invalidatePending();
        },
        delete(key) {
          if (isActive()) deleteValue(key);
        },
        set(key, value) {
          if (isActive()) set(key, value);
        },
      };
    },
    delete: deleteValue,
    getSnapshot: (key) => valuesByKey.get(key),
    reset,
    set,
    subscribe(key, listener) {
      let listeners = listenersByKey.get(key);
      if (!listeners) {
        listeners = new Set();
        listenersByKey.set(key, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) listenersByKey.delete(key);
      };
    },
  };
}
