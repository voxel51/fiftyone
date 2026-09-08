// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests.
import { getPlayhead, PlaybackStoreContext } from "@fiftyone/playback/runtime";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  addCoveredRange,
  completeNumericSeriesPrefix,
  contiguousNumericSeriesPrefix,
  coveredNumericSeriesSeconds,
  createDemandFailureBackoff,
  createDemandInventoryMachine,
  createNumericSeriesTileCache,
  DEMAND_DEFERRED_RETRY_MS,
  DEMAND_FAILURE_BACKOFF_MS,
  DEMAND_TIMELINE_RETRY_MS,
  flattenSeriesSegments,
  FULL_NUMERIC_SERIES_COVERAGE,
  nearestNumericSeriesRange,
  numericSeriesKey,
  numericSeriesRangeDurationSeconds,
  numericSeriesRangesOverlap,
  numericSeriesWindowPointBudget,
  createPlotPublicationStore,
  type PlotPublicationStore,
  quantizedNumericSeriesWindow,
  removeCoveredRange,
  sliceNumericFieldToRange,
  splitNumericSeriesKey,
  startDemandBridge,
  subtractCoveredRanges,
  type NsRange,
  type NumericSeriesTileCache,
  type TimelineIndex,
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
import {
  aggregateAlignedNumericSeries,
  ALIGNED_NUMERIC_BUCKET_MAX_POINTS,
} from "../../../utils/numeric-series-buckets";
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
export { numericSeriesKey };

/** Playhead-driven fills run at most this often; fetch latency dominates. */
const PLAYHEAD_FILL_THROTTLE_MS = 500;

/** Coalesces a short burst of plot-field toggles into one stream scan. */
const FIELD_SELECTION_DEBOUNCE_MS = 250;

/** Prevents a long continuation chain from monopolizing one demand epoch. */
const MAX_NUMERIC_SLICE_PAGES_PER_EPOCH = 8;
const NUMERIC_TILE_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const NUMERIC_TILE_CACHE_MAX_TILES = 2_048;
const MAX_NUMERIC_REPRESENTATIVE_POINTS = 10_000;

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
 * One signal's visible samples. Times are seconds relative to the recording
 * start; NaN values mark decoded gaps. Arrays are assembled only for the
 * current follow/pinned viewport from immutable resolution-keyed tiles.
 */
export interface NumericSeriesState {
  readonly status: "loading" | "ready" | "error";
  /** Source ranges proven readable or empty, excluding unavailable units. */
  readonly coverage?: readonly NsRange[];
  readonly coverageSeconds?: number;
  readonly timesSec?: Float64Array;
  readonly targetSeconds?: number;
  readonly values?: Float64Array;
  readonly truncated?: boolean;
  /** Exact source ranges skipped because an atomic unit exceeded hard limits. */
  readonly unavailable?: readonly NsRange[];
  readonly error?: string;
}

export interface NumericSeriesViewportDemand {
  readonly endSec: number;
  readonly mode: "follow" | "pinned";
  readonly pixelWidth: number;
  readonly startSec: number;
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
   * outstanding. Interested signals are fetched for follow/pinned viewports;
   * dropping interest leaves retained tiles subject to the cache budget.
   */
  subscribeSeries(stream: string, fieldPath: string): () => void;

  /** Updates one plot tile's follow/pinned visible-range demand. */
  setViewportDemand(
    demandId: string,
    demand: NumericSeriesViewportDemand | null,
  ): void;
}

type NumericSeriesHandlers = DemandContextHandlers;

interface NumericSliceJob {
  readonly bucketDurationNs: bigint;
  readonly continuation?: ReadContinuation;
  readonly horizon: NsRange;
  readonly horizonKey: string;
  readonly notBeforeMs?: number;
  readonly pageCount: number;
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

interface NumericSeriesPublicationContextValue {
  readonly store: PlotPublicationStore<string, NumericSeriesState>;
  readonly valuesByKey: Map<string, NumericSeriesState>;
  readonly viewports: Map<string, NumericSeriesViewportDemand>;
}

const numericSeriesPublicationContext =
  createContext<NumericSeriesPublicationContextValue | null>(null);

/**
 * Shares numeric-series data with plot tiles. The provider lives outside
 * the playback shell and holds state plus the interest registry;
 * `NumericSeriesBridge` inside the shell owns the client/source and
 * services demand, so each signal/resolution is fetched once per covered
 * range regardless of how many plot tiles show it.
 */
export function NumericSeriesProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [publication] = useState<NumericSeriesPublicationContextValue>(() => ({
    store: createPlotPublicationStore({
      scheduleFrame: scheduleNumericSeriesFrame,
    }),
    valuesByKey: new Map(),
    viewports: new Map(),
  }));
  return (
    <numericSeriesDemandContext.Provider>
      <numericSeriesPublicationContext.Provider value={publication}>
        {children}
      </numericSeriesPublicationContext.Provider>
    </numericSeriesDemandContext.Provider>
  );
}

/**
 * Reads the numeric-series cache and demand hooks for plot tiles.
 */
export function useNumericSeriesContext(): NumericSeriesContextValue {
  const { ensureInventory, handlersRef, inventory, subscribeKey } =
    useInternalValue();
  const publication = usePublicationValue();
  const { valuesByKey } = publication;
  const subscribeSeries = useCallback(
    (stream: string, fieldPath: string) =>
      subscribeKey(numericSeriesKey(stream, fieldPath)),
    [subscribeKey],
  );
  const setViewportDemand = useCallback(
    (demandId: string, demand: NumericSeriesViewportDemand | null) => {
      const previous = publication.viewports.get(demandId);
      if (sameViewportDemand(previous, demand)) return;
      if (demand) publication.viewports.set(demandId, demand);
      else publication.viewports.delete(demandId);
      // Follow motion is already driven by the throttled playhead feed. Only
      // pin/unpin or a pinned resize/range change needs a demand fill here.
      if (demand?.mode === "pinned" || previous?.mode === "pinned") {
        handlersRef.current?.onDemandChanged();
      }
    },
    [handlersRef, publication],
  );
  return useMemo(
    () => ({
      ensureEnumeration: ensureInventory,
      enumeration: inventory,
      seriesByKey: valuesByKey,
      setViewportDemand,
      subscribeSeries,
    }),
    [
      ensureInventory,
      inventory,
      setViewportDemand,
      subscribeSeries,
      valuesByKey,
    ],
  );
}

/** Subscribes one plot to only the series keys it currently renders. */
export function useNumericSeriesStates(
  keys: readonly string[],
): ReadonlyMap<string, NumericSeriesState> {
  const { store } = usePublicationValue();
  const subscription = useMemo(() => {
    let revision = 0;
    return {
      getSnapshot: () => revision,
      subscribe: (listener: () => void) => {
        const unsubscribes = keys.map((key) =>
          store.subscribe(key, () => {
            revision += 1;
            listener();
          }),
        );
        return () => {
          for (const unsubscribe of unsubscribes) unsubscribe();
        };
      },
    };
  }, [keys, store]);
  const revision = useSyncExternalStore(
    subscription.subscribe,
    subscription.getSnapshot,
    subscription.getSnapshot,
  );
  return useMemo(() => {
    // The store owns values outside React; the revision invalidates this
    // selected-key snapshot after its frame-coalesced publication.
    void revision;
    return new Map(
      keys.flatMap((key) => {
        const state = store.getSnapshot(key);
        return state ? [[key, state] as const] : [];
      }),
    );
  }, [keys, revision, store]);
}

/**
 * Bridge that services numeric-series demand against the shared resource
 * client, respecting the same bounded-reach principle as the rest of the
 * playback system: it fetches a quantized follow window or the pinned chart
 * viewport, keys retained tiles by resolution, assembles only visible parts,
 * and stands down while the link is starved (same gate as pose trajectories).
 * All reads ride the bulk lane; the byte layer's shared cache remains shared
 * with playback. Without a playback store it falls back to one compatibility
 * result per signal.
 */
export function NumericSeriesBridge({
  capability,
  sourceKey,
}: {
  readonly capability: NumericSeriesCapability | null;
  readonly sourceKey: string | null;
}) {
  const { handlersRef, inventoryReplay, refCountsRef, reset, setInventory } =
    useInternalValue();
  const publication = usePublicationValue();
  // Nullable on purpose: callers inside the playback shell provide the
  // store (enabling windowing and the network-health gate); standalone
  // callers and tests get null and unbounded single fetches.
  const playbackStore = useContext(PlaybackStoreContext);
  const dataStream = useDataStream();
  const dataStreamRef = useRef(dataStream);
  dataStreamRef.current = dataStream;

  // This effect owns one source epoch: resolution tiles, demand handlers, and
  // the follow/pinned fill loop. It fully resets when the source changes;
  // retained data stays within the source-local LRU budget.
  useEffect(() => {
    reset();
    publication.valuesByKey.clear();
    const publicationEpoch = publication.store.beginSourceEpoch();
    if (!capability || !sourceKey) {
      publicationEpoch.cancel();
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
    const legacyCoverage = new Map<string, NsRange[]>();
    const pinnedCacheKeys = new Set<string>();
    let tileCache: NumericSeriesTileCache | undefined;
    let tileOriginNs: bigint | undefined;
    const published = publication.valuesByKey;
    const publishedHorizonKeys = new Map<string, string>();
    const setPublished = (key: string, state: NumericSeriesState) => {
      published.set(key, state);
      publicationEpoch.set(key, state);
    };
    const truncatedKeys = new Set<string>();
    const failures = createDemandFailureBackoff<string>();
    const cacheForOrigin = (timeOriginNs: bigint) => {
      if (tileCache && tileOriginNs !== timeOriginNs) {
        throw new Error("Numeric series tile origin changed within one source");
      }
      if (!tileCache) {
        tileOriginNs = timeOriginNs;
        tileCache = createNumericSeriesTileCache({
          maxBytes: NUMERIC_TILE_CACHE_MAX_BYTES,
          maxTiles: NUMERIC_TILE_CACHE_MAX_TILES,
          timeOriginNs,
        });
      }
      return tileCache;
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
    const putResult = ({
      baseTimeNs,
      bucketDurationNs,
      fields,
      ranges,
      stream,
      truncated,
    }: {
      readonly baseTimeNs: bigint;
      readonly bucketDurationNs: bigint;
      readonly fields: readonly {
        readonly bucketIndexes?: BigInt64Array;
        readonly path: string;
        readonly timesSec: Float64Array;
        readonly values: Float64Array;
      }[];
      readonly ranges: readonly NsRange[];
      readonly stream: string;
      readonly truncated: boolean;
    }) => {
      const cache = cacheForOrigin(baseTimeNs);
      for (const field of fields) {
        const key = numericSeriesKey(stream, field.path);
        failures.clear(key);
        if (truncated) {
          truncatedKeys.add(key);
        }
        for (const range of ranges) {
          const missingRanges = cache.assembleVisible({
            bucketDurationNs,
            range,
            seriesKey: key,
          }).unreadRanges;
          for (const missingRange of missingRanges) {
            const sliced = sliceNumericFieldToRange(
              field,
              baseTimeNs,
              missingRange,
            );
            cache.put({
              bucketDurationNs,
              ...(sliced.bucketIndexes
                ? { bucketIndexes: sliced.bucketIndexes }
                : {}),
              coverageRanges: [missingRange],
              range: missingRange,
              seriesKey: key,
              timesSec: sliced.timesSec,
              unavailableRanges: [],
              values: sliced.values,
            });
          }
        }
      }
    };
    const putUnavailable = (
      selections: readonly NumericSeriesSliceSelection[],
      rangesByStream: ReadonlyMap<string, readonly NsRange[]>,
      bucketDurationNs: bigint,
      timeOriginNs: bigint,
    ) => {
      const cache = cacheForOrigin(timeOriginNs);
      for (const selection of selections) {
        const ranges = rangesByStream.get(selection.stream) ?? [];
        for (const field of selection.fields) {
          const key = numericSeriesKey(selection.stream, field);
          for (const range of ranges) {
            const missingRanges = cache.assembleVisible({
              bucketDurationNs,
              range,
              seriesKey: key,
            }).unreadRanges;
            for (const missingRange of missingRanges) {
              cache.put({
                bucketDurationNs,
                coverageRanges: [],
                range: missingRange,
                seriesKey: key,
                timesSec: new Float64Array(),
                unavailableRanges: [missingRange],
                values: new Float64Array(),
              });
            }
          }
        }
      }
    };
    const putKnownEmpty = (
      selections: readonly NumericSeriesSliceSelection[],
      rangesByStream: ReadonlyMap<string, readonly NsRange[]>,
      bucketDurationNs: bigint,
      timeOriginNs: bigint,
    ) => {
      const cache = cacheForOrigin(timeOriginNs);
      for (const selection of selections) {
        const ranges = rangesByStream.get(selection.stream) ?? [];
        for (const field of selection.fields) {
          const key = numericSeriesKey(selection.stream, field);
          for (const range of ranges) {
            const missingRanges = cache.assembleVisible({
              bucketDurationNs,
              range,
              seriesKey: key,
            }).unreadRanges;
            for (const missingRange of missingRanges) {
              cache.put({
                bucketDurationNs,
                coverageRanges: [missingRange],
                range: missingRange,
                seriesKey: key,
                timesSec: new Float64Array(),
                unavailableRanges: [],
                values: new Float64Array(),
              });
            }
          }
        }
      }
    };
    const publishVisible = (
      selections: readonly NumericSeriesSliceSelection[],
      horizon: NsRange,
      bucketDurationNs: bigint,
    ) => {
      const cache = tileCache;
      if (!cache || tileOriginNs === undefined) return;
      const horizonKey = `${horizon.startNs}:${horizon.endNs}:${bucketDurationNs}`;
      const targetSeconds = numericSeriesRangeDurationSeconds(horizon);
      for (const selection of selections) {
        for (const field of selection.fields) {
          const key = numericSeriesKey(selection.stream, field);
          const assembled = cache.assembleVisible({
            bucketDurationNs,
            range: horizon,
            seriesKey: key,
          });
          const prefix = completeNumericSeriesPrefix(
            horizon,
            contiguousNumericSeriesPrefix(horizon, [
              ...assembled.coverageRanges,
              ...assembled.unavailableRanges,
            ]),
            bucketDurationNs,
          );
          if (!prefix) continue;
          const publishedHorizonKey = publishedHorizonKeys.get(key);
          if (
            published.get(key)?.status === "ready" &&
            publishedHorizonKey !== undefined &&
            publishedHorizonKey !== horizonKey &&
            prefix.endNs < horizon.endNs
          ) {
            continue;
          }
          const visible = cache.assembleVisible({
            bucketDurationNs,
            range: prefix,
            seriesKey: key,
          });
          const flat = flattenSeriesSegments(
            visible.parts.map((part) => ({
              bucketIndexes: part.bucketIndexes,
              endNs: part.range.endNs,
              startNs: part.range.startNs,
              timesSec: part.timesSec,
              values: part.values,
            })),
            visible.unavailableRanges,
          );
          const aggregated = aggregateAlignedNumericSeries(
            flat.timesSec,
            flat.values,
            tileOriginNs,
            bucketDurationNs,
            flat.bucketIndexes,
          );
          setPublished(key, {
            coverage: visible.coverageRanges,
            coverageSeconds: coveredNumericSeriesSeconds(
              visible.coverageRanges,
              horizon,
            ),
            status: "ready",
            targetSeconds,
            timesSec: aggregated.timesSec,
            truncated: truncatedKeys.has(key) || undefined,
            unavailable: visible.unavailableRanges,
            values: aggregated.values,
          });
          publishedHorizonKeys.set(key, horizonKey);
        }
      }
    };
    const syncPinnedCacheDemand = (
      keys: ReadonlySet<string>,
      horizon: NsRange,
      bucketDurationNs: bigint,
      timeOriginNs: bigint,
    ) => {
      const cache = cacheForOrigin(timeOriginNs);
      const nextPins = new Set<string>();
      for (const key of keys) {
        const pinId = `visible:${key}`;
        nextPins.add(pinId);
        cache.setPinnedDemand(pinId, {
          bucketDurationNs,
          range: horizon,
          seriesKey: key,
        });
      }
      for (const pinId of pinnedCacheKeys) {
        if (!nextPins.has(pinId)) cache.setPinnedDemand(pinId, null);
      }
      pinnedCacheKeys.clear();
      for (const pinId of nextPins) pinnedCacheKeys.add(pinId);
    };

    const stopBridge = startDemandBridge<
      NumericSeriesHandlers,
      NonNullable<typeof dataStream>
    >({
      dataStreamRef,
      demandDebounceMs: FIELD_SELECTION_DEBOUNCE_MS,
      deferredRetryMs: DEMAND_DEFERRED_RETRY_MS,
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
        queueImmediateFill,
        timeline,
        userInitiated,
      }) {
        const window =
          playbackStore && timeline
            ? numericSeriesDemandWindow(
                timeline,
                playheadSec,
                publication.viewports.values(),
              )
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
          for (const key of demandedKeys) {
            if (failures.isBlocked(key, now, userInitiated)) continue;
            const [stream, fieldPath] = splitNumericSeriesKey(key);
            for (const range of subtractCoveredRanges(
              fallbackRange,
              legacyCoverage.get(key) ?? [],
            )) {
              const batchKey = `${stream}\0${range.startNs}:${range.endNs}`;
              let batch = batches.get(batchKey);
              if (!batch) {
                batch = { fields: new Set(), range, stream };
                batches.set(batchKey, batch);
              }
              batch.fields.add(fieldPath);
              legacyCoverage.set(
                key,
                addCoveredRange(legacyCoverage.get(key) ?? [], range),
              );
              if (!published.has(key)) {
                setPublished(key, { status: "loading" });
              }
            }
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
                const bucketDurationNs = numericSeriesBucketDurationNs(
                  batch.range,
                  numericSeriesWindowPointBudget(
                    batch.range,
                    timeline?.durationSec,
                  ),
                );
                putResult({
                  baseTimeNs: result.baseTimeNs,
                  bucketDurationNs,
                  fields: result.fields,
                  ranges: [batch.range],
                  stream: batch.stream,
                  truncated: result.truncated,
                });
                publishVisible(
                  [{ fields, stream: batch.stream }],
                  batch.range,
                  bucketDurationNs,
                );
                queueImmediateFill();
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
                  legacyCoverage.set(
                    key,
                    removeCoveredRange(
                      legacyCoverage.get(key) ?? [],
                      batch.range,
                    ),
                  );
                  if (refCountsRef.current.has(key)) {
                    failures.record(key, failedNow);
                    if (!published.get(key)?.timesSec?.length) {
                      setPublished(key, { error: message, status: "error" });
                    }
                  }
                }
                later(queueImmediateFill, DEMAND_FAILURE_BACKOFF_MS);
              });
          }
          return;
        }
        if (!timeline) {
          return;
        }
        const maxPointsPerField = numericSeriesDemandPointBudget(
          window,
          timeline.durationSec,
          publication.viewports.values(),
        );
        const bucketDurationNs = numericSeriesBucketDurationNs(
          window,
          maxPointsPerField,
        );
        // Chronological admission makes every publishable replacement a
        // stable prefix that can extend only at its right edge.
        const preferredTimeNs = window.startNs;
        const horizonKey = `${window.startNs}:${window.endNs}:${bucketDurationNs}`;
        const cache = cacheForOrigin(timeline.startTimeNs);
        syncPinnedCacheDemand(
          demandedKeys,
          window,
          bucketDurationNs,
          timeline.startTimeNs,
        );
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

        if (job?.notBeforeMs !== undefined && now < job.notBeforeMs) {
          later(queueImmediateFill, job.notBeforeMs - now);
          return;
        }

        if (!job) {
          const missing = new Map<string, readonly NsRange[]>();
          const candidates: NsRange[] = [];
          for (const key of demandedKeys) {
            if (failures.isBlocked(key, now, userInitiated)) continue;
            const ranges = cache.assembleVisible({
              bucketDurationNs,
              range: window,
              seriesKey: key,
            }).unreadRanges;
            if (ranges.length === 0) {
              continue;
            }
            missing.set(key, ranges);
            candidates.push(...ranges);
            if (!published.has(key)) {
              setPublished(key, { status: "loading" });
            }
          }
          const range = nearestNumericSeriesRange(candidates, preferredTimeNs);
          if (!range) {
            publishVisible(
              selectionsForNumericSeriesKeys(demandedKeys),
              window,
              bucketDurationNs,
            );
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
            bucketDurationNs,
            horizon: window,
            horizonKey,
            pageCount: 0,
            preferredTimeNs,
            range,
            selections: [...fieldsByStream].map(([stream, fields]) => ({
              fields: [...fields],
              stream,
            })),
          };
        }

        const sliceJob: NumericSliceJob = job;
        pendingSlice = undefined;
        const controller = new AbortController();
        activeSlice = { controller, job: sliceJob };
        const isFirstPage = sliceJob.continuation === undefined;
        void capability
          .readNumericSeriesSlice({
            absoluteBudget: ABSOLUTE_NUMERIC_SOURCE_UNIT_BUDGET,
            absoluteMaxChunks: ABSOLUTE_NUMERIC_SOURCE_UNIT_MAX_CHUNKS,
            bucketDurationNs: sliceJob.bucketDurationNs,
            budget: isFirstPage
              ? FIRST_NUMERIC_SLICE_BUDGET
              : STEADY_NUMERIC_SLICE_BUDGET,
            continuation: sliceJob.continuation,
            maxChunks: isFirstPage
              ? FIRST_NUMERIC_SLICE_MAX_CHUNKS
              : STEADY_NUMERIC_SLICE_MAX_CHUNKS,
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
            const hasNewProgress = sliceJob.selections.some((selection) => {
              const reported = [
                ...(result.coverageByStream.get(selection.stream) ?? []),
                ...(result.unavailableByStream?.get(selection.stream) ?? []),
              ];
              return selection.fields.some((field) => {
                const seriesKey = numericSeriesKey(selection.stream, field);
                return reported.some(
                  (range) =>
                    cache.assembleVisible({
                      bucketDurationNs: sliceJob.bucketDurationNs,
                      range,
                      seriesKey,
                    }).unreadRanges.length > 0,
                );
              });
            });
            if (result.continuation && !hasNewProgress) {
              throw new Error("Numeric series slice made no bounded progress");
            }

            const timeOriginNs =
              result.series[0]?.baseTimeNs ?? timeline.startTimeNs;
            for (const selection of sliceJob.selections) {
              const skipped =
                result.unavailableByStream?.get(selection.stream) ?? [];
              for (const field of selection.fields) {
                const key = numericSeriesKey(selection.stream, field);
                failures.clear(key);
                if (skipped.length > 0) {
                  truncatedKeys.add(key);
                }
              }
            }

            for (const series of result.series) {
              putResult({
                baseTimeNs: series.baseTimeNs,
                bucketDurationNs: sliceJob.bucketDurationNs,
                fields: series.fields,
                ranges: result.coverageByStream.get(series.streamId) ?? [],
                stream: series.streamId,
                truncated:
                  series.truncated ||
                  (result.unavailableByStream?.get(series.streamId)?.length ??
                    0) > 0,
              });
            }
            putUnavailable(
              sliceJob.selections,
              result.unavailableByStream ?? new Map(),
              sliceJob.bucketDurationNs,
              timeOriginNs,
            );
            const inspectedThroughNs = result.continuation
              ? result.resumeAtNs !== undefined
                ? result.resumeAtNs - 1n
                : undefined
              : result.stopReason === "horizon-reached" ||
                  result.stopReason === "oversized-source-unit" ||
                  result.stopReason === "source-exhausted"
                ? sliceJob.range.endNs
                : undefined;
            if (
              inspectedThroughNs !== undefined &&
              inspectedThroughNs >= sliceJob.range.startNs
            ) {
              putKnownEmpty(
                sliceJob.selections,
                new Map(
                  sliceJob.selections.map((selection) => [
                    selection.stream,
                    [
                      {
                        endNs: inspectedThroughNs,
                        startNs: sliceJob.range.startNs,
                      },
                    ],
                  ]),
                ),
                sliceJob.bucketDurationNs,
                timeOriginNs,
              );
            }
            publishVisible(
              sliceJob.selections,
              sliceJob.horizon,
              sliceJob.bucketDurationNs,
            );

            const nextPageCount = sliceJob.pageCount + 1;
            if (
              result.continuation &&
              nextPageCount < MAX_NUMERIC_SLICE_PAGES_PER_EPOCH
            ) {
              pendingSlice = {
                ...sliceJob,
                continuation: result.continuation,
                notBeforeMs: undefined,
                pageCount: nextPageCount,
              };
              queueImmediateFill();
            } else {
              pendingSlice = undefined;
              if (result.continuation) {
                const pausedAt = nowMs();
                pendingSlice = {
                  ...sliceJob,
                  continuation: result.continuation,
                  notBeforeMs: pausedAt + DEMAND_FAILURE_BACKOFF_MS,
                  pageCount: 0,
                };
                for (const selection of sliceJob.selections) {
                  for (const field of selection.fields) {
                    failures.record(
                      numericSeriesKey(selection.stream, field),
                      pausedAt,
                    );
                  }
                }
                later(queueImmediateFill, DEMAND_FAILURE_BACKOFF_MS);
              } else {
                queueImmediateFill();
              }
            }
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
                  if (!published.get(key)?.timesSec?.length) {
                    setPublished(key, { error: message, status: "error" });
                  }
                }
              }
            }
            later(queueImmediateFill, DEMAND_FAILURE_BACKOFF_MS);
          });
      },
      playbackStore,
      playheadThrottleMs: PLAYHEAD_FILL_THROTTLE_MS,
      refCountsRef,
      requireTimeline: Boolean(playbackStore),
      shouldDeferIdleWork: (store) => shouldDeferIdleWorkForStore(store, null),
      timelineRetryMs: DEMAND_TIMELINE_RETRY_MS,
    });

    return () => {
      abortActiveWork();
      stopBridge();
      publicationEpoch.cancel();
      publication.store.reset();
      publication.valuesByKey.clear();
    };
  }, [
    capability,
    handlersRef,
    inventoryReplay,
    playbackStore,
    publication,
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

function usePublicationValue(): NumericSeriesPublicationContextValue {
  const value = useContext(numericSeriesPublicationContext);
  if (!value) {
    throw new Error(
      "episode numeric series must be used inside <NumericSeriesProvider>",
    );
  }
  return value;
}

function scheduleNumericSeriesFrame(publish: () => void): () => void {
  if (typeof requestAnimationFrame === "function") {
    const frame = requestAnimationFrame(publish);
    return () => cancelAnimationFrame(frame);
  }
  const timeout = setTimeout(publish, 16);
  return () => clearTimeout(timeout);
}

function numericSeriesDemandWindow(
  timeline: TimelineIndex,
  playheadSec: number,
  viewports: Iterable<NumericSeriesViewportDemand>,
): NsRange {
  const pinned = smallestPinnedViewport(viewports);
  if (!pinned) return quantizedNumericSeriesWindow(timeline, playheadSec);
  const startSec = Math.max(0, Math.min(pinned.startSec, pinned.endSec));
  const endSec = Math.min(
    timeline.durationSec,
    Math.max(pinned.startSec, pinned.endSec),
  );
  const startNs = timeline.secToNs(startSec);
  const endNs = timeline.secToNs(endSec);
  return endNs >= startNs ? { endNs, startNs } : { endNs: startNs, startNs };
}

function numericSeriesDemandPointBudget(
  range: NsRange,
  durationSec: number,
  viewports: Iterable<NumericSeriesViewportDemand>,
): number {
  const viewportList = [...viewports];
  const pinned = smallestPinnedViewport(viewportList);
  const viewport = pinned ?? widestViewport(viewportList);
  if (!viewport) return numericSeriesWindowPointBudget(range, durationSec);
  return Math.max(
    ALIGNED_NUMERIC_BUCKET_MAX_POINTS,
    Math.min(
      MAX_NUMERIC_REPRESENTATIVE_POINTS,
      Math.round(viewport.pixelWidth) * ALIGNED_NUMERIC_BUCKET_MAX_POINTS,
    ),
  );
}

function numericSeriesBucketDurationNs(
  range: NsRange,
  maxPoints: number,
): bigint {
  const spanNs = range.endNs - range.startNs + 1n;
  const buckets = Math.max(
    2,
    Math.min(
      Math.floor(
        MAX_NUMERIC_REPRESENTATIVE_POINTS / ALIGNED_NUMERIC_BUCKET_MAX_POINTS,
      ),
      Math.floor(maxPoints / ALIGNED_NUMERIC_BUCKET_MAX_POINTS),
    ),
  );
  const intervals = BigInt(buckets - 1);
  return (spanNs + intervals - 1n) / intervals;
}

function smallestPinnedViewport(
  viewports: Iterable<NumericSeriesViewportDemand>,
): NumericSeriesViewportDemand | undefined {
  return [...viewports]
    .filter((viewport) => viewport.mode === "pinned")
    .sort(
      (left, right) =>
        left.endSec - left.startSec - (right.endSec - right.startSec),
    )[0];
}

function widestViewport(
  viewports: Iterable<NumericSeriesViewportDemand>,
): NumericSeriesViewportDemand | undefined {
  let widest: NumericSeriesViewportDemand | undefined;
  for (const viewport of viewports) {
    if (!widest || viewport.pixelWidth > widest.pixelWidth) widest = viewport;
  }
  return widest;
}

function selectionsForNumericSeriesKeys(
  keys: Iterable<string>,
): readonly NumericSeriesSliceSelection[] {
  const fieldsByStream = new Map<string, string[]>();
  for (const key of keys) {
    const [stream, field] = splitNumericSeriesKey(key);
    const fields = fieldsByStream.get(stream) ?? [];
    fields.push(field);
    fieldsByStream.set(stream, fields);
  }
  return [...fieldsByStream].map(([stream, fields]) => ({ fields, stream }));
}

function sameViewportDemand(
  left: NumericSeriesViewportDemand | undefined,
  right: NumericSeriesViewportDemand | null,
): boolean {
  return (
    left === right ||
    (left === undefined && right === null) ||
    (left !== undefined &&
      right !== null &&
      left.endSec === right.endSec &&
      left.mode === right.mode &&
      left.pixelWidth === right.pixelWidth &&
      left.startSec === right.startSec)
  );
}
