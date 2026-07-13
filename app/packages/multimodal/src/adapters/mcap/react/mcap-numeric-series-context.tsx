// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests.
import { PlaybackStoreContext } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { byteSourceAccessKey } from "../../../query/bytes";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapResourceClient,
  type McapTopicNumericFields,
} from "../types";
import { useMcapDataStream } from "./mcap-data-stream-context";
import {
  startMcapDemandBridge,
  useMcapDemandRegistry,
} from "./mcap-demand-bridge";
import type { McapTimelineIndex } from "./mcap-timeline-index";
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
export const MCAP_PLOT_WINDOW_SECONDS = 60;
const WINDOW_HALF_NS = BigInt(MCAP_PLOT_WINDOW_SECONDS / 2) * 1_000_000_000n;

/**
 * Windows are quantized to this grid so a moving playhead produces one
 * bounded fetch per quantum crossed instead of a sliver-sized request
 * every throttle tick, and so ranges align across signals enabled at
 * different times.
 */
const WINDOW_QUANTUM_NS = 15_000_000_000n;

/** Playhead-driven fills run at most this often; fetch latency dominates. */
const PLAYHEAD_FILL_THROTTLE_MS = 500;

/** Coalesces a short burst of plot-field toggles into one topic scan. */
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
const TOPIC_PREFETCH_BUDGET_BYTES = 2 * 1024 * 1024;
const SOURCE_PREFETCH_BUDGET_BYTES = 8 * 1024 * 1024;

/** Coverage sentinel for unbounded (windowless fallback) fetches. */
const FULL_COVERAGE: NsRange = { endNs: 1n << 62n, startNs: 0n };

/**
 * Plottable-field catalog state for the current source. `idle` until a
 * plot tile first asks for it — zero-plot sessions never pay for
 * enumeration.
 */
export interface McapNumericFieldsEnumeration {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly topics: readonly McapTopicNumericFields[];
}

/**
 * One signal's accumulated samples. Times are seconds relative to the
 * recording start; NaN values mark gaps (missing fields, undecodable
 * messages, and the boundaries between non-adjacent fetched windows).
 * Arrays grow as more of the recording is covered; covered ranges are
 * never refetched.
 */
export interface McapNumericSeriesState {
  readonly status: "loading" | "ready" | "error";
  readonly timesSec?: Float64Array;
  readonly values?: Float64Array;
  readonly truncated?: boolean;
  readonly error?: string;
}

/**
 * Cache key for one series: topic and field path, NUL-separated.
 */
export function mcapNumericSeriesKey(topic: string, fieldPath: string): string {
  return `${topic}\0${fieldPath}`;
}

function splitSeriesKey(key: string): [topic: string, fieldPath: string] {
  const separator = key.indexOf("\0");
  return [key.slice(0, separator), key.slice(separator + 1)];
}

/**
 * Public numeric-series cache and demand API consumed by plot tiles.
 */
export interface McapNumericSeriesContextValue {
  readonly enumeration: McapNumericFieldsEnumeration;
  readonly seriesByKey: ReadonlyMap<string, McapNumericSeriesState>;

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
  subscribeSeries(topic: string, fieldPath: string): () => void;
}

interface McapNumericSeriesHandlers {
  ensureEnumeration(): void;
  onDemandChanged(): void;
}

interface McapNumericSeriesInternalValue extends McapNumericSeriesContextValue {
  readonly enumerationWantedRef: React.MutableRefObject<boolean>;
  readonly handlersRef: React.MutableRefObject<McapNumericSeriesHandlers | null>;
  readonly refCountsRef: React.MutableRefObject<Map<string, number>>;
  readonly setEnumeration: (state: McapNumericFieldsEnumeration) => void;
  readonly setSeriesByKey: (
    state: ReadonlyMap<string, McapNumericSeriesState>,
  ) => void;
}

const IDLE_ENUMERATION: McapNumericFieldsEnumeration = {
  status: "idle",
  topics: [],
};
const EMPTY_SERIES: ReadonlyMap<string, McapNumericSeriesState> = new Map();

const McapNumericSeriesContext =
  createContext<McapNumericSeriesInternalValue | null>(null);

/**
 * Shares numeric-series data with plot tiles. The provider lives outside
 * the playback shell and holds state plus the interest registry;
 * `McapNumericSeriesBridge` inside the shell owns the client/source and
 * services demand, so each signal is fetched once per covered range
 * regardless of how many plot tiles show it.
 */
export const McapNumericSeriesProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [enumeration, setEnumeration] =
    useState<McapNumericFieldsEnumeration>(IDLE_ENUMERATION);
  const [seriesByKey, setSeriesByKey] =
    useState<ReadonlyMap<string, McapNumericSeriesState>>(EMPTY_SERIES);
  const { handlersRef, refCountsRef, subscribeKey } =
    useMcapDemandRegistry<McapNumericSeriesHandlers>();
  const enumerationWantedRef = useRef(false);

  const ensureEnumeration = useCallback(() => {
    enumerationWantedRef.current = true;
    handlersRef.current?.ensureEnumeration();
  }, [handlersRef]);

  const subscribeSeries = useCallback(
    (topic: string, fieldPath: string) => {
      const key = mcapNumericSeriesKey(topic, fieldPath);
      return subscribeKey(key);
    },
    [subscribeKey],
  );

  const value = useMemo<McapNumericSeriesInternalValue>(
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
    <McapNumericSeriesContext.Provider value={value}>
      {children}
    </McapNumericSeriesContext.Provider>
  );
};

/**
 * Reads the numeric-series cache and demand hooks for plot tiles.
 */
export function useMcapNumericSeriesContext(): McapNumericSeriesContextValue {
  return useInternalValue();
}

/**
 * Bridge that services numeric-series demand against the shared resource
 * client, respecting the same bounded-reach principle as the rest of the
 * playback system: it fetches quantized windows centered on the playhead
 * (`MCAP_PLOT_WINDOW_SECONDS`), tracks per-signal coverage so no range is
 * ever fetched or decoded twice, stitches fetched segments into growing
 * series, and stands down while the link is starved (same gate as pose
 * trajectories). All reads ride the bulk lane; the byte layer's shared
 * cache means these chunks are the same ones playback pulls for tiles in
 * this region. Without a playback store (standalone/tests) it falls back
 * to one unbounded fetch per signal.
 */
export function McapNumericSeriesBridge({
  client,
  source,
}: {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor | null;
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
  const dataStream = useMcapDataStream();
  const dataStreamRef = useRef(dataStream);
  dataStreamRef.current = dataStream;
  const sourceKey = source ? byteSourceAccessKey(source) : null;

  // This effect owns one source epoch: coverage/segment caches, demand
  // handlers, and the playhead-following fill loop. It re-keys (full
  // reset) when the source changes; fetched signal data is cached for
  // the life of the source, never refetched, and dropped on unmount.
  useEffect(() => {
    setEnumeration(IDLE_ENUMERATION);
    setSeriesByKey(EMPTY_SERIES);
    if (!source || !sourceKey) {
      return undefined;
    }

    let enumerationRequested = false;
    let numericFieldPathsByTopic: ReadonlyMap<
      string,
      readonly string[]
    > | null = null;
    let speculativeBytesReserved = 0;
    const coverage = new Map<string, NsRange[]>();
    const segments = new Map<string, NumericSeriesSegment[]>();
    const published = new Map<string, McapNumericSeriesState>();
    const truncatedKeys = new Set<string>();
    const failedAtMs = new Map<string, number>();
    const speculativelyReservedKeys = new Set<string>();

    const publish = (isCancelled: () => boolean) => {
      if (!isCancelled()) {
        setSeriesByKey(new Map(published));
      }
    };

    return startMcapDemandBridge<McapNumericSeriesHandlers>({
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
          setEnumeration({ status: "loading", topics: [] });
          void client
            .enumerateNumericFields({ source })
            .then((topics) => {
              if (!isCancelled()) {
                numericFieldPathsByTopic = new Map(
                  topics
                    .filter((topic) => topic.availability === "ready")
                    .map((topic) => [
                      topic.topic,
                      [...new Set(topic.fields.map((field) => field.path))],
                    ]),
                );
                setEnumeration({ status: "ready", topics });
              }
            })
            .catch(() => {
              if (!isCancelled()) {
                enumerationRequested = false;
                numericFieldPathsByTopic = null;
                setEnumeration({ status: "error", topics: [] });
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
          { fieldPaths: Set<string>; range: NsRange | null; topic: string }
        >();
        let publishNeeded = false;
        for (const key of demandedKeys) {
          if (!userInitiated) {
            const failed = failedAtMs.get(key);
            if (failed !== undefined && now - failed < FAILURE_BACKOFF_MS) {
              continue;
            }
          }
          const [topic, fieldPath] = splitSeriesKey(key);
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
                ? `${topic}\0full`
                : `${topic}\0${range.startNs}:${range.endNs}`;
            let batch = batches.get(batchKey);
            if (!batch) {
              batch = { fieldPaths: new Set(), range, topic };
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
          const topicFieldPaths = numericFieldPathsByTopic?.get(batch.topic);
          if (
            !topicFieldPaths ||
            topicFieldPaths.length * ESTIMATED_SERIES_BYTES_PER_FIELD >
              TOPIC_PREFETCH_BUDGET_BYTES
          ) {
            continue;
          }

          const range = batch.range ?? FULL_COVERAGE;
          const prefetchFieldPaths: string[] = [];
          let additionalBytes = 0;
          for (const fieldPath of topicFieldPaths) {
            const key = mcapNumericSeriesKey(batch.topic, fieldPath);
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
          // Prefetch the whole eligible topic or none of it. A partial prefix
          // would make later checkbox order determine how many scans occur.
          if (
            speculativeBytesReserved + additionalBytes >
            SOURCE_PREFETCH_BUDGET_BYTES
          ) {
            continue;
          }

          for (const fieldPath of prefetchFieldPaths) {
            const key = mcapNumericSeriesKey(batch.topic, fieldPath);
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
          void client
            .readNumericSeries(
              {
                activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
                fieldPaths,
                maxPointsPerField: windowPointBudget(
                  batch.range,
                  timeline?.durationSec,
                ),
                source,
                ...(batch.range
                  ? {
                      endTimeNs: batch.range.endNs,
                      startTimeNs: batch.range.startNs,
                    }
                  : {}),
                topic: batch.topic,
              },
              { priority: "bulk" },
            )
            .then((result) => {
              if (isCancelled()) {
                return;
              }
              const range = batch.range ?? FULL_COVERAGE;
              for (const field of result.fields) {
                const key = mcapNumericSeriesKey(batch.topic, field.path);
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
                const key = mcapNumericSeriesKey(batch.topic, fieldPath);
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
      timelineRetryMs: TIMELINE_RETRY_MS,
    });
  }, [
    client,
    enumerationWantedRef,
    handlersRef,
    playbackStore,
    refCountsRef,
    setEnumeration,
    setSeriesByKey,
    source,
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
  timeline: McapTimelineIndex,
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

function useInternalValue(): McapNumericSeriesInternalValue {
  const value = useContext(McapNumericSeriesContext);
  if (!value) {
    throw new Error(
      "MCAP numeric series must be used inside <McapNumericSeriesProvider>",
    );
  }

  return value;
}
