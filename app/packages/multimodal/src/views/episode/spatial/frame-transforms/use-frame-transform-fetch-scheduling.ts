// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// scheduling hook has direct unit tests through its compatibility facade.
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
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Quaternion, Vector3 } from "three";
import type {
  EpisodeFrameTransformPolicy,
  EpisodeFrameTransformTimeRange,
} from "../../../../runtime/frame-transform-types";
import type { TransformSample } from "../../../../ir";
import { errorMessage } from "../../status/error-message";
import {
  isEpisodeReadCancelledError,
  type TransformPlacementReadResult,
  type TransformReadAcceleration,
} from "../../../../ports";
import { EpisodeFrameTransformStore } from "../../../../runtime/frame-transforms";
import { mergeFrameTransformTimeRanges } from "../../../../runtime/frame-transform-ranges";
import { shouldDeferIdleWorkForStore } from "../../playback/network-health";
import { throwIfAborted } from "../../../../utils/cancellation";
import {
  dynamicChildrenForPlacementScopes,
  type FramePlacementScope,
  FramePlacementScopeRegistry,
  placementScopesResolve,
} from "./frame-placement-scopes";
import {
  DYNAMIC_TRANSFORM_LOOKBACK_NS,
  DYNAMIC_TRANSFORM_PLACEMENT_LOOKAHEAD_NS,
  dynamicPlacementRangeForTime,
  dynamicRunwayCoverageRangeForTime,
  dynamicRunwayExtensionRangeForTime,
  frameTransformRangeKey,
  isRangeInRanges,
  isTimeInRanges,
  PAUSED_TRANSFORM_PLACEMENT_LOOKAHEAD_NS,
  transformCoverageEndForTime,
} from "./frame-transform-windows";

const EXACT_PLACEMENT_CADENCE_MULTIPLIER = 3n;
const DYNAMIC_TRANSFORM_RETRY_BASE_DELAY_MS = 250;
const DYNAMIC_TRANSFORM_WINDOW_MAX_RETRIES = 3;

type DynamicRangeMode = "fallback" | "pending" | "range";

/** Mutable scheduling state shared with the resolver facade. */
export interface FrameTransformSchedulingState {
  readonly error: string | null;
  readonly status: "error" | "idle" | "loading" | "ready";
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

interface FrameTransformFetchSchedulingOptions {
  readonly capability: TransformReadAcceleration | null;
  readonly dynamicRange: EpisodeFrameTransformTimeRange | null | undefined;
  readonly policy: EpisodeFrameTransformPolicy | undefined;
  readonly sourceKey: string | null;
  readonly timeNs: bigint | undefined;
}

interface FrameTransformFetchScheduling {
  readonly dynamicRangeMode: DynamicRangeMode;
  readonly inFlightPlacementRangesRef: MutableRefObject<
    readonly EpisodeFrameTransformTimeRange[]
  >;
  readonly registerPlacementScope: (scope: FramePlacementScope) => () => void;
  readonly requestPlacementRangeForTime: (
    requestTimeNs: bigint,
    requestScope?: FramePlacementScope,
  ) => void;
  readonly state: FrameTransformSchedulingState;
  readonly storeRef: MutableRefObject<EpisodeFrameTransformStore | null>;
  readonly surrenderedPlacementRangesRef: MutableRefObject<
    readonly EpisodeFrameTransformTimeRange[]
  >;
}

/**
 * Owns transform bootstrap, placement reads, retries, and idle runway scheduling.
 */
export function useFrameTransformFetchScheduling({
  capability,
  dynamicRange,
  policy,
  sourceKey,
  timeNs,
}: FrameTransformFetchSchedulingOptions): FrameTransformFetchScheduling {
  const storeRef = useRef<EpisodeFrameTransformStore | null>(null);
  const [state, setState] = useState<FrameTransformSchedulingState>({
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
  const placementScopesRef = useRef(new FramePlacementScopeRegistry());
  const sourceGenerationRef = useRef(0);
  const activeReadControllersRef = useRef(new Set<AbortController>());
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
    const dispose = placementScopesRef.current.register(scope);
    if (!dispose) return () => undefined;

    setState((current) => ({
      ...current,
      version: current.version + 1,
    }));
    return () => {
      if (!dispose()) return;
      setState((current) => ({
        ...current,
        version: current.version + 1,
      }));
    };
  }, []);

  // This effect resets transform state when the source changes and loads the
  // initial static transform bootstrap before dynamic windows are requested.
  useEffect(() => {
    const activeReadControllers = activeReadControllersRef.current;
    for (const controller of activeReadControllers) {
      controller.abort();
    }
    activeReadControllers.clear();
    const retryTimeouts = retryTimeoutsRef.current;
    clearRetryTimeouts(retryTimeouts);
    runwayRangeKeyRef.current = null;
    inFlightPlacementRangesRef.current = [];
    surrenderedPlacementRangesRef.current = [];
    inFlightRunwayRangesRef.current = [];
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

    const bootstrapController = new AbortController();
    activeReadControllers.add(bootstrapController);
    Promise.resolve(
      capability.readBootstrap?.({ signal: bootstrapController.signal }) ?? [],
    )
      .then((samples) => {
        if (
          !active ||
          bootstrapController.signal.aborted ||
          sourceGeneration !== sourceGenerationRef.current
        ) {
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
        if (
          !active ||
          bootstrapController.signal.aborted ||
          sourceGeneration !== sourceGenerationRef.current
        ) {
          return;
        }

        setState((current) => ({
          ...current,
          error: errorMessage(caughtError),
          status: "error",
          version: current.version + 1,
        }));
      })
      .finally(() => {
        activeReadControllers.delete(bootstrapController);
      });

    return () => {
      active = false;
      for (const controller of activeReadControllers) {
        controller.abort();
      }
      activeReadControllers.clear();
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
      const fallbackRange = dynamicPlacementRangeForTime(
        requestTimeNs,
        playbackStore && !activelyPlaying
          ? PAUSED_TRANSFORM_PLACEMENT_LOOKAHEAD_NS
          : DYNAMIC_TRANSFORM_PLACEMENT_LOOKAHEAD_NS,
      );
      const placementScopes = placementScopesRef.current.values(requestScope);
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
        !activelyPlaying &&
        readPlacement !== undefined &&
        requiredDynamicChildFrameIds !== null &&
        requiredDynamicChildFrameIds.length > 0 &&
        maxObservedCadenceNs !== null &&
        maxObservedCadenceNs * EXACT_PLACEMENT_CADENCE_MULTIPLIER <=
          DYNAMIC_TRANSFORM_LOOKBACK_NS;
      const requestedRange = useExactPlacement
        ? { endTimeNs: requestTimeNs, startTimeNs: requestTimeNs }
        : fallbackRange;
      const requestedRangeKey = frameTransformRangeKey(requestedRange);
      const sourceGeneration = sourceGenerationRef.current;
      inFlightPlacementRangesRef.current = [
        ...inFlightPlacementRangesRef.current,
        requestedRange,
      ];
      const controller = new AbortController();
      activeReadControllersRef.current.add(controller);
      const read: Promise<PlacementReadResult> = (async () => {
        if (
          useExactPlacement &&
          readPlacement &&
          requiredDynamicChildFrameIds
        ) {
          const placement = await readPlacement({
            requiredDynamicChildFrameIds,
            signal: controller.signal,
            timeNs: requestTimeNs,
          });
          throwIfAborted(controller.signal);
          return placement
            ? { kind: "exact", placement }
            : readFallbackPlacement(
                capability,
                fallbackRange,
                controller.signal,
              );
        }
        const samples = await capability.readTransforms({
          signal: controller.signal,
          streams: [],
          window: {
            endNs: requestedRange.endTimeNs,
            startNs: requestedRange.startTimeNs,
          },
        });
        throwIfAborted(controller.signal);
        return {
          indexedRange: requestedRange,
          kind: "window",
          samples,
        };
      })();
      read
        .then(async (result) => {
          if (
            controller.signal.aborted ||
            sourceGeneration !== sourceGenerationRef.current
          ) {
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
                controller.signal,
              );
              if (
                controller.signal.aborted ||
                sourceGeneration !== sourceGenerationRef.current
              ) {
                return;
              }
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
          if (
            controller.signal.aborted ||
            sourceGeneration !== sourceGenerationRef.current
          ) {
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
            surrenderedPlacementRangesRef.current =
              mergeFrameTransformTimeRanges([
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
        })
        .finally(() => {
          activeReadControllersRef.current.delete(controller);
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
        indexedCoverageEndNs: store.indexedRangeEndCovering(timeNs),
        inFlightRanges: [
          ...inFlightPlacementRangesRef.current,
          ...inFlightRunwayRangesRef.current,
        ],
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
    const controller = new AbortController();
    activeReadControllersRef.current.add(controller);

    capability
      .readTransforms({
        // The first runway segment while Play is pending is demanded startup
        // work. Foreground priority avoids a limited-network deadlock and a
        // priority inversion behind speculative reads.
        priority: playPending ? "playback" : "idle",
        signal: controller.signal,
        streams: [],
        window: {
          endNs: runwayRange.endTimeNs,
          startNs: runwayRange.startTimeNs,
        },
      })
      .then((samples) => {
        if (
          controller.signal.aborted ||
          sourceGeneration !== sourceGenerationRef.current
        ) {
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
        if (
          controller.signal.aborted ||
          sourceGeneration !== sourceGenerationRef.current
        ) {
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
      })
      .finally(() => {
        activeReadControllersRef.current.delete(controller);
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

  return {
    dynamicRangeMode,
    inFlightPlacementRangesRef,
    registerPlacementScope,
    requestPlacementRangeForTime,
    state,
    storeRef,
    surrenderedPlacementRangesRef,
  };
}

async function readFallbackPlacement(
  capability: TransformReadAcceleration,
  range: EpisodeFrameTransformTimeRange,
  signal?: AbortSignal,
) {
  const samples = await capability.readTransforms({
    signal,
    streams: [],
    window: {
      endNs: range.endTimeNs,
      startNs: range.startTimeNs,
    },
  });
  throwIfAborted(signal);
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
