// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests.
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  startDemandBridge,
  useDemandRegistry,
  useEpisodeDataStream,
  type TimelineIndex,
} from "../../runtime";
import type { NumericStreamFields } from "../../ir";
import type { NumericSeriesCapability } from "../../ports";
import { shouldDeferEpisodeIdleWorkForStore } from "./episode-network-health";
import {
  addCoveredRange,
  flattenSeriesSegments,
  insertSeriesSegment,
  removeCoveredRange,
  subtractCoveredRanges,
  type NsRange,
  type NumericSeriesSegment,
} from "./numeric-series-window";

/**
 * Fetch horizon centered on the playhead. Playback's 4s lookahead keeps
 * the next frames ready; a plot needs enough trace around the playhead
 * to *read* a signal, so it gets its own wider bound. Chunks fetched
 * here are the same chunks playback needs for this region (shared byte
 * cache), so the marginal cost over playback is roughly this window
 * minus the lookahead, once per region.
 */
export const EPISODE_PLOT_WINDOW_SECONDS = 60;
const WINDOW_HALF_NS = BigInt(EPISODE_PLOT_WINDOW_SECONDS / 2) * 1_000_000_000n;

/**
 * Windows are quantized to this grid so a moving playhead produces one
 * bounded fetch per quantum crossed instead of a sliver-sized request
 * every throttle tick, and so ranges align across signals enabled at
 * different times.
 */
const WINDOW_QUANTUM_NS = 15_000_000_000n;

/** Playhead-driven fills run at most this often; fetch latency dominates. */
const PLAYHEAD_FILL_THROTTLE_MS = 500;

/** Coalesces a short burst of plot-field toggles into one stream scan. */
const FIELD_SELECTION_DEBOUNCE_MS = 250;

/** Starved-link stand-down retry, matching the pose-trajectory gate. */
const DEFERRED_RETRY_MS = 2_000;

/** The timeline index lands moments after stream registration; wait for
 * it instead of falling back to an unbounded scan. */
const TIMELINE_RETRY_MS = 250;

/** Playhead-driven retries of a failed range back off this long; a user
 * re-toggle retries immediately. */
const FAILURE_BACKOFF_MS = 5_000;

/**
 * Full-recording point budget; windowed requests get a proportional
 * slice so accumulated coverage stays near one chart's pixel density.
 * (Value mirrors DEFAULT_NUMERIC_SERIES_MAX_POINTS without importing
 * the worker-side extraction module into the main bundle.)
 */
const FULL_RANGE_POINT_BUDGET = 4_000;
const MIN_WINDOW_POINT_BUDGET = 200;

/**
 * Speculative memory is estimated as two packed Float64 values per point
 * (time and value). Reserve against the full-range point cap so accumulated
 * windows cannot silently outgrow the source-level budget.
 */
const ESTIMATED_SERIES_BYTES_PER_FIELD =
  FULL_RANGE_POINT_BUDGET * Float64Array.BYTES_PER_ELEMENT * 2;
const STREAM_PREFETCH_BUDGET_BYTES = 2 * 1024 * 1024;
const SOURCE_PREFETCH_BUDGET_BYTES = 8 * 1024 * 1024;

/** Coverage sentinel for unbounded (windowless fallback) fetches. */
const FULL_COVERAGE: NsRange = { endNs: 1n << 62n, startNs: 0n };

/**
 * Plottable-field catalog state for the current source. `idle` until a
 * plot tile first asks for it — zero-plot sessions never pay for
 * enumeration.
 */
export interface EpisodeNumericFieldsEnumeration {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly streams: readonly NumericStreamFields[];
}

/**
 * One signal's accumulated samples. Times are seconds relative to the
 * recording start; NaN values mark gaps (missing fields, undecodable
 * messages, and the boundaries between non-adjacent fetched windows).
 * Arrays grow as more of the recording is covered; covered ranges are
 * never refetched.
 */
export interface EpisodeNumericSeriesState {
  readonly status: "loading" | "ready" | "error";
  readonly timesSec?: Float64Array;
  readonly values?: Float64Array;
  readonly truncated?: boolean;
  readonly error?: string;
}

/**
 * Cache key for one series: stream and field path, NUL-separated.
 */
export function episodeNumericSeriesKey(
  stream: string,
  fieldPath: string,
): string {
  return `${stream}\0${fieldPath}`;
}

function splitSeriesKey(key: string): [stream: string, fieldPath: string] {
  const separator = key.indexOf("\0");
  return [key.slice(0, separator), key.slice(separator + 1)];
}

/**
 * Public numeric-series cache and demand API consumed by plot tiles.
 */
export interface EpisodeNumericSeriesContextValue {
  readonly enumeration: EpisodeNumericFieldsEnumeration;
  readonly seriesByKey: ReadonlyMap<string, EpisodeNumericSeriesState>;

  /**
   * Idempotently kicks the plottable-field enumeration for the current
   * source.
   */
  ensureEnumeration(): void;

  /**
   * Declares interest in one signal while the returned unsubscribe is
   * outstanding. Interested signals are fetched in playhead-anchored
   * windows and cached as segments; dropping interest keeps the cache.
   */
  subscribeSeries(stream: string, fieldPath: string): () => void;
}

interface EpisodeNumericSeriesHandlers {
  ensureEnumeration(): void;
  onDemandChanged(): void;
}

interface EpisodeNumericSeriesInternalValue extends EpisodeNumericSeriesContextValue {
  readonly enumerationWantedRef: React.MutableRefObject<boolean>;
  readonly handlersRef: React.MutableRefObject<EpisodeNumericSeriesHandlers | null>;
  readonly refCountsRef: React.MutableRefObject<Map<string, number>>;
  readonly setEnumeration: (state: EpisodeNumericFieldsEnumeration) => void;
  readonly setSeriesByKey: (
    state: ReadonlyMap<string, EpisodeNumericSeriesState>,
  ) => void;
}

const IDLE_ENUMERATION: EpisodeNumericFieldsEnumeration = {
  status: "idle",
  streams: [],
};
const EMPTY_SERIES: ReadonlyMap<string, EpisodeNumericSeriesState> = new Map();

const EpisodeNumericSeriesContext =
  createContext<EpisodeNumericSeriesInternalValue | null>(null);

/**
 * Shares numeric-series data with plot tiles. The provider lives outside
 * the playback shell and holds state plus the interest registry;
 * `EpisodeNumericSeriesBridge` inside the shell owns the client/source and
 * services demand, so each signal is fetched once per covered range
 * regardless of how many plot tiles show it.
 */
export const EpisodeNumericSeriesProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [enumeration, setEnumeration] =
    useState<EpisodeNumericFieldsEnumeration>(IDLE_ENUMERATION);
  const [seriesByKey, setSeriesByKey] =
    useState<ReadonlyMap<string, EpisodeNumericSeriesState>>(EMPTY_SERIES);
  const { handlersRef, refCountsRef, subscribeKey } =
    useDemandRegistry<EpisodeNumericSeriesHandlers>();
  const enumerationWantedRef = useRef(false);

  const ensureEnumeration = useCallback(() => {
    enumerationWantedRef.current = true;
    handlersRef.current?.ensureEnumeration();
  }, [handlersRef]);

  const subscribeSeries = useCallback(
    (stream: string, fieldPath: string) => {
      const key = episodeNumericSeriesKey(stream, fieldPath);
      return subscribeKey(key);
    },
    [subscribeKey],
  );

  const value = useMemo<EpisodeNumericSeriesInternalValue>(
    () => ({
      ensureEnumeration,
      enumeration,
      enumerationWantedRef,
      handlersRef,
      refCountsRef,
      seriesByKey,
      setEnumeration,
      setSeriesByKey,
      subscribeSeries,
    }),
    [
      ensureEnumeration,
      enumeration,
      handlersRef,
      refCountsRef,
      seriesByKey,
      subscribeSeries,
    ],
  );

  return (
    <EpisodeNumericSeriesContext.Provider value={value}>
      {children}
    </EpisodeNumericSeriesContext.Provider>
  );
};

/**
 * Reads the numeric-series cache and demand hooks for plot tiles.
 */
export function useEpisodeNumericSeriesContext(): EpisodeNumericSeriesContextValue {
  return useInternalValue();
}

/**
 * Bridge that services numeric-series demand against the shared resource
 * client, respecting the same bounded-reach principle as the rest of the
 * playback system: it fetches quantized windows centered on the playhead
 * (`EPISODE_PLOT_WINDOW_SECONDS`), tracks per-signal coverage so no range is
 * ever fetched or decoded twice, stitches fetched segments into growing
 * series, and stands down while the link is starved (same gate as pose
 * trajectories). All reads ride the bulk lane; the byte layer's shared
 * cache means these chunks are the same ones playback pulls for tiles in
 * this region. Without a playback store (standalone/tests) it falls back
 * to one unbounded fetch per signal.
 */
export function EpisodeNumericSeriesBridge({
  capability,
  sourceKey,
}: {
  readonly capability: NumericSeriesCapability | null;
  readonly sourceKey: string | null;
}) {
  const {
    enumerationWantedRef,
    handlersRef,
    refCountsRef,
    setEnumeration,
    setSeriesByKey,
  } = useInternalValue();
  // Nullable on purpose: callers inside the playback shell provide the
  // store (enabling windowing and the network-health gate); standalone
  // callers and tests get null and unbounded single fetches.
  const playbackStore = useContext(PlaybackStoreContext);
  const dataStream = useEpisodeDataStream();
  const dataStreamRef = useRef(dataStream);
  dataStreamRef.current = dataStream;

  // This effect owns one source epoch: coverage/segment caches, demand
  // handlers, and the playhead-following fill loop. It re-keys (full
  // reset) when the source changes; fetched signal data is cached for
  // the life of the source, never refetched, and dropped on unmount.
  useEffect(() => {
    setEnumeration(IDLE_ENUMERATION);
    setSeriesByKey(EMPTY_SERIES);
    if (!capability || !sourceKey) {
      return undefined;
    }

    let enumerationRequested = false;
    let numericFieldPathsByStream: ReadonlyMap<
      string,
      readonly string[]
    > | null = null;
    let speculativeBytesReserved = 0;
    const coverage = new Map<string, NsRange[]>();
    const segments = new Map<string, NumericSeriesSegment[]>();
    const published = new Map<string, EpisodeNumericSeriesState>();
    const truncatedKeys = new Set<string>();
    const failedAtMs = new Map<string, number>();
    const speculativelyReservedKeys = new Set<string>();

    const publish = (isCancelled: () => boolean) => {
      if (!isCancelled()) {
        setSeriesByKey(new Map(published));
      }
    };

    return startDemandBridge<
      EpisodeNumericSeriesHandlers,
      NonNullable<typeof dataStream>
    >({
      dataStreamRef,
      demandDebounceMs: FIELD_SELECTION_DEBOUNCE_MS,
      deferredRetryMs: DEFERRED_RETRY_MS,
      handlersRef,
      makeHandlers: ({ isCancelled, queueFill }) => ({
        ensureEnumeration() {
          if (isCancelled() || enumerationRequested) {
            return;
          }
          enumerationRequested = true;
          setEnumeration({ status: "loading", streams: [] });
          void capability
            .enumerateNumericFields()
            .then((streams) => {
              if (!isCancelled()) {
                numericFieldPathsByStream = new Map(
                  streams
                    .filter((stream) => stream.availability === "ready")
                    .map((stream) => [
                      stream.streamId,
                      [...new Set(stream.fields.map((field) => field.path))],
                    ]),
                );
                setEnumeration({ status: "ready", streams });
              }
            })
            .catch(() => {
              if (!isCancelled()) {
                enumerationRequested = false;
                numericFieldPathsByStream = null;
                setEnumeration({ status: "error", streams: [] });
              }
            });
        },
        onDemandChanged: queueFill,
      }),
      onFill({
        demandKeys,
        isCancelled,
        nowMs,
        playheadSec,
        timeline,
        userInitiated,
      }) {
        const window =
          playbackStore && timeline
            ? quantizedPlayheadWindow(timeline, playheadSec)
            : null;

        const now = nowMs();
        const demandedKeys = new Set(demandKeys);
        const batches = new Map<
          string,
          { fieldPaths: Set<string>; range: NsRange | null; stream: string }
        >();
        let publishNeeded = false;
        for (const key of demandedKeys) {
          if (!userInitiated) {
            const failed = failedAtMs.get(key);
            if (failed !== undefined && now - failed < FAILURE_BACKOFF_MS) {
              continue;
            }
          }
          const [stream, fieldPath] = splitSeriesKey(key);
          let covered = coverage.get(key) ?? [];
          const missing: readonly (NsRange | null)[] =
            window === null
              ? covered.length > 0
                ? []
                : [null]
              : subtractCoveredRanges(window, covered);
          for (const range of missing) {
            // Optimistic coverage: marks the range in-flight so throttled
            // refills never duplicate a pending request; rolled back on
            // failure.
            covered = addCoveredRange(covered, range ?? FULL_COVERAGE);
            const batchKey =
              range === null
                ? `${stream}\0full`
                : `${stream}\0${range.startNs}:${range.endNs}`;
            let batch = batches.get(batchKey);
            if (!batch) {
              batch = { fieldPaths: new Set(), range, stream };
              batches.set(batchKey, batch);
            }
            batch.fieldPaths.add(fieldPath);
          }
          coverage.set(key, covered);
          if (missing.length > 0 && !published.has(key)) {
            published.set(key, { status: "loading" });
            publishNeeded = true;
          }
        }

        for (const batch of batches.values()) {
          const streamFieldPaths = numericFieldPathsByStream?.get(batch.stream);
          if (
            !streamFieldPaths ||
            streamFieldPaths.length * ESTIMATED_SERIES_BYTES_PER_FIELD >
              STREAM_PREFETCH_BUDGET_BYTES
          ) {
            continue;
          }

          const range = batch.range ?? FULL_COVERAGE;
          const prefetchFieldPaths: string[] = [];
          let additionalBytes = 0;
          for (const fieldPath of streamFieldPaths) {
            const key = episodeNumericSeriesKey(batch.stream, fieldPath);
            if (
              demandedKeys.has(key) ||
              subtractCoveredRanges(range, coverage.get(key) ?? []).length === 0
            ) {
              continue;
            }
            prefetchFieldPaths.push(fieldPath);
            if (!speculativelyReservedKeys.has(key)) {
              additionalBytes += ESTIMATED_SERIES_BYTES_PER_FIELD;
            }
          }
          // Prefetch the whole eligible stream or none of it. A partial prefix
          // would make later checkbox order determine how many scans occur.
          if (
            speculativeBytesReserved + additionalBytes >
            SOURCE_PREFETCH_BUDGET_BYTES
          ) {
            continue;
          }

          for (const fieldPath of prefetchFieldPaths) {
            const key = episodeNumericSeriesKey(batch.stream, fieldPath);
            batch.fieldPaths.add(fieldPath);
            coverage.set(key, addCoveredRange(coverage.get(key) ?? [], range));
            if (!speculativelyReservedKeys.has(key)) {
              speculativelyReservedKeys.add(key);
              speculativeBytesReserved += ESTIMATED_SERIES_BYTES_PER_FIELD;
            }
            if (!published.has(key)) {
              published.set(key, { status: "loading" });
              publishNeeded = true;
            }
          }
        }

        if (publishNeeded) {
          publish(isCancelled);
        }

        for (const batch of batches.values()) {
          const fieldPaths = [...batch.fieldPaths];
          void capability
            .readNumericSeries({
              fields: fieldPaths,
              maxPointsPerField: windowPointBudget(
                batch.range,
                timeline?.durationSec,
              ),
              stream: batch.stream,
              window: batch.range ?? FULL_COVERAGE,
            })
            .then((result) => {
              if (isCancelled()) {
                return;
              }
              const range = batch.range ?? FULL_COVERAGE;
              for (const field of result.fields) {
                const key = episodeNumericSeriesKey(batch.stream, field.path);
                failedAtMs.delete(key);
                if (result.truncated) {
                  truncatedKeys.add(key);
                }
                let keySegments = segments.get(key) ?? [];
                if (field.timesSec.length > 0) {
                  keySegments = insertSeriesSegment(keySegments, {
                    endNs: range.endNs,
                    startNs: range.startNs,
                    timesSec: field.timesSec,
                    values: field.values,
                  });
                  segments.set(key, keySegments);
                }
                const flat = flattenSeriesSegments(keySegments);
                published.set(key, {
                  status: "ready",
                  timesSec: flat.timesSec,
                  truncated: truncatedKeys.has(key) || undefined,
                  values: flat.values,
                });
              }
              publish(isCancelled);
            })
            .catch((error: unknown) => {
              if (isCancelled()) {
                return;
              }
              const message =
                error instanceof Error ? error.message : String(error);
              const failedNow = nowMs();
              for (const fieldPath of fieldPaths) {
                const key = episodeNumericSeriesKey(batch.stream, fieldPath);
                if (speculativelyReservedKeys.delete(key)) {
                  speculativeBytesReserved -= ESTIMATED_SERIES_BYTES_PER_FIELD;
                }
                coverage.set(
                  key,
                  removeCoveredRange(
                    coverage.get(key) ?? [],
                    batch.range ?? FULL_COVERAGE,
                  ),
                );
                if (refCountsRef.current.has(key)) {
                  failedAtMs.set(key, failedNow);
                  // Keep whatever segments already rendered; only surface a
                  // hard error state when the signal has nothing to show.
                  if (!segments.has(key)) {
                    published.set(key, { error: message, status: "error" });
                  }
                } else {
                  failedAtMs.delete(key);
                  if (!segments.has(key)) {
                    published.delete(key);
                  }
                }
              }
              publish(isCancelled);
            });
        }
      },
      onHandlersReady(handlers) {
        if (enumerationWantedRef.current) {
          handlers.ensureEnumeration();
        }
      },
      playbackStore,
      playheadThrottleMs: PLAYHEAD_FILL_THROTTLE_MS,
      refCountsRef,
      requireTimeline: Boolean(playbackStore),
      shouldDeferIdleWork: (store) =>
        shouldDeferEpisodeIdleWorkForStore(store, null),
      timelineRetryMs: TIMELINE_RETRY_MS,
    });
  }, [
    capability,
    enumerationWantedRef,
    handlersRef,
    playbackStore,
    refCountsRef,
    setEnumeration,
    setSeriesByKey,
    sourceKey,
  ]);

  // This effect clears published state when the bridge unmounts while the
  // provider outlives it.
  useEffect(
    () => () => {
      setEnumeration(IDLE_ENUMERATION);
      setSeriesByKey(EMPTY_SERIES);
    },
    [setEnumeration, setSeriesByKey],
  );

  return null;
}

/**
 * The fetch window for one playhead position: half the horizon each way,
 * snapped outward to the quantum grid, clamped to the timeline.
 */
function quantizedPlayheadWindow(
  timeline: TimelineIndex,
  playheadSec: number,
): NsRange {
  const centerNs = timeline.secToNs(playheadSec);
  const rawStart = centerNs - WINDOW_HALF_NS;
  const rawEnd = centerNs + WINDOW_HALF_NS;
  const base = timeline.startTimeNs;
  const startOffset = rawStart > base ? rawStart - base : 0n;
  const endOffset = rawEnd > base ? rawEnd - base : 0n;
  const quantizedStart =
    base + (startOffset / WINDOW_QUANTUM_NS) * WINDOW_QUANTUM_NS;
  const quantizedEnd =
    base +
    ((endOffset + WINDOW_QUANTUM_NS - 1n) / WINDOW_QUANTUM_NS) *
      WINDOW_QUANTUM_NS -
    1n;
  const startNs = quantizedStart > base ? quantizedStart : base;
  const endNs =
    quantizedEnd < timeline.endTimeNs ? quantizedEnd : timeline.endTimeNs;
  return endNs >= startNs
    ? { endNs, startNs }
    : { endNs: timeline.endTimeNs, startNs: timeline.startTimeNs };
}

/**
 * Point budget proportional to the requested range's share of the
 * recording, so accumulated windows stay near one chart's pixel density.
 */
function windowPointBudget(
  range: NsRange | null,
  durationSec: number | undefined,
): number {
  if (!range || !durationSec || durationSec <= 0) {
    return FULL_RANGE_POINT_BUDGET;
  }
  const rangeSec = Number(range.endNs - range.startNs) / 1_000_000_000;
  return Math.min(
    FULL_RANGE_POINT_BUDGET,
    Math.max(
      MIN_WINDOW_POINT_BUDGET,
      Math.round((FULL_RANGE_POINT_BUDGET * rangeSec) / durationSec),
    ),
  );
}

function useInternalValue(): EpisodeNumericSeriesInternalValue {
  const value = useContext(EpisodeNumericSeriesContext);
  if (!value) {
    throw new Error(
      "episode numeric series must be used inside <EpisodeNumericSeriesProvider>",
    );
  }

  return value;
}
