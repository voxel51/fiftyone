// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests.
import { getPlayhead, PlaybackStoreContext } from "@fiftyone/playback/runtime";
import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import {
  addCoveredRange,
  coveredNumericSeriesSeconds,
  createDemandFailureBackoff,
  createDemandInventoryMachine,
  DEMAND_FAILURE_BACKOFF_MS,
  flattenSeriesSegments,
  FULL_NUMERIC_SERIES_COVERAGE,
  insertSeriesSegment,
  nearestNumericSeriesRange,
  numericSeriesKey,
  numericSeriesRangeDurationSeconds,
  numericSeriesRangesOverlap,
  numericSeriesWindowPointBudget,
  PLOT_WINDOW_SECONDS,
  quantizedNumericSeriesWindow,
  removeCoveredRange,
  sliceNumericFieldToRange,
  splitNumericSeriesKey,
  startDemandBridge,
  subtractCoveredRanges,
  type NsRange,
  type NumericSeriesSegment,
} from "../../../runtime";
import {
  createDemandContextProvider,
  useResetDemandContextOnUnmount,
  type DemandContextHandlers,
} from "../../../runtime/react";
import type { NumericStreamFields } from "../../../ir";
import type {
  NumericSeriesCapability,
  NumericSeriesSliceSelection,
  ReadContinuation,
  ReadWorkBudget,
} from "../../../ports";
import { errorMessage } from "../../../utils/errors";
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
export { numericSeriesKey, PLOT_WINDOW_SECONDS };

/** Playhead-driven fills run at most this often; fetch latency dominates. */
const PLAYHEAD_FILL_THROTTLE_MS = 500;

/** Coalesces a short burst of plot-field toggles into one stream scan. */
const FIELD_SELECTION_DEBOUNCE_MS = 250;

/** Starved-link stand-down retry, matching the pose-trajectory gate. */
const DEFERRED_RETRY_MS = 2_000;

/** The timeline index lands moments after stream registration; wait for
 * it instead of falling back to an unbounded scan. */
const TIMELINE_RETRY_MS = 250;

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

type NumericSeriesHandlers = DemandContextHandlers;

interface NumericSliceJob {
  readonly continuation?: ReadContinuation;
  readonly horizonKey: string;
  readonly preferredTimeNs: bigint;
  readonly range: NsRange;
  readonly selections: readonly NumericSeriesSliceSelection[];
}

const IDLE_ENUMERATION: NumericFieldsEnumeration = {
  status: "idle",
  streams: [],
};
const EMPTY_SERIES: ReadonlyMap<string, NumericSeriesState> = new Map();

const numericSeriesDemandContext = createDemandContextProvider<
  NumericFieldsEnumeration,
  NumericSeriesState,
  NumericSeriesHandlers
>({
  displayName: "NumericSeriesProvider",
  emptyValues: EMPTY_SERIES,
  idleInventory: IDLE_ENUMERATION,
  missingProviderMessage:
    "episode numeric series must be used inside <NumericSeriesProvider>",
});

/**
 * Shares numeric-series data with plot tiles. The provider lives outside
 * the playback shell and holds state plus the interest registry;
 * `NumericSeriesBridge` inside the shell owns the client/source and
 * services demand, so each signal is fetched once per covered range
 * regardless of how many plot tiles show it.
 */
export const NumericSeriesProvider = numericSeriesDemandContext.Provider;

/**
 * Reads the numeric-series cache and demand hooks for plot tiles.
 */
export function useNumericSeriesContext(): NumericSeriesContextValue {
  const { ensureInventory, inventory, subscribeKey, valuesByKey } =
    useInternalValue();
  const subscribeSeries = useCallback(
    (stream: string, fieldPath: string) =>
      subscribeKey(numericSeriesKey(stream, fieldPath)),
    [subscribeKey],
  );
  return useMemo(
    () => ({
      ensureEnumeration: ensureInventory,
      enumeration: inventory,
      seriesByKey: valuesByKey,
      subscribeSeries,
    }),
    [ensureInventory, inventory, subscribeSeries, valuesByKey],
  );
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
    handlersRef,
    inventoryReplay,
    publishValues,
    refCountsRef,
    reset,
    setInventory,
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
    reset();
    if (!capability || !sourceKey) {
      return undefined;
    }

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
    const failures = createDemandFailureBackoff<string>();
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
        failures.clear(key);
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
      const targetSeconds = numericSeriesRangeDurationSeconds(horizon);
      for (const selection of selections) {
        for (const field of selection.fields) {
          const key = numericSeriesKey(selection.stream, field);
          const state = published.get(key);
          if (!state) {
            continue;
          }
          published.set(key, {
            ...state,
            coverageSeconds: coveredNumericSeriesSeconds(
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
      inventoryReplay,
      makeHandlers: ({ isCancelled, queueFill }) => {
        const inventory = createDemandInventoryMachine({
          error: { status: "error", streams: [] },
          isCancelled,
          async load(publish) {
            const timeline = dataStreamRef.current?.getTimelineIndex() ?? null;
            const sampleTimeNs =
              playbackStore && timeline
                ? timeline.secToNs(getPlayhead(playbackStore))
                : undefined;
            const streams = await capability.enumerateNumericFields(undefined, {
              includeDataFallback: false,
              sampleTimeNs,
            });
            publish({ status: "ready", streams });
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
              .then((augmented) =>
                publish({ status: "ready", streams: augmented }),
              )
              .catch(() => {
                // Keep the schema catalog when optional augmentation fails.
              });
          },
          loading: { status: "loading", streams: [] },
          publish: setInventory,
        });
        return {
          ensureInventory: inventory.ensure,
          onDemandChanged() {
            abortActiveWork();
            queueFill();
          },
        };
      },
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
            ? quantizedNumericSeriesWindow(timeline, playheadSec)
            : null;
        const demandedKeys = new Set(demandKeys);
        const now = nowMs();

        // Adapters without bounded numeric slices retain the legacy
        // single-stream path. MCAP always takes the progressive branch below.
        if (!window || !capability.readNumericSeriesSlice) {
          if (legacyControllers.size > 0) {
            return;
          }
          const fallbackRange = window ?? FULL_NUMERIC_SERIES_COVERAGE;
          const batches = new Map<
            string,
            { fields: Set<string>; range: NsRange; stream: string }
          >();
          let publishNeeded = false;
          for (const key of demandedKeys) {
            if (failures.isBlocked(key, now, userInitiated)) continue;
            const [stream, fieldPath] = splitNumericSeriesKey(key);
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
            publishValues(published, isCancelled);
          }
          for (const batch of batches.values()) {
            const fields = [...batch.fields];
            const controller = new AbortController();
            legacyControllers.add(controller);
            void capability
              .readNumericSeries({
                fields,
                maxPointsPerField: numericSeriesWindowPointBudget(
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
                publishValues(published, isCancelled);
              })
              .catch((error: unknown) => {
                legacyControllers.delete(controller);
                if (isCancelled() || controller.signal.aborted) {
                  return;
                }
                const message = errorMessage(error);
                const failedNow = nowMs();
                for (const fieldPath of fields) {
                  const key = numericSeriesKey(batch.stream, fieldPath);
                  coverage.set(
                    key,
                    removeCoveredRange(coverage.get(key) ?? [], batch.range),
                  );
                  if (refCountsRef.current.has(key)) {
                    failures.record(key, failedNow);
                    if (!segments.has(key)) {
                      published.set(key, { error: message, status: "error" });
                    }
                  }
                }
                publishValues(published, isCancelled);
                later(queueFill, DEMAND_FAILURE_BACKOFF_MS);
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
            if (failures.isBlocked(key, now, userInitiated)) continue;
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
            publishValues(published, isCancelled);
          }
          const range = nearestNumericSeriesRange(candidates, preferredTimeNs);
          if (!range) {
            return;
          }
          const fieldsByStream = new Map<string, Set<string>>();
          for (const [key, ranges] of missing) {
            if (
              !ranges.some((missingRange) =>
                numericSeriesRangesOverlap(missingRange, range),
              )
            ) {
              continue;
            }
            const [stream, field] = splitNumericSeriesKey(key);
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
            maxPointsPerField: numericSeriesWindowPointBudget(
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
                failures.clear(key);
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
            publishValues(published, isCancelled);

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
            const message = errorMessage(error);
            const failedNow = nowMs();
            for (const selection of sliceJob.selections) {
              for (const field of selection.fields) {
                const key = numericSeriesKey(selection.stream, field);
                if (refCountsRef.current.has(key)) {
                  failures.record(key, failedNow);
                  if (!segments.has(key)) {
                    published.set(key, { error: message, status: "error" });
                  }
                }
              }
            }
            publishValues(published, isCancelled);
            later(queueFill, DEMAND_FAILURE_BACKOFF_MS);
          });
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
    handlersRef,
    inventoryReplay,
    playbackStore,
    publishValues,
    refCountsRef,
    reset,
    setInventory,
    sourceKey,
  ]);

  useResetDemandContextOnUnmount(reset);

  return null;
}

function useInternalValue() {
  return numericSeriesDemandContext.useDemandContext();
}
