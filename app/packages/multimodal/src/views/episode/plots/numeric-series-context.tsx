// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests.
import { getPlayhead, PlaybackStoreContext } from "@fiftyone/playback/runtime";
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
  addCoveredRange,
  flattenSeriesSegments,
  insertSeriesSegment,
  removeCoveredRange,
  startDemandBridge,
  subtractCoveredRanges,
  type NsRange,
  type NumericSeriesSegment,
  type TimelineIndex,
} from "../../../runtime";
import { useDemandRegistry } from "../../../runtime/react";
import type { NumericStreamFields } from "../../../ir";
import type {
  NumericSeriesCapability,
  NumericSeriesSliceSelection,
  ReadContinuation,
  ReadWorkBudget,
} from "../../../ports";
import { useDataStream } from "../playback/data-stream-context";
import { shouldDeferIdleWorkForStore } from "../playback/network-health";

/**
 * Fetch horizon centered on the playhead. Playback's 4s lookahead keeps
 * the next frames ready; a plot needs enough trace around the playhead
 * to *read* a signal, so it gets its own wider bound. Chunks fetched
 * here are the same chunks playback needs for this region (shared byte
 * cache), so the marginal cost over playback is roughly this window
 * minus the lookahead, once per region.
 */
export const PLOT_WINDOW_SECONDS = 60;
const WINDOW_HALF_NS = BigInt(PLOT_WINDOW_SECONDS / 2) * 1_000_000_000n;

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

const MIB = 1024 * 1024;

/** Smallest first-paint grant: one ordinary chunk ownership group. */
const FIRST_NUMERIC_SLICE_BUDGET: ReadWorkBudget = {
  maxMessages: 50_000,
  maxSourceBytes: 64 * MIB,
  maxUncompressedBytes: 128 * MIB,
  maxWallTimeMs: 750,
};

/** Steady continuation grant after the first exact playhead-local result. */
const STEADY_NUMERIC_SLICE_BUDGET: ReadWorkBudget = {
  maxMessages: 50_000,
  maxSourceBytes: 256 * MIB,
  maxUncompressedBytes: 128 * MIB,
  maxWallTimeMs: 750,
};

/** Hard ceiling for one indivisible MCAP overlap group. */
const ABSOLUTE_NUMERIC_SOURCE_UNIT_BUDGET: ReadWorkBudget = {
  maxMessages: 250_000,
  maxSourceBytes: 512 * MIB,
  maxUncompressedBytes: 512 * MIB,
  maxWallTimeMs: 5_000,
};
const FIRST_NUMERIC_SLICE_MAX_CHUNKS = 1;
const STEADY_NUMERIC_SLICE_MAX_CHUNKS = 8;
const ABSOLUTE_NUMERIC_SOURCE_UNIT_MAX_CHUNKS = 32;

/** Coverage sentinel for unbounded (windowless fallback) fetches. */
const FULL_COVERAGE: NsRange = { endNs: 1n << 62n, startNs: 0n };

/**
 * Plottable-field catalog state for the current source. `idle` until a
 * plot tile first asks for it — zero-plot sessions never pay for
 * enumeration.
 */
export interface NumericFieldsEnumeration {
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
export interface NumericSeriesState {
  readonly status: "loading" | "ready" | "error";
  readonly coverageSeconds?: number;
  readonly timesSec?: Float64Array;
  readonly targetSeconds?: number;
  readonly values?: Float64Array;
  readonly truncated?: boolean;
  readonly error?: string;
}

/**
 * Cache key for one series: stream and field path, NUL-separated.
 */
export function numericSeriesKey(stream: string, fieldPath: string): string {
  return `${stream}\0${fieldPath}`;
}

function splitSeriesKey(key: string): [stream: string, fieldPath: string] {
  const separator = key.indexOf("\0");
  return [key.slice(0, separator), key.slice(separator + 1)];
}

/**
 * Public numeric-series cache and demand API consumed by plot tiles.
 */
export interface NumericSeriesContextValue {
  readonly enumeration: NumericFieldsEnumeration;
  readonly seriesByKey: ReadonlyMap<string, NumericSeriesState>;

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

interface NumericSeriesHandlers {
  ensureEnumeration(): void;
  onDemandChanged(): void;
}

interface NumericSliceJob {
  readonly continuation?: ReadContinuation;
  readonly horizonKey: string;
  readonly preferredTimeNs: bigint;
  readonly range: NsRange;
  readonly selections: readonly NumericSeriesSliceSelection[];
}

interface NumericSeriesInternalValue extends NumericSeriesContextValue {
  readonly enumerationWantedRef: React.MutableRefObject<boolean>;
  readonly handlersRef: React.MutableRefObject<NumericSeriesHandlers | null>;
  readonly refCountsRef: React.MutableRefObject<Map<string, number>>;
  readonly setEnumeration: (state: NumericFieldsEnumeration) => void;
  readonly setSeriesByKey: (
    state: ReadonlyMap<string, NumericSeriesState>,
  ) => void;
}

const IDLE_ENUMERATION: NumericFieldsEnumeration = {
  status: "idle",
  streams: [],
};
const EMPTY_SERIES: ReadonlyMap<string, NumericSeriesState> = new Map();

const NumericSeriesContext = createContext<NumericSeriesInternalValue | null>(
  null,
);

/**
 * Shares numeric-series data with plot tiles. The provider lives outside
 * the playback shell and holds state plus the interest registry;
 * `NumericSeriesBridge` inside the shell owns the client/source and
 * services demand, so each signal is fetched once per covered range
 * regardless of how many plot tiles show it.
 */
export const NumericSeriesProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [enumeration, setEnumeration] =
    useState<NumericFieldsEnumeration>(IDLE_ENUMERATION);
  const [seriesByKey, setSeriesByKey] =
    useState<ReadonlyMap<string, NumericSeriesState>>(EMPTY_SERIES);
  const { handlersRef, refCountsRef, subscribeKey } =
    useDemandRegistry<NumericSeriesHandlers>();
  const enumerationWantedRef = useRef(false);

  const ensureEnumeration = useCallback(() => {
    enumerationWantedRef.current = true;
    handlersRef.current?.ensureEnumeration();
  }, [handlersRef]);

  const subscribeSeries = useCallback(
    (stream: string, fieldPath: string) => {
      const key = numericSeriesKey(stream, fieldPath);
      return subscribeKey(key);
    },
    [subscribeKey],
  );

  const value = useMemo<NumericSeriesInternalValue>(
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
    <NumericSeriesContext.Provider value={value}>
      {children}
    </NumericSeriesContext.Provider>
  );
};

/**
 * Reads the numeric-series cache and demand hooks for plot tiles.
 */
export function useNumericSeriesContext(): NumericSeriesContextValue {
  return useInternalValue();
}

/**
 * Bridge that services numeric-series demand against the shared resource
 * client, respecting the same bounded-reach principle as the rest of the
 * playback system: it fetches quantized windows centered on the playhead
 * (`PLOT_WINDOW_SECONDS`), tracks per-signal coverage so no range is
 * ever fetched or decoded twice, stitches fetched segments into growing
 * series, and stands down while the link is starved (same gate as pose
 * trajectories). All reads ride the bulk lane; the byte layer's shared
 * cache means these chunks are the same ones playback pulls for tiles in
 * this region. Without a playback store (standalone/tests) it falls back
 * to one unbounded fetch per signal.
 */
export function NumericSeriesBridge({
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
  const dataStream = useDataStream();
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
    let activeSlice:
      | {
          readonly controller: AbortController;
          readonly job: NumericSliceJob;
        }
      | undefined;
    let pendingSlice: NumericSliceJob | undefined;
    const legacyControllers = new Set<AbortController>();
    const coverage = new Map<string, NsRange[]>();
    const segments = new Map<string, NumericSeriesSegment[]>();
    const published = new Map<string, NumericSeriesState>();
    const truncatedKeys = new Set<string>();
    const failedAtMs = new Map<string, number>();

    const publish = (isCancelled: () => boolean) => {
      if (!isCancelled()) {
        setSeriesByKey(new Map(published));
      }
    };
    const abortActiveWork = () => {
      activeSlice?.controller.abort();
      activeSlice = undefined;
      pendingSlice = undefined;
      for (const controller of legacyControllers) {
        controller.abort();
      }
      legacyControllers.clear();
    };
    const publishResult = ({
      baseTimeNs,
      fields,
      ranges,
      stream,
      truncated,
    }: {
      readonly baseTimeNs: bigint;
      readonly fields: readonly {
        readonly path: string;
        readonly timesSec: Float64Array;
        readonly values: Float64Array;
      }[];
      readonly ranges: readonly NsRange[];
      readonly stream: string;
      readonly truncated: boolean;
    }) => {
      for (const field of fields) {
        const key = numericSeriesKey(stream, field.path);
        failedAtMs.delete(key);
        if (truncated) {
          truncatedKeys.add(key);
        }
        let keySegments = segments.get(key) ?? [];
        for (const range of ranges) {
          const sliced = sliceNumericFieldToRange(field, baseTimeNs, range);
          if (sliced.timesSec.length === 0) {
            continue;
          }
          keySegments = insertSeriesSegment(keySegments, {
            endNs: range.endNs,
            startNs: range.startNs,
            timesSec: sliced.timesSec,
            values: sliced.values,
          });
        }
        if (keySegments.length > 0) {
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
    };
    const publishCoverageProgress = (
      selections: readonly NumericSeriesSliceSelection[],
      horizon: NsRange,
    ) => {
      const targetSeconds = rangeDurationSeconds(horizon);
      for (const selection of selections) {
        for (const field of selection.fields) {
          const key = numericSeriesKey(selection.stream, field);
          const state = published.get(key);
          if (!state) {
            continue;
          }
          published.set(key, {
            ...state,
            coverageSeconds: coveredSecondsWithin(
              coverage.get(key) ?? [],
              horizon,
            ),
            targetSeconds,
          });
        }
      }
    };

    const stopBridge = startDemandBridge<
      NumericSeriesHandlers,
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
          const timeline = dataStreamRef.current?.getTimelineIndex() ?? null;
          const sampleTimeNs =
            playbackStore && timeline
              ? timeline.secToNs(getPlayhead(playbackStore))
              : undefined;
          const publishEnumeration = (
            streams: readonly NumericStreamFields[],
          ) => {
            if (!isCancelled()) {
              setEnumeration({ status: "ready", streams });
            }
          };
          void capability
            .enumerateNumericFields(undefined, {
              includeDataFallback: false,
              sampleTimeNs,
            })
            .then((streams) => {
              publishEnumeration(streams);
              if (
                isCancelled() ||
                !streams.some((stream) => stream.sampled === true)
              ) {
                return;
              }
              void capability
                .enumerateNumericFields(undefined, {
                  includeDataFallback: true,
                  sampleTimeNs,
                })
                .then(publishEnumeration)
                .catch(() => {
                  // Keep the schema catalog when optional augmentation fails.
                });
            })
            .catch(() => {
              if (!isCancelled()) {
                enumerationRequested = false;
                setEnumeration({ status: "error", streams: [] });
              }
            });
        },
        onDemandChanged() {
          abortActiveWork();
          queueFill();
        },
      }),
      onFill({
        demandKeys,
        isCancelled,
        later,
        nowMs,
        playheadSec,
        queueFill,
        queueImmediateFill,
        timeline,
        userInitiated,
      }) {
        const window =
          playbackStore && timeline
            ? quantizedPlayheadWindow(timeline, playheadSec)
            : null;
        const demandedKeys = new Set(demandKeys);
        const now = nowMs();

        // Adapters without bounded numeric slices retain the legacy
        // single-stream path. MCAP always takes the progressive branch below.
        if (!window || !capability.readNumericSeriesSlice) {
          if (legacyControllers.size > 0) {
            return;
          }
          const fallbackRange = window ?? FULL_COVERAGE;
          const batches = new Map<
            string,
            { fields: Set<string>; range: NsRange; stream: string }
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
            for (const range of subtractCoveredRanges(
              fallbackRange,
              coverage.get(key) ?? [],
            )) {
              const batchKey = `${stream}\0${range.startNs}:${range.endNs}`;
              let batch = batches.get(batchKey);
              if (!batch) {
                batch = { fields: new Set(), range, stream };
                batches.set(batchKey, batch);
              }
              batch.fields.add(fieldPath);
              coverage.set(
                key,
                addCoveredRange(coverage.get(key) ?? [], range),
              );
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
            const fields = [...batch.fields];
            const controller = new AbortController();
            legacyControllers.add(controller);
            void capability
              .readNumericSeries({
                fields,
                maxPointsPerField: windowPointBudget(
                  batch.range,
                  timeline?.durationSec,
                ),
                signal: controller.signal,
                stream: batch.stream,
                window: batch.range,
              })
              .then((result) => {
                legacyControllers.delete(controller);
                if (isCancelled() || controller.signal.aborted) {
                  return;
                }
                publishResult({
                  baseTimeNs: result.baseTimeNs,
                  fields: result.fields,
                  ranges: [batch.range],
                  stream: batch.stream,
                  truncated: result.truncated,
                });
                publish(isCancelled);
              })
              .catch((error: unknown) => {
                legacyControllers.delete(controller);
                if (isCancelled() || controller.signal.aborted) {
                  return;
                }
                const message =
                  error instanceof Error ? error.message : String(error);
                const failedNow = nowMs();
                for (const fieldPath of fields) {
                  const key = numericSeriesKey(batch.stream, fieldPath);
                  coverage.set(
                    key,
                    removeCoveredRange(coverage.get(key) ?? [], batch.range),
                  );
                  if (refCountsRef.current.has(key)) {
                    failedAtMs.set(key, failedNow);
                    if (!segments.has(key)) {
                      published.set(key, { error: message, status: "error" });
                    }
                  }
                }
                publish(isCancelled);
                later(queueFill, FAILURE_BACKOFF_MS);
              });
          }
          return;
        }
        if (!timeline) {
          return;
        }
        const preferredTimeNs = timeline.secToNs(playheadSec);

        const horizonKey = `${window.startNs}:${window.endNs}`;
        if (activeSlice) {
          if (activeSlice.job.horizonKey === horizonKey) {
            return;
          }
          activeSlice.controller.abort();
          activeSlice = undefined;
          pendingSlice = undefined;
        }

        let job = pendingSlice;
        if (
          job &&
          (job.horizonKey !== horizonKey ||
            job.selections.some((selection) =>
              selection.fields.some(
                (field) =>
                  !demandedKeys.has(numericSeriesKey(selection.stream, field)),
              ),
            ))
        ) {
          job = undefined;
          pendingSlice = undefined;
        }

        if (!job) {
          const missing = new Map<string, readonly NsRange[]>();
          const candidates: NsRange[] = [];
          let publishNeeded = false;
          for (const key of demandedKeys) {
            if (!userInitiated) {
              const failed = failedAtMs.get(key);
              if (failed !== undefined && now - failed < FAILURE_BACKOFF_MS) {
                continue;
              }
            }
            const ranges = subtractCoveredRanges(
              window,
              coverage.get(key) ?? [],
            );
            if (ranges.length === 0) {
              continue;
            }
            missing.set(key, ranges);
            candidates.push(...ranges);
            if (!published.has(key)) {
              published.set(key, { status: "loading" });
              publishNeeded = true;
            }
          }
          if (publishNeeded) {
            publish(isCancelled);
          }
          const range = nearestRange(candidates, preferredTimeNs);
          if (!range) {
            return;
          }
          const fieldsByStream = new Map<string, Set<string>>();
          for (const [key, ranges] of missing) {
            if (
              !ranges.some((missingRange) => rangesOverlap(missingRange, range))
            ) {
              continue;
            }
            const [stream, field] = splitSeriesKey(key);
            let fields = fieldsByStream.get(stream);
            if (!fields) {
              fields = new Set();
              fieldsByStream.set(stream, fields);
            }
            fields.add(field);
          }
          job = {
            horizonKey,
            preferredTimeNs,
            range,
            selections: [...fieldsByStream].map(([stream, fields]) => ({
              fields: [...fields],
              stream,
            })),
          };
        }

        const sliceJob = job;
        pendingSlice = undefined;
        const controller = new AbortController();
        activeSlice = { controller, job: sliceJob };
        const isFirstPage = sliceJob.continuation === undefined;
        void capability
          .readNumericSeriesSlice({
            absoluteBudget: ABSOLUTE_NUMERIC_SOURCE_UNIT_BUDGET,
            absoluteMaxChunks: ABSOLUTE_NUMERIC_SOURCE_UNIT_MAX_CHUNKS,
            budget: isFirstPage
              ? FIRST_NUMERIC_SLICE_BUDGET
              : STEADY_NUMERIC_SLICE_BUDGET,
            continuation: sliceJob.continuation,
            maxChunks: isFirstPage
              ? FIRST_NUMERIC_SLICE_MAX_CHUNKS
              : STEADY_NUMERIC_SLICE_MAX_CHUNKS,
            maxPointsPerField: windowPointBudget(
              sliceJob.range,
              timeline.durationSec,
            ),
            preferredTimeNs: sliceJob.preferredTimeNs,
            selections: sliceJob.selections,
            signal: controller.signal,
            window: sliceJob.range,
          })
          .then((result) => {
            if (
              isCancelled() ||
              controller.signal.aborted ||
              activeSlice?.controller !== controller
            ) {
              return;
            }
            activeSlice = undefined;
            if (
              result.stopReason === "budget-exhausted" &&
              !result.continuation &&
              result.usage.chunksOpened === 0
            ) {
              throw new Error("Numeric series slice made no bounded progress");
            }

            const terminal =
              result.stopReason === "source-exhausted" ||
              result.stopReason === "oversized-source-unit";
            for (const selection of sliceJob.selections) {
              const ranges =
                result.coverageByStream.get(selection.stream) ?? [];
              for (const field of selection.fields) {
                const key = numericSeriesKey(selection.stream, field);
                let covered = coverage.get(key) ?? [];
                for (const range of ranges) {
                  covered = addCoveredRange(covered, range);
                }
                if (terminal) {
                  covered = addCoveredRange(covered, sliceJob.range);
                }
                coverage.set(key, covered);
                failedAtMs.delete(key);
                if (result.stopReason === "oversized-source-unit") {
                  truncatedKeys.add(key);
                }
              }
            }

            const returnedStreams = new Set<string>();
            for (const series of result.series) {
              returnedStreams.add(series.streamId);
              publishResult({
                baseTimeNs: series.baseTimeNs,
                fields: series.fields,
                ranges: result.coverageByStream.get(series.streamId) ?? [
                  sliceJob.range,
                ],
                stream: series.streamId,
                truncated:
                  series.truncated ||
                  result.stopReason === "oversized-source-unit",
              });
            }
            for (const selection of sliceJob.selections) {
              if (returnedStreams.has(selection.stream)) {
                continue;
              }
              publishResult({
                baseTimeNs: 0n,
                fields: selection.fields.map((path) => ({
                  path,
                  timesSec: new Float64Array(),
                  values: new Float64Array(),
                })),
                ranges: [],
                stream: selection.stream,
                truncated: result.stopReason === "oversized-source-unit",
              });
            }
            publishCoverageProgress(sliceJob.selections, sliceJob.range);
            publish(isCancelled);

            pendingSlice = result.continuation
              ? { ...sliceJob, continuation: result.continuation }
              : undefined;
            queueImmediateFill();
          })
          .catch((error: unknown) => {
            if (activeSlice?.controller === controller) {
              activeSlice = undefined;
            }
            if (
              isCancelled() ||
              controller.signal.aborted ||
              (error instanceof Error && error.name === "AbortError")
            ) {
              return;
            }
            pendingSlice = undefined;
            const message =
              error instanceof Error ? error.message : String(error);
            const failedNow = nowMs();
            for (const selection of sliceJob.selections) {
              for (const field of selection.fields) {
                const key = numericSeriesKey(selection.stream, field);
                if (refCountsRef.current.has(key)) {
                  failedAtMs.set(key, failedNow);
                  if (!segments.has(key)) {
                    published.set(key, { error: message, status: "error" });
                  }
                }
              }
            }
            publish(isCancelled);
            later(queueFill, FAILURE_BACKOFF_MS);
          });
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
      shouldDeferIdleWork: (store) => shouldDeferIdleWorkForStore(store, null),
      timelineRetryMs: TIMELINE_RETRY_MS,
    });

    return () => {
      abortActiveWork();
      stopBridge();
    };
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

function nearestRange(
  ranges: readonly NsRange[],
  preferredTimeNs: bigint,
): NsRange | undefined {
  return ranges.reduce<NsRange | undefined>((best, range) => {
    if (!best) {
      return range;
    }
    const distance = distanceToRange(range, preferredTimeNs);
    const bestDistance = distanceToRange(best, preferredTimeNs);
    if (distance !== bestDistance) {
      return distance < bestDistance ? range : best;
    }
    if (range.startNs !== best.startNs) {
      return range.startNs < best.startNs ? range : best;
    }
    return range.endNs < best.endNs ? range : best;
  }, undefined);
}

function distanceToRange(range: NsRange, preferredTimeNs: bigint): bigint {
  if (preferredTimeNs < range.startNs) {
    return range.startNs - preferredTimeNs;
  }
  if (preferredTimeNs > range.endNs) {
    return preferredTimeNs - range.endNs;
  }
  return 0n;
}

function rangesOverlap(left: NsRange, right: NsRange): boolean {
  return left.startNs <= right.endNs && right.startNs <= left.endNs;
}

function coveredSecondsWithin(
  covered: readonly NsRange[],
  horizon: NsRange,
): number {
  let coveredNs = 0n;
  for (const range of covered) {
    const startNs =
      range.startNs > horizon.startNs ? range.startNs : horizon.startNs;
    const endNs = range.endNs < horizon.endNs ? range.endNs : horizon.endNs;
    if (endNs >= startNs) {
      coveredNs += endNs - startNs;
    }
  }
  return Number(coveredNs) / 1_000_000_000;
}

function rangeDurationSeconds(range: NsRange): number {
  return Number(range.endNs - range.startNs) / 1_000_000_000;
}

function sliceNumericFieldToRange(
  field: {
    readonly timesSec: Float64Array;
    readonly values: Float64Array;
  },
  baseTimeNs: bigint,
  range: NsRange,
): { readonly timesSec: Float64Array; readonly values: Float64Array } {
  const startSec = nsDeltaToSeconds(range.startNs - baseTimeNs);
  const endSec = nsDeltaToSeconds(range.endNs - baseTimeNs);
  let start = 0;
  while (start < field.timesSec.length && field.timesSec[start] < startSec) {
    start += 1;
  }
  let end = start;
  while (end < field.timesSec.length && field.timesSec[end] <= endSec) {
    end += 1;
  }
  return {
    timesSec: field.timesSec.slice(start, end),
    values: field.values.slice(start, end),
  };
}

function nsDeltaToSeconds(deltaNs: bigint): number {
  return (
    Number(deltaNs / 1_000_000_000n) +
    Number(deltaNs % 1_000_000_000n) / 1_000_000_000
  );
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

function useInternalValue(): NumericSeriesInternalValue {
  const value = useContext(NumericSeriesContext);
  if (!value) {
    throw new Error(
      "episode numeric series must be used inside <NumericSeriesProvider>",
    );
  }

  return value;
}
