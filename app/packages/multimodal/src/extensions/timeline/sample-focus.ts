import { useMemo, useSyncExternalStore } from "react";

/**
 * The time each sample should open and scrub to, as published by an edition.
 * Grid tiles poster there and the modal seeks there on open. Inert until
 * something publishes: every sample then opens at its start.
 *
 * A store rather than a context: grid tiles render in their own React roots,
 * and every root must read the same focus.
 */

/** Where one sample is focused, in microseconds from its start. */
export interface SampleFocus {
  readonly startUs: number;
  /** The stream to show there, for samples that have several. */
  readonly stream?: string;
}

/** A sample's focus as the timeline and looker read it. */
export interface ResolvedSampleFocus {
  readonly startNs: bigint;
  readonly stream?: string;
}

type SampleFocusByID = Readonly<Record<string, SampleFocus>>;

interface SampleFocusStore {
  snapshot: SampleFocusByID | null;
  readonly listeners: Set<() => void>;
}

// Shared through a global symbol so that every bundle copy of this module
// reads the same store
const STORE_KEY = Symbol.for("@fiftyone/multimodal:sample-focus-store");
const globalStore = globalThis as Record<PropertyKey, unknown>;
const store = (globalStore[STORE_KEY] ??= {
  snapshot: null,
  listeners: new Set(),
} satisfies SampleFocusStore) as SampleFocusStore;

/** Replaces every sample's focus, keyed by sample id. `null` clears it. */
export function publishSampleFocus(next: SampleFocusByID | null): void {
  store.snapshot = next;
  for (const listener of store.listeners) listener();
}

const subscribe = (listener: () => void): (() => void) => {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
};
const getSnapshot = () => store.snapshot;

/** What identifies the sample: a sample renderer's context, or the smaller
 * context a video tile's lanes are given. */
type SampleContext = { readonly sample?: { readonly sample?: unknown } };

const NANOS_PER_MICRO = 1000n;

/** The published focus of the context's sample, or null when it has none. */
export function useSampleFocus(ctx: SampleContext): ResolvedSampleFocus | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const sample = ctx.sample?.sample as
    | { _id?: string; id?: string }
    | undefined;
  const sampleId = sample?._id ?? sample?.id;
  const focus = sampleId ? snapshot?.[sampleId] : undefined;

  return useMemo(() => {
    if (!focus || !Number.isFinite(focus.startUs)) return null;
    const startNs = BigInt(Math.round(focus.startUs)) * NANOS_PER_MICRO;
    return focus.stream === undefined
      ? { startNs }
      : { startNs, stream: focus.stream };
  }, [focus]);
}
