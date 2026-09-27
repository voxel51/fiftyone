import { useMemo, useSyncExternalStore } from "react";

/**
 * The published embedding-window selection, as OSS-synced renderers consume
 * it: a plain external store an edition FEEDS (see the registered publisher
 * in the enterprise entrypoint) and the grid/modal renderers read through
 * `useSyncExternalStore`.
 *
 * A store rather than a registered hook on purpose: the consumers
 * (GridRenderer, McapModalRenderer) call these as hooks unconditionally, and
 * a hook that only exists after registration cannot be called under the rules
 * of hooks. The store is inert until something publishes — the hooks answer
 * "no selection" — and it crosses the grid tiles' separate React roots for
 * free, which a context or bridged Recoil atom does not.
 */

/** One selected window mark: a span in the microseconds a run keys windows
 * in, tagged with its stream. Exact in a double, unlike nanoseconds. A point
 * embedding has startUs === endUs. */
export interface EmbeddingWindowMark {
  stream: string;
  startUs: number;
  endUs: number;
  /** The embedding space this mark was resolved in. Every model embeds the
   * same windows, so the same (stream, time) exists once per model; the tag is
   * what keeps a mark from resolving to a space it never came from. Absent
   * only for a run that records no per-point model. */
  model?: string;
}

/** The whole published selection, grouped by episode (sample id). */
export interface EmbeddingSelection {
  byEpisode: Record<string, EmbeddingWindowMark[]>;
}

interface EmbeddingSelectionStore {
  snapshot: EmbeddingSelection | null;
  readonly listeners: Set<() => void>;
}

// Module-global via a shared symbol, like the timeline-extension registry:
// grid tiles render in their own React roots, and every root must read the
// same selection
const STORE_KEY = Symbol.for(
  "@fiftyone/multimodal:mcap-embedding-selection-store",
);
const globalStore = globalThis as Record<PropertyKey, unknown>;
const store = (globalStore[STORE_KEY] ??= {
  snapshot: null,
  listeners: new Set(),
} satisfies EmbeddingSelectionStore) as EmbeddingSelectionStore;

/** Publishes the current selection (null clears it). Called by whatever owns
 * the selection state — an edition's embeddings panel — every time it
 * changes; nothing here decides WHEN. */
export function publishEmbeddingSelection(
  next: EmbeddingSelection | null,
): void {
  store.snapshot = next;
  for (const listener of store.listeners) listener();
}

const subscribe = (listener: () => void): (() => void) => {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
};
const getSnapshot = () => store.snapshot;

/** The published selection, or null before anything published. */
export function useEmbeddingSelectionSnapshot(): EmbeddingSelection | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * One selected embedding window in the current episode: the time span an
 * embedding vector covers, tagged with its stream. A point embedding has
 * `startNs === endNs` (rendered as a marker); a window embedding spans
 * `[startNs, endNs)` (rendered as an interval bar). Nanoseconds here only:
 * the timeline is drawn against them, and marks cross over here.
 */
export interface EmbeddingWindow {
  readonly labelId: string;
  readonly stream: string;
  readonly startNs: bigint;
  readonly endNs: bigint;
}

const NO_WINDOWS: readonly EmbeddingWindow[] = [];

/** What identifies the episode a tile draws: a sample renderer's context,
 * or the smaller context a video tile's lanes are given. */
type EpisodeContext = { readonly sample?: { readonly sample?: unknown } };

const NANOS_PER_MICRO = 1000n;

function microsToNanos(micros: number): bigint {
  return BigInt(Math.round(micros)) * NANOS_PER_MICRO;
}

/**
 * The current episode's selected embedding windows for the overlays —
 * label-free, keyed strictly by ``(episode, stream, time)``. No per-tile
 * network request: the publisher already holds every point's keys client-side
 * and groups the selection by episode, so a tile draws exactly the windows
 * selected for its episode.
 */
export function useSampleRendererEmbeddingWindows(
  ctx: EpisodeContext,
): readonly EmbeddingWindow[] {
  const selection = useEmbeddingSelectionSnapshot();

  const sample = ctx.sample?.sample as
    | { _id?: string; id?: string }
    | undefined;
  const episodeId = sample?._id ?? sample?.id ?? null;

  return useMemo(() => {
    if (!selection || !episodeId) return NO_WINDOWS;
    const marks = selection.byEpisode[episodeId];
    if (!marks || marks.length === 0) return NO_WINDOWS;
    const windows: EmbeddingWindow[] = [];
    marks.forEach((m, i) => {
      if (!Number.isFinite(m.startUs) || !Number.isFinite(m.endUs)) return;
      windows.push({
        // Synthetic, stable per (episode, stream, time) — a namespace for the
        // read-only track id, NOT a fiftyone label id (none exist here).
        labelId: `${episodeId}:${m.stream}:${m.startUs}:${i}`,
        stream: m.stream,
        startNs: microsToNanos(m.startUs),
        endNs: microsToNanos(m.endUs),
      });
    });
    return windows.length === 0 ? NO_WINDOWS : windows;
  }, [selection, episodeId]);
}

/**
 * The earliest matched window by capture time. Selections group in point
 * order, not time order, so "the first match" is a min-reduce rather than
 * ``windows[0]``.
 */
export function firstMatchWindow(
  windows: readonly EmbeddingWindow[],
): EmbeddingWindow | null {
  let earliest: EmbeddingWindow | null = null;
  for (const window of windows) {
    if (earliest === null || window.startNs < earliest.startNs) {
      earliest = window;
    }
  }
  return earliest;
}

/**
 * The current episode's earliest matched window, or null when the selection
 * did not hit it. Drives both match-first affordances: the grid tile posters
 * at this window instead of the recording start, and opening the tile lands
 * the modal playhead on the same instant.
 */
export function useSampleRendererFirstMatch(
  ctx: EpisodeContext,
): EmbeddingWindow | null {
  const windows = useSampleRendererEmbeddingWindows(ctx);
  return useMemo(() => firstMatchWindow(windows), [windows]);
}
