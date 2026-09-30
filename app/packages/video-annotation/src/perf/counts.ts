/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Operation counters for the Annotate counts suites. Each counter wraps the
 * real method and forwards to it; nothing here changes behavior. Counts are
 * attributed to the event running when the operation happened.
 */

import { AnnotationEngine, FrameStore } from "@fiftyone/annotation";

export interface Counts {
  /** Window requests dispatched. */
  fetch: number;
  /** Frames parsed into the frame store (seed input). */
  parse: number;
  /** Frames deep-compared by the frame store. */
  compare: number;
  /** Frames read through the engine by the track rebuild. */
  read: number;
  /** Timeline tracks built. */
  build: number;
  /** Timeline tracks serialized for equality. */
  serialize: number;
  /** Label refs enumerated from the frame store (whole pool or one frame). */
  enumerate: number;
  /** Labels returned by whole-clip (frame-less) engine listings. */
  list: number;
  /** Labels serialized for equality. */
  stringify: number;
}

export const zero = (): Counts => ({
  fetch: 0,
  parse: 0,
  compare: 0,
  read: 0,
  build: 0,
  serialize: 0,
  enumerate: 0,
  list: 0,
  stringify: 0,
});

const isTrack = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  "events" in value &&
  "id" in value;

const isLabel = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (value as { _cls?: unknown })._cls === "Detection";

/**
 * Install the counters. `build` is counted by the color resolver the harness
 * passes to the track hook, which the builder calls once per track.
 */
export const installCounters = () => {
  let current = zero();

  const frameStore = FrameStore.prototype as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  const engine = AnnotationEngine.prototype as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  const restores: Array<() => void> = [];

  // Plain patches, not `vi.spyOn`: a spy retains every argument and result,
  // which at whole-clip sizes is the heap.
  const patch = (
    target: Record<string, (...args: unknown[]) => unknown>,
    name: string,
    count: (args: unknown[], result: unknown) => void,
  ) => {
    const original = target[name];

    if (!original) {
      return;
    }

    target[name] = function (this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args);
      count(args, result);
      return result;
    };
    restores.push(() => {
      target[name] = original;
    });
  };

  const countParsed = (args: unknown[]) => {
    current.parse += Object.keys(args[0] as object).length;
  };
  patch(frameStore, "setData", countParsed);
  patch(frameStore, "mergeData", countParsed);
  patch(frameStore, "frameEquals", () => {
    current.compare++;
  });
  const countRefs = (_args: unknown[], refs: unknown) => {
    current.enumerate += (refs as unknown[]).length;
  };
  patch(frameStore, "enumerateLabels", countRefs);
  patch(frameStore, "enumerateLabelsAt", countRefs);
  patch(engine, "listLabels", (args, labels) => {
    if ((args[0] as { frame?: number }).frame != null) {
      current.read++;
    } else {
      current.list += (labels as unknown[]).length;
    }
  });

  const stringify = JSON.stringify;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    if (isTrack(args[0])) {
      current.serialize++;
    } else if (isLabel(args[0])) {
      current.stringify++;
    }
    return stringify(...args);
  }) as typeof JSON.stringify;
  restores.push(() => {
    JSON.stringify = stringify;
  });

  return {
    get current() {
      return current;
    },
    /** Called by the harness's color resolver: one per track built. */
    built() {
      current.build++;
    },
    fetched(n = 1) {
      current.fetch += n;
    },
    /** Run one event and return the operations it caused. */
    async event(run: () => void | Promise<void>): Promise<Counts> {
      current = zero();
      await run();
      return current;
    },
    restore() {
      restores.forEach((restore) => restore());
    },
  };
};

export type Counters = ReturnType<typeof installCounters>;
