// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// hook has direct unit tests.
import {
  getIsPlayPending,
  getIsPlaying,
  isPlayingAtom,
  PlaybackStoreContext,
  seekEventAtom,
  subscribeIsPlayPending,
} from "@fiftyone/playback/runtime";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Quaternion, Vector3 } from "three";
import type { LoadStatus } from "../../../../runtime";
import type {
  EpisodeFrameTransformPolicy,
  EpisodeFrameTransformResolution,
  EpisodeFrameTransformTimeRange,
  EpisodeParentFrameTransformResolution,
} from "../../../../runtime/frame-transform-types";
import { compareBigInt, type TransformSample } from "../../../../ir";
import { errorMessage } from "../../status/error-message";
import {
  isEpisodeReadCancelledError,
  type TransformPlacementReadResult,
  type TransformReadAcceleration,
} from "../../../../ports";
import {
  EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
  EpisodeFrameTransformStore,
  type EpisodeFrameGraphSummary,
} from "../../../../runtime/frame-transforms";
import { shouldDeferIdleWorkForStore } from "../../playback/network-health";

// Placement reads are foreground work: keep them small so pending Play is not
// blocked by transform runway decoding. The idle runway keeps playback smooth
// once the first truthy placement is available.
const DYNAMIC_TRANSFORM_LOOKBACK_NS = 500_000_000n;
const DYNAMIC_TRANSFORM_PLACEMENT_LOOKAHEAD_NS = 1_000_000_000n;
const PAUSED_TRANSFORM_PLACEMENT_LOOKAHEAD_NS = 250_000_000n;
const EXACT_PLACEMENT_CADENCE_MULTIPLIER = 3n;
const DYNAMIC_TRANSFORM_RUNWAY_LOOKAHEAD_NS = 4_000_000_000n;
const DYNAMIC_TRANSFORM_RUNWAY_REFRESH_LOOKAHEAD_NS = 2_000_000_000n;
const DYNAMIC_TRANSFORM_RUNWAY_SEGMENT_NS = 1_500_000_000n;
const DYNAMIC_TRANSFORM_RUNWAY_OVERLAP_NS = 100_000_000n;
const DYNAMIC_TRANSFORM_RETRY_BASE_DELAY_MS = 250;
const DYNAMIC_TRANSFORM_WINDOW_MAX_RETRIES = 3;

export type FrameTransformsStatus = LoadStatus;

/**
 * Resolves a frame transform at a playback time.
 */
export type FrameTransformResolver = (
  sourceFrameId: string,
  targetFrameId: string,
  timeNs: bigint,
) => EpisodeFrameTransformResolution;

/** Resolves a frame into its active immediate parent at a playback time. */
export type ParentFrameTransformResolver = (
  sourceFrameId: string,
  timeNs: bigint,
) => EpisodeParentFrameTransformResolution;

export type FrameGraphSummarizer = (
  dataBearingFrameIds: ReadonlySet<string>,
) => EpisodeFrameGraphSummary;

export type FramePlacementReadinessStatus =
  | "ready"
  | "loading"
  | "needsFetch"
  | "definitiveMissing";

export interface FramePlacementReadiness {
  readonly frameIds: readonly string[];
  readonly status: FramePlacementReadinessStatus;
}

export type FramePlacementReadinessGetter = ({
  frameIds,
  targetFrameId,
  timeNs,
}: {
  readonly frameIds: readonly string[];
  readonly targetFrameId: string;
  readonly timeNs?: bigint;
}) => FramePlacementReadiness;

export interface FramePlacementScope {
  readonly frameIds: readonly string[];
  readonly targetFrameId: string;
}

export type FramePlacementPrefetcher = (
  timeNs: bigint,
  scope?: FramePlacementScope,
) => void;

/** Source-scoped transform graph, placement resolver, and load state. */
export interface FrameTransformsState {
  readonly error: string | null;
  readonly frameIds: readonly string[];
  readonly getPlacementReadiness: FramePlacementReadinessGetter;
  readonly indexedDynamicRanges: () => readonly EpisodeFrameTransformTimeRange[];
  /** Whether transform discovery for a playhead has completed or exhausted retries. */
  readonly isPlacementTimeSettled?: (timeNs: bigint) => boolean;
  readonly prefetchPlacement: FramePlacementPrefetcher;
  /** Registers a persistent consumer scope used to bound placement reads. */
  readonly registerPlacementScope?: (scope: FramePlacementScope) => () => void;
  readonly resolve: FrameTransformResolver;
  readonly resolveParent?: ParentFrameTransformResolver;
  readonly status: FrameTransformsStatus;
  readonly summarizeGraph: FrameGraphSummarizer;
  /** Changes only when the normalized transform edge inventory changes. */
  readonly topologyRevision?: number;
}

export interface UseFrameTransformsOptions {
  readonly capability: TransformReadAcceleration | null;
  /**
   * Offline playback path: when the source timeline range is known, use a
   * small foreground placement read plus a sliding idle runway around playback.
   * `null` means the timeline range is still loading; `undefined` keeps the
   * demand-driven fallback for callers that do not have a timeline range.
   */
  readonly dynamicRange?: EpisodeFrameTransformTimeRange | null;
  readonly policy?: EpisodeFrameTransformPolicy;
  readonly sourceKey: string | null;
  readonly timeNs?: bigint;
}

interface FrameTransformsInternalState {
  readonly error: string | null;
  readonly status: FrameTransformsStatus;
  readonly version: number;
}

type PlacementReadResult =
  | {
      readonly kind: "exact";
      readonly placement: TransformPlacementReadResult;
    }
  | {
      readonly indexedRange: EpisodeFrameTransformTimeRange;
      readonly kind: "window";
      readonly samples: readonly TransformSample[];
    };

const IDLE_FRAME_TRANSFORMS_STATE = {
  error: null,
  status: "idle" as const,
};

/**
 * Loads eager frame transforms and incrementally prefetches dynamic windows.
 */
export function useFrameTransforms({
  capability,
  dynamicRange,
  policy,
  sourceKey,
  timeNs,
}: UseFrameTransformsOptions): FrameTransformsState {
  const storeRef = useRef<EpisodeFrameTransformStore | null>(null);
  const [state, setState] = useState<FrameTransformsInternalState>({
    ...IDLE_FRAME_TRANSFORMS_STATE,
    version: 0,
  });
  const [hasPlayIntent, setHasPlayIntent] = useState(false);
  const inFlightPlacementRangesRef = useRef<
    readonly EpisodeFrameTransformTimeRange[]
  >([]);
  const surrenderedPlacementRangesRef = useRef<
    readonly EpisodeFrameTransformTimeRange[]
  >([]);
  const inFlightRunwayRangesRef = useRef<
    readonly EpisodeFrameTransformTimeRange[]
  >([]);
  const retryCountRef = useRef<Map<string, number>>(new Map());
  const retryTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const runwayRangeKeyRef = useRef<string | null>(null);
  const placementScopesRef = useRef(new Map<symbol, FramePlacementScope>());
  const discontinuousPlacementRequestedRef = useRef(false);
  const sourceGenerationRef = useRef(0);
  // Nullable on purpose: callers inside the playback shell provide the store
  // (enabling the idle-work gate); standalone callers and tests get null and
  // keep ungated behavior.
  const playbackStore = useContext(PlaybackStoreContext);
  const dynamicRangeMode =
    dynamicRange === null
      ? "pending"
      : dynamicRange === undefined
        ? "fallback"
        : "range";
  const boundaryClampNs = policy?.boundaryClampNs;

  // A paused seek needs only current placement. Subscribe explicitly so a
  // later Play press re-opens idle runway work even before the clock advances.
  useEffect(() => {
    if (!playbackStore) {
      setHasPlayIntent(false);
      return undefined;
    }
    const update = () => {
      setHasPlayIntent(
        getIsPlaying(playbackStore) || getIsPlayPending(playbackStore),
      );
    };
    update();
    const unsubscribePlaying = playbackStore.sub(isPlayingAtom, update);
    const unsubscribePending = subscribeIsPlayPending(playbackStore, update);
    return () => {
      unsubscribePlaying();
      unsubscribePending();
    };
  }, [playbackStore]);

  const registerPlacementScope = useCallback((scope: FramePlacementScope) => {
    const normalized = normalizePlacementScope(scope);
    if (!normalized) return () => undefined;

    const token = Symbol("frame-placement-scope");
    placementScopesRef.current.set(token, normalized);
    setState((current) => ({
      ...current,
      version: current.version + 1,
    }));
    return () => {
      if (!placementScopesRef.current.delete(token)) return;
      setState((current) => ({
        ...current,
        version: current.version + 1,
      }));
    };
  }, []);

  // This effect resets transform state when the source changes and loads the
  // initial static transform bootstrap before dynamic windows are requested.
  useEffect(() => {
    const retryTimeouts = retryTimeoutsRef.current;
    clearRetryTimeouts(retryTimeouts);
    runwayRangeKeyRef.current = null;
    inFlightPlacementRangesRef.current = [];
    surrenderedPlacementRangesRef.current = [];
    inFlightRunwayRangesRef.current = [];
    discontinuousPlacementRequestedRef.current = false;
    retryCountRef.current.clear();
    sourceGenerationRef.current += 1;
    const sourceGeneration = sourceGenerationRef.current;
    storeRef.current = null;

    if (!sourceKey || !capability) {
      setState({
        ...IDLE_FRAME_TRANSFORMS_STATE,
        version: sourceGeneration,
      });
      return undefined;
    }

    if (dynamicRangeMode === "pending") {
      setState({
        error: null,
        status: "loading",
        version: sourceGeneration,
      });
      return undefined;
    }

    const store = new EpisodeFrameTransformStore();
    storeRef.current = store;
    let active = true;
    setState({
      error: null,
      status: "loading",
      version: sourceGeneration,
    });

    Promise.resolve(capability.readBootstrap?.() ?? [])
      .then((samples) => {
        if (!active || sourceGeneration !== sourceGenerationRef.current) {
          return;
        }

        store.addStatic(samples.map(runtimeTransformSample));
        setState((current) => ({
          ...current,
          error: null,
          status: "ready",
          version: current.version + 1,
        }));
      })
      .catch((caughtError) => {
        if (!active || sourceGeneration !== sourceGenerationRef.current) {
          return;
        }

        setState((current) => ({
          ...current,
          error: errorMessage(caughtError),
          status: "error",
          version: current.version + 1,
        }));
      });

    return () => {
      active = false;
      clearRetryTimeouts(retryTimeouts);
    };
  }, [capability, dynamicRangeMode, sourceKey]);

  // This effect makes exhausted placement windows retryable after an explicit
  // seek, which is a deliberate request to revisit the active transform time.
  useEffect(() => {
    if (!playbackStore) {
      return undefined;
    }
    return playbackStore.sub(seekEventAtom, () => {
      // The seek event is the synchronous authority for a discontinuous
      // playhead move. React's isPlaying subscription can still reflect the
      // pre-seek state when the new placement request reaches this hook.
      discontinuousPlacementRequestedRef.current = true;
      if (surrenderedPlacementRangesRef.current.length === 0) {
        return;
      }
      surrenderedPlacementRangesRef.current = [];
      setState((current) => ({
        ...current,
        version: current.version + 1,
      }));
    });
  }, [playbackStore]);

  const requestPlacementRangeForTime = useCallback(
    (requestTimeNs: bigint, requestScope?: FramePlacementScope) => {
      const store = storeRef.current;
      if (dynamicRangeMode === "pending") {
        return;
      }
      if (!sourceKey || !capability || !store || state.status !== "ready") {
        return;
      }

      if (
        store.isTimeIndexed(requestTimeNs) ||
        isTimeInRanges(inFlightPlacementRangesRef.current, requestTimeNs) ||
        isTimeInRanges(surrenderedPlacementRangesRef.current, requestTimeNs)
      ) {
        return;
      }

      // Read the store synchronously: a seek can land before React commits the
      // isPlaying subscription update from the preceding Pause click. A
      // paused (or Play-pending) placement owns only the current pose; runway
      // is a separate playback-priority read. Keep the broader window only
      // while the clock is actually moving so coverage spans multiple ticks.
      const activelyPlaying = playbackStore
        ? getIsPlaying(playbackStore)
        : false;
      const discontinuousPlacement = discontinuousPlacementRequestedRef.current;
      const exactPlacementIntent = !activelyPlaying || discontinuousPlacement;
      const fallbackRange = dynamicPlacementRangeForTime(
        requestTimeNs,
        playbackStore && exactPlacementIntent
          ? PAUSED_TRANSFORM_PLACEMENT_LOOKAHEAD_NS
          : DYNAMIC_TRANSFORM_PLACEMENT_LOOKAHEAD_NS,
      );
      const placementScopes = normalizedPlacementScopes([
        ...placementScopesRef.current.values(),
        ...(requestScope ? [requestScope] : []),
      ]);
      const requiredDynamicChildFrameIds = dynamicChildrenForPlacementScopes(
        store,
        placementScopes,
      );
      const readPlacement = capability.readPlacement;
      const maxObservedCadenceNs =
        requiredDynamicChildFrameIds === null
          ? null
          : store.maxObservedCadenceNsForChildren(requiredDynamicChildFrameIds);
      // The point path is capped at a small predecessor tail and is used only
      // when three observed cadences fit inside the 500 ms anchor lookback.
      // Sparse or uncertain children go straight to the window so a cold seek
      // can never pay both full costs.
      const useExactPlacement =
        playbackStore !== null &&
        exactPlacementIntent &&
        readPlacement !== undefined &&
        requiredDynamicChildFrameIds !== null &&
        requiredDynamicChildFrameIds.length > 0 &&
        maxObservedCadenceNs !== null &&
        maxObservedCadenceNs * EXACT_PLACEMENT_CADENCE_MULTIPLIER <=
          DYNAMIC_TRANSFORM_LOOKBACK_NS;
      const requestedRange = useExactPlacement
        ? { endTimeNs: requestTimeNs, startTimeNs: requestTimeNs }
        : fallbackRange;
      // Consume the event only once a placement read has actually been
      // admitted. If bootstrap is not ready yet, the early returns above keep
      // the intent alive for the first request at the new playhead.
      discontinuousPlacementRequestedRef.current = false;
      const requestedRangeKey = frameTransformRangeKey(requestedRange);
      const sourceGeneration = sourceGenerationRef.current;
      inFlightPlacementRangesRef.current = [
        ...inFlightPlacementRangesRef.current,
        requestedRange,
      ];
      const read: Promise<PlacementReadResult> = (async () => {
        if (
          useExactPlacement &&
          readPlacement &&
          requiredDynamicChildFrameIds
        ) {
          const placement = await readPlacement({
            requiredDynamicChildFrameIds,
            timeNs: requestTimeNs,
          });
          return placement
            ? { kind: "exact", placement }
            : readFallbackPlacement(capability, fallbackRange);
        }
        const samples = await capability.readTransforms({
          streams: [],
          window: {
            endNs: requestedRange.endTimeNs,
            startNs: requestedRange.startTimeNs,
          },
        });
        return {
          indexedRange: requestedRange,
          kind: "window",
          samples,
        };
      })();
      read
        .then(async (result) => {
          if (sourceGeneration !== sourceGenerationRef.current) {
            return;
          }

          let indexedRange: EpisodeFrameTransformTimeRange;
          if (result.kind === "exact") {
            indexedRange = {
              endTimeNs: result.placement.indexedWindow.endNs,
              startTimeNs: result.placement.indexedWindow.startNs,
            };
            storeRef.current?.addDynamic(
              result.placement.samples.map(runtimeTransformSample),
              indexedRange,
            );

            if (
              !placementScopesResolve(
                storeRef.current,
                placementScopes,
                requestTimeNs,
                boundaryClampNs,
              )
            ) {
              const fallback = await readFallbackPlacement(
                capability,
                fallbackRange,
              );
              if (sourceGeneration !== sourceGenerationRef.current) return;
              indexedRange = fallback.indexedRange;
              storeRef.current?.addDynamic(
                fallback.samples.map(runtimeTransformSample),
                indexedRange,
              );
            }
          } else {
            indexedRange = result.indexedRange;
            storeRef.current?.addDynamic(
              result.samples.map(runtimeTransformSample),
              indexedRange,
            );
          }
          retryCountRef.current.delete(requestedRangeKey);
          inFlightPlacementRangesRef.current =
            inFlightPlacementRangesRef.current.filter(
              (candidate) => candidate !== requestedRange,
            );
          setState((current) => ({
            ...current,
            error: null,
            version: current.version + 1,
          }));
        })
        .catch((caughtError) => {
          if (sourceGeneration !== sourceGenerationRef.current) {
            return;
          }

          // A newer seek supersedes placement for the old playhead. The worker
          // has already started the replacement, so cancellation is successful
          // scheduling rather than a transform failure or a reason to retry.
          if (isEpisodeReadCancelledError(caughtError)) {
            retryCountRef.current.delete(requestedRangeKey);
            inFlightPlacementRangesRef.current =
              inFlightPlacementRangesRef.current.filter(
                (candidate) => candidate !== requestedRange,
              );
            return;
          }

          const retryCount = retryCountRef.current.get(requestedRangeKey) ?? 0;
          setState((current) => ({
            ...current,
            error: errorMessage(caughtError),
          }));
          if (retryCount >= DYNAMIC_TRANSFORM_WINDOW_MAX_RETRIES) {
            retryCountRef.current.delete(requestedRangeKey);
            inFlightPlacementRangesRef.current =
              inFlightPlacementRangesRef.current.filter(
                (candidate) => candidate !== requestedRange,
              );
            surrenderedPlacementRangesRef.current = mergeTransformRanges([
              ...surrenderedPlacementRangesRef.current,
              requestedRange,
            ]);
            setState((current) => ({
              ...current,
              version: current.version + 1,
            }));
            return;
          }

          const nextRetryCount = retryCount + 1;
          retryCountRef.current.set(requestedRangeKey, nextRetryCount);
          const existingTimeout =
            retryTimeoutsRef.current.get(requestedRangeKey);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }
          const timeout = setTimeout(() => {
            retryTimeoutsRef.current.delete(requestedRangeKey);
            if (sourceGeneration !== sourceGenerationRef.current) {
              return;
            }

            inFlightPlacementRangesRef.current =
              inFlightPlacementRangesRef.current.filter(
                (candidate) => candidate !== requestedRange,
              );
            setState((current) => ({
              ...current,
              version: current.version + 1,
            }));
          }, dynamicTransformRetryDelayMs(nextRetryCount));
          retryTimeoutsRef.current.set(requestedRangeKey, timeout);
        });
    },
    [
      capability,
      dynamicRangeMode,
      boundaryClampNs,
      playbackStore,
      sourceKey,
      state.status,
    ],
  );

  // This effect warms a short transform runway on the idle lane. It stays
  // separate from the foreground placement window so playback catch-up never
  // waits behind speculative work.
  useEffect(() => {
    const store = storeRef.current;
    if (dynamicRangeMode !== "range") {
      return;
    }
    if (
      !sourceKey ||
      !capability ||
      !store ||
      state.status !== "ready" ||
      timeNs === undefined
    ) {
      return;
    }
    if (playbackStore && !hasPlayIntent) {
      return;
    }
    const coverageRange = dynamicRunwayCoverageRangeForTime(timeNs);
    if (
      store.isRangeIndexed(coverageRange) ||
      isRangeInRanges(inFlightRunwayRangesRef.current, coverageRange)
    ) {
      return;
    }
    // Ordinary runway extensions are speculative idle reads. The first
    // extension while Play is pending is demanded startup work, so it must
    // bypass the limited-network idle gate or Play could wait forever.
    const playPending = playbackStore ? getIsPlayPending(playbackStore) : false;
    if (
      playbackStore &&
      !playPending &&
      shouldDeferIdleWorkForStore(playbackStore, null)
    ) {
      return;
    }

    const runwayRange = dynamicRunwayExtensionRangeForTime({
      indexedCoverageEndNs: transformCoverageEndForTime({
        inFlightRanges: [
          ...inFlightPlacementRangesRef.current,
          ...inFlightRunwayRangesRef.current,
        ],
        store,
        timeNs,
      }),
      timeNs,
    });
    if (!runwayRange) {
      return;
    }

    const runwayRangeKey = frameTransformRangeKey(runwayRange);
    if (runwayRangeKeyRef.current === runwayRangeKey) {
      return;
    }

    runwayRangeKeyRef.current = runwayRangeKey;
    inFlightRunwayRangesRef.current = [
      ...inFlightRunwayRangesRef.current,
      runwayRange,
    ];
    const sourceGeneration = sourceGenerationRef.current;

    capability
      .readTransforms({
        // The first runway segment while Play is pending is demanded startup
        // work. Foreground priority avoids a limited-network deadlock and a
        // priority inversion behind speculative reads.
        priority: playPending ? "playback" : "idle",
        streams: [],
        window: {
          endNs: runwayRange.endTimeNs,
          startNs: runwayRange.startTimeNs,
        },
      })
      .then((samples) => {
        if (sourceGeneration !== sourceGenerationRef.current) {
          return;
        }

        storeRef.current?.addDynamic(
          samples.map(runtimeTransformSample),
          runwayRange,
        );
        inFlightRunwayRangesRef.current =
          inFlightRunwayRangesRef.current.filter(
            (candidate) => candidate !== runwayRange,
          );
        setState((current) => ({
          ...current,
          error: null,
          version: current.version + 1,
        }));
      })
      .catch((caughtError) => {
        if (sourceGeneration !== sourceGenerationRef.current) {
          return;
        }

        if (runwayRangeKeyRef.current === runwayRangeKey) {
          runwayRangeKeyRef.current = null;
        }
        inFlightRunwayRangesRef.current =
          inFlightRunwayRangesRef.current.filter(
            (candidate) => candidate !== runwayRange,
          );
        // A seek-cancelled runway read is not a transform error: in-flight
        // tracking is already cleared above, so the next playhead move can
        // simply re-request the window.
        if (isEpisodeReadCancelledError(caughtError)) {
          return;
        }
        setState((current) => ({
          ...current,
          error: errorMessage(caughtError),
          version: current.version + 1,
        }));
      });
  }, [
    capability,
    dynamicRangeMode,
    hasPlayIntent,
    playbackStore,
    sourceKey,
    state.status,
    state.version,
    timeNs,
  ]);

  // This effect requests the dynamic transform window around the active
  // playback time when the resolver has not already indexed that time for the
  // current source.
  useLayoutEffect(() => {
    if (timeNs !== undefined) {
      requestPlacementRangeForTime(timeNs);
    }

    return undefined;
  }, [requestPlacementRangeForTime, state.version, timeNs]);

  // The store is mutated in place; `state.version` is the cache-busting signal
  // that tells memoized consumers (frameIds, resolve, downstream renderers) to
  // recompute. eslint can't see the version inside `storeRef.current`.
  const frameIds = useMemo(
    () => storeRef.current?.frameIds() ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.version],
  );
  const resolve = useCallback<FrameTransformResolver>(
    (sourceFrameId, targetFrameId, requestTimeNs) =>
      storeRef.current?.resolve({
        ...(policy ? { policy } : {}),
        sourceFrameId,
        targetFrameId,
        timeNs: requestTimeNs,
      }) ?? {
        sourceFrameId,
        status: "missing",
        targetFrameId,
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [policy?.boundaryClampNs, state.version],
  );
  const resolveParent = useCallback<ParentFrameTransformResolver>(
    (sourceFrameId, requestTimeNs) =>
      storeRef.current?.resolveParent({
        ...(policy ? { policy } : {}),
        sourceFrameId,
        timeNs: requestTimeNs,
      }) ?? {
        sourceFrameId,
        status: "missing",
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [policy?.boundaryClampNs, state.version],
  );
  const getPlacementReadiness = useCallback<FramePlacementReadinessGetter>(
    ({ frameIds: requestedFrameIds, targetFrameId, timeNs: requestTimeNs }) => {
      const frameIds = uniqueNonEmptySortedFrameIds(requestedFrameIds).filter(
        (frameId) => frameId !== targetFrameId,
      );
      if (
        frameIds.length === 0 ||
        !targetFrameId ||
        requestTimeNs === undefined
      ) {
        return { frameIds: [], status: "ready" };
      }

      if (state.status === "loading" || dynamicRangeMode === "pending") {
        return { frameIds, status: "loading" };
      }

      const store = storeRef.current;
      if (!store || state.status === "error" || state.status === "idle") {
        return { frameIds, status: "definitiveMissing" };
      }

      const pendingFrameIds: string[] = [];
      const missingFrameIds: string[] = [];
      for (const frameId of frameIds) {
        const resolution = store.resolve({
          ...(policy ? { policy } : {}),
          sourceFrameId: frameId,
          targetFrameId,
          timeNs: requestTimeNs,
        });
        if (resolution.status === "resolved") {
          continue;
        }
        if (resolution.status === "pending") {
          pendingFrameIds.push(frameId);
        } else {
          missingFrameIds.push(frameId);
        }
      }

      const unresolvedFrameIds = [...missingFrameIds, ...pendingFrameIds].sort(
        compareStrings,
      );
      if (
        unresolvedFrameIds.length > 0 &&
        isTimeInRanges(inFlightPlacementRangesRef.current, requestTimeNs)
      ) {
        return { frameIds: unresolvedFrameIds, status: "loading" };
      }
      if (missingFrameIds.length > 0) {
        return {
          frameIds: missingFrameIds.sort(compareStrings),
          status: "definitiveMissing",
        };
      }
      if (pendingFrameIds.length === 0) {
        return { frameIds: [], status: "ready" };
      }
      if (
        isTimeInRanges(surrenderedPlacementRangesRef.current, requestTimeNs)
      ) {
        return {
          frameIds: pendingFrameIds.sort(compareStrings),
          status: "definitiveMissing",
        };
      }
      if (isTimeInRanges(inFlightPlacementRangesRef.current, requestTimeNs)) {
        return {
          frameIds: pendingFrameIds.sort(compareStrings),
          status: "loading",
        };
      }
      return {
        frameIds: pendingFrameIds.sort(compareStrings),
        status: "needsFetch",
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dynamicRangeMode, policy?.boundaryClampNs, state.status, state.version],
  );
  const indexedDynamicRanges = useCallback(
    () => storeRef.current?.indexedRanges() ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.version],
  );
  const isPlacementTimeSettled = useCallback(
    (requestTimeNs: bigint) => {
      if (state.status === "error") return true;
      if (state.status !== "ready" || dynamicRangeMode === "pending") {
        return false;
      }
      return (
        (storeRef.current?.isTimeIndexed(requestTimeNs) ?? false) ||
        isTimeInRanges(surrenderedPlacementRangesRef.current, requestTimeNs)
      );
    },
    [dynamicRangeMode, state.status],
  );
  const summarizeGraph = useCallback<FrameGraphSummarizer>(
    (dataBearingFrameIds) =>
      storeRef.current?.summarizeGraph(dataBearingFrameIds) ??
      EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
    [],
  );

  return useMemo(
    () => ({
      error: state.error,
      frameIds,
      getPlacementReadiness,
      indexedDynamicRanges,
      isPlacementTimeSettled,
      prefetchPlacement: requestPlacementRangeForTime,
      registerPlacementScope,
      resolve,
      resolveParent,
      status: state.status,
      summarizeGraph,
      topologyRevision: storeRef.current?.topologyRevision() ?? 0,
    }),
    [
      frameIds,
      getPlacementReadiness,
      indexedDynamicRanges,
      isPlacementTimeSettled,
      requestPlacementRangeForTime,
      registerPlacementScope,
      resolve,
      resolveParent,
      state.error,
      state.status,
      summarizeGraph,
    ],
  );
}

function normalizePlacementScope(
  scope: FramePlacementScope,
): FramePlacementScope | null {
  const targetFrameId = scope.targetFrameId.trim();
  const frameIds = uniqueNonEmptySortedFrameIds(scope.frameIds).filter(
    (frameId) => frameId !== targetFrameId,
  );
  if (!targetFrameId || frameIds.length === 0) return null;
  return { frameIds, targetFrameId };
}

function normalizedPlacementScopes(
  scopes: readonly FramePlacementScope[],
): readonly FramePlacementScope[] {
  const scopesByKey = new Map<string, FramePlacementScope>();
  for (const scope of scopes) {
    const normalized = normalizePlacementScope(scope);
    if (!normalized) continue;
    scopesByKey.set(
      `${normalized.targetFrameId}\0${normalized.frameIds.join("\0")}`,
      normalized,
    );
  }
  return [...scopesByKey.values()];
}

function dynamicChildrenForPlacementScopes(
  store: EpisodeFrameTransformStore,
  scopes: readonly FramePlacementScope[],
): readonly string[] | null {
  if (scopes.length === 0) return null;
  const children = new Set<string>();
  for (const scope of scopes) {
    const scoped = store.dynamicChildFrameIdsForPlacement(scope);
    if (!scoped) return null;
    for (const childFrameId of scoped) children.add(childFrameId);
  }
  return [...children].sort(compareStrings);
}

function placementScopesResolve(
  store: EpisodeFrameTransformStore | null,
  scopes: readonly FramePlacementScope[],
  timeNs: bigint,
  boundaryClampNs: bigint | undefined,
): boolean {
  if (!store || scopes.length === 0) return false;
  return scopes.every((scope) =>
    scope.frameIds.every(
      (sourceFrameId) =>
        store.resolve({
          ...(boundaryClampNs === undefined
            ? {}
            : { policy: { boundaryClampNs } }),
          sourceFrameId,
          targetFrameId: scope.targetFrameId,
          timeNs,
        }).status === "resolved",
    ),
  );
}

async function readFallbackPlacement(
  capability: TransformReadAcceleration,
  range: EpisodeFrameTransformTimeRange,
) {
  const samples = await capability.readTransforms({
    streams: [],
    window: {
      endNs: range.endTimeNs,
      startNs: range.startTimeNs,
    },
  });
  return {
    indexedRange: range,
    kind: "window" as const,
    samples,
  };
}

function runtimeTransformSample(sample: TransformSample) {
  return {
    childFrameId: sample.childFrameId,
    parentFrameId: sample.parentFrameId,
    rotation: new Quaternion(...sample.quaternion),
    timeNs: sample.timestampNs,
    translation: new Vector3(...sample.translation),
  };
}

function frameTransformRangeKey(range: EpisodeFrameTransformTimeRange): string {
  return `${range.startTimeNs}:${range.endTimeNs}`;
}

function dynamicTransformRetryDelayMs(retryCount: number): number {
  return DYNAMIC_TRANSFORM_RETRY_BASE_DELAY_MS * 2 ** (retryCount - 1);
}

function clearRetryTimeouts(
  timeouts: Map<string, ReturnType<typeof setTimeout>>,
) {
  for (const timeout of timeouts.values()) {
    clearTimeout(timeout);
  }
  timeouts.clear();
}

function dynamicPlacementRangeForTime(
  timeNs: bigint,
  lookaheadNs = DYNAMIC_TRANSFORM_PLACEMENT_LOOKAHEAD_NS,
): EpisodeFrameTransformTimeRange {
  return {
    endTimeNs: timeNs + lookaheadNs,
    startTimeNs:
      timeNs > DYNAMIC_TRANSFORM_LOOKBACK_NS
        ? timeNs - DYNAMIC_TRANSFORM_LOOKBACK_NS
        : 0n,
  };
}

function dynamicRunwayExtensionRangeForTime({
  indexedCoverageEndNs,
  timeNs,
}: {
  readonly indexedCoverageEndNs: bigint | null;
  readonly timeNs: bigint;
}): EpisodeFrameTransformTimeRange | null {
  const targetEndTimeNs = timeNs + DYNAMIC_TRANSFORM_RUNWAY_LOOKAHEAD_NS;
  const extensionStartTimeNs =
    indexedCoverageEndNs === null
      ? timeNs
      : subtractWithFloor(
          indexedCoverageEndNs,
          DYNAMIC_TRANSFORM_RUNWAY_OVERLAP_NS,
        );
  const extensionEndTimeNs = minBigInt(
    targetEndTimeNs,
    extensionStartTimeNs + DYNAMIC_TRANSFORM_RUNWAY_SEGMENT_NS,
  );

  if (extensionEndTimeNs <= extensionStartTimeNs) {
    return null;
  }

  return {
    endTimeNs: extensionEndTimeNs,
    startTimeNs: extensionStartTimeNs,
  };
}

function dynamicRunwayCoverageRangeForTime(
  timeNs: bigint,
): EpisodeFrameTransformTimeRange {
  return {
    endTimeNs: timeNs + DYNAMIC_TRANSFORM_RUNWAY_REFRESH_LOOKAHEAD_NS,
    startTimeNs: timeNs,
  };
}

function transformCoverageEndForTime({
  inFlightRanges,
  store,
  timeNs,
}: {
  readonly inFlightRanges: readonly EpisodeFrameTransformTimeRange[];
  readonly store: EpisodeFrameTransformStore;
  readonly timeNs: bigint;
}): bigint | null {
  let coverageEnd = store.indexedRangeEndCovering(timeNs);
  for (const range of inFlightRanges) {
    if (range.startTimeNs <= timeNs && timeNs <= range.endTimeNs) {
      coverageEnd =
        coverageEnd === null
          ? range.endTimeNs
          : maxBigInt(coverageEnd, range.endTimeNs);
    }
  }

  return coverageEnd;
}

function isTimeInRanges(
  ranges: readonly EpisodeFrameTransformTimeRange[],
  timeNs: bigint,
) {
  return ranges.some(
    (range) => range.startTimeNs <= timeNs && timeNs <= range.endTimeNs,
  );
}

function uniqueNonEmptySortedFrameIds(
  frameIds: readonly string[],
): readonly string[] {
  return [...new Set(frameIds.filter((frameId) => frameId.length > 0))].sort(
    compareStrings,
  );
}

function mergeTransformRanges(
  ranges: readonly EpisodeFrameTransformTimeRange[],
): readonly EpisodeFrameTransformTimeRange[] {
  const sorted = [...ranges].sort((left, right) =>
    compareBigInt(left.startTimeNs, right.startTimeNs),
  );
  const merged: EpisodeFrameTransformTimeRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.startTimeNs <= previous.endTimeNs) {
      merged[merged.length - 1] = {
        endTimeNs: maxBigInt(previous.endTimeNs, range.endTimeNs),
        startTimeNs: previous.startTimeNs,
      };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

function subtractWithFloor(value: bigint, amount: bigint): bigint {
  return value > amount ? value - amount : 0n;
}

function isRangeInRanges(
  ranges: readonly EpisodeFrameTransformTimeRange[],
  requested: EpisodeFrameTransformTimeRange,
) {
  return ranges.some(
    (range) =>
      range.startTimeNs <= requested.startTimeNs &&
      requested.endTimeNs <= range.endTimeNs,
  );
}
