import { useCallback, useMemo } from "react";
import type { LoadStatus } from "../../../../runtime";
import type {
  EpisodeFrameTransformPolicy,
  EpisodeFrameTransformResolution,
  EpisodeFrameTransformTimeRange,
  EpisodeParentFrameTransformResolution,
} from "../../../../runtime/frame-transform-types";
import {
  compareFrameIds,
  uniqueSortedFrameIds,
} from "../../../../utils/frame-ids";
import type { TransformReadAcceleration } from "../../../../ports";
import {
  EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
  type EpisodeFrameGraphSummary,
} from "../../../../runtime/frame-transforms";
import type { FramePlacementScope } from "./frame-placement-scopes";
import { isTimeInRanges } from "./frame-transform-windows";
import { useFrameTransformFetchScheduling } from "./use-frame-transform-fetch-scheduling";

export type { FramePlacementScope } from "./frame-placement-scopes";

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
  const {
    dynamicRangeMode,
    inFlightPlacementRangesRef,
    registerPlacementScope,
    requestPlacementRangeForTime,
    state,
    storeRef,
    surrenderedPlacementRangesRef,
  } = useFrameTransformFetchScheduling({
    capability,
    dynamicRange,
    policy,
    sourceKey,
    timeNs,
  });

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
      const frameIds = uniqueSortedFrameIds(requestedFrameIds).filter(
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
        compareFrameIds,
      );
      if (
        unresolvedFrameIds.length > 0 &&
        isTimeInRanges(inFlightPlacementRangesRef.current, requestTimeNs)
      ) {
        return { frameIds: unresolvedFrameIds, status: "loading" };
      }
      if (missingFrameIds.length > 0) {
        return {
          frameIds: missingFrameIds.sort(compareFrameIds),
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
          frameIds: pendingFrameIds.sort(compareFrameIds),
          status: "definitiveMissing",
        };
      }
      if (isTimeInRanges(inFlightPlacementRangesRef.current, requestTimeNs)) {
        return {
          frameIds: pendingFrameIds.sort(compareFrameIds),
          status: "loading",
        };
      }
      return {
        frameIds: pendingFrameIds.sort(compareFrameIds),
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
    [dynamicRangeMode, state.status, storeRef, surrenderedPlacementRangesRef],
  );
  const summarizeGraph = useCallback<FrameGraphSummarizer>(
    (dataBearingFrameIds) =>
      storeRef.current?.summarizeGraph(dataBearingFrameIds) ??
      EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
    [storeRef],
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
      storeRef,
      summarizeGraph,
    ],
  );
}
