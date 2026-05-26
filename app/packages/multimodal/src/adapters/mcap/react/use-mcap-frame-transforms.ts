import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type {
  McapFrameTransformResolution,
  McapFrameTransformTimeRange,
} from "../frame-transform-types";
import { McapFrameTransformStore } from "../frame-transforms";
import { mcapErrorMessage } from "../errors";
import type { McapActiveTimeline, McapResourceClient } from "../types";

// Keep demand-driven `/tf` reads small and idle-priority; this gives the
// resolver a little temporal slack without letting dense transform channels
// chase every playback tick.
const DYNAMIC_TRANSFORM_LOOKBACK_NS = 500_000_000n;
const DYNAMIC_TRANSFORM_LOOKAHEAD_NS = 500_000_000n;

export type McapFrameTransformsStatus = "idle" | "loading" | "ready" | "error";

/**
 * Resolves a frame transform at a playback time.
 */
export type McapFrameTransformResolver = (
  sourceFrameId: string,
  targetFrameId: string,
  timeNs: bigint
) => McapFrameTransformResolution;

export interface McapFrameTransformsState {
  readonly error: string | null;
  readonly frameIds: readonly string[];
  readonly resolve: McapFrameTransformResolver;
  readonly status: McapFrameTransformsStatus;
}

export interface UseMcapFrameTransformsOptions {
  readonly activeTimeline?: McapActiveTimeline;
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor | null;
  readonly timeNs?: bigint;
}

interface McapFrameTransformsInternalState {
  readonly error: string | null;
  readonly status: McapFrameTransformsStatus;
  readonly version: number;
}

const IDLE_FRAME_TRANSFORMS_STATE = {
  error: null,
  status: "idle" as const,
};

/**
 * Loads eager frame transforms and incrementally prefetches dynamic windows.
 */
export function useMcapFrameTransforms({
  activeTimeline,
  client,
  source,
  timeNs,
}: UseMcapFrameTransformsOptions): McapFrameTransformsState {
  const storeRef = useRef<McapFrameTransformStore | null>(null);
  const [state, setState] = useState<McapFrameTransformsInternalState>({
    ...IDLE_FRAME_TRANSFORMS_STATE,
    version: 0,
  });
  const inFlightRangesRef = useRef<readonly McapFrameTransformTimeRange[]>([]);
  const sourceGenerationRef = useRef(0);

  useEffect(() => {
    inFlightRangesRef.current = [];
    sourceGenerationRef.current += 1;
    const sourceGeneration = sourceGenerationRef.current;
    storeRef.current = null;

    if (!source) {
      setState({
        ...IDLE_FRAME_TRANSFORMS_STATE,
        version: sourceGeneration,
      });
      return;
    }

    const store = new McapFrameTransformStore();
    storeRef.current = store;
    let active = true;
    setState({
      error: null,
      status: "loading",
      version: sourceGeneration,
    });

    client
      .readFrameTransformBootstrap({ source })
      .then((set) => {
        if (!active || sourceGeneration !== sourceGenerationRef.current) {
          return;
        }

        store.addStatic(set.samples);
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
          error: mcapErrorMessage(caughtError),
          status: "error",
          version: current.version + 1,
        }));
      });

    return () => {
      active = false;
    };
  }, [client, source]);

  useEffect(() => {
    const store = storeRef.current;
    if (!source || !store || state.status !== "ready" || timeNs === undefined) {
      return;
    }

    if (
      store.isTimeIndexed(timeNs) ||
      isTimeInRanges(inFlightRangesRef.current, timeNs)
    ) {
      return;
    }

    const requestedRange = dynamicRangeForTime(timeNs);
    const sourceGeneration = sourceGenerationRef.current;
    inFlightRangesRef.current = [...inFlightRangesRef.current, requestedRange];

    client
      .readFrameTransformWindow({
        activeTimeline,
        endTimeNs: requestedRange.endTimeNs,
        source,
        startTimeNs: requestedRange.startTimeNs,
      })
      .then((set) => {
        if (sourceGeneration !== sourceGenerationRef.current) {
          return;
        }

        storeRef.current?.addDynamic(set.samples, requestedRange);
        inFlightRangesRef.current = inFlightRangesRef.current.filter(
          (candidate) => candidate !== requestedRange
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

        inFlightRangesRef.current = inFlightRangesRef.current.filter(
          (candidate) => candidate !== requestedRange
        );
        setState((current) => ({
          ...current,
          error: mcapErrorMessage(caughtError),
          version: current.version + 1,
        }));
      });

    return undefined;
  }, [activeTimeline, client, source, state.status, state.version, timeNs]);

  // The store is mutated in place; `state.version` is the cache-busting signal
  // that tells memoized consumers (frameIds, resolve, downstream renderers) to
  // recompute. eslint can't see the version inside `storeRef.current`.
  const frameIds = useMemo(
    () => storeRef.current?.frameIds() ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.version]
  );
  const resolve = useCallback<McapFrameTransformResolver>(
    (sourceFrameId, targetFrameId, requestTimeNs) =>
      storeRef.current?.resolve({
        sourceFrameId,
        targetFrameId,
        timeNs: requestTimeNs,
      }) ?? {
        sourceFrameId,
        status: "missing",
        targetFrameId,
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.version]
  );

  return useMemo(
    () => ({
      error: state.error,
      frameIds,
      resolve,
      status: state.status,
    }),
    [frameIds, resolve, state.error, state.status]
  );
}

function dynamicRangeForTime(timeNs: bigint): McapFrameTransformTimeRange {
  return {
    endTimeNs: timeNs + DYNAMIC_TRANSFORM_LOOKAHEAD_NS,
    startTimeNs:
      timeNs > DYNAMIC_TRANSFORM_LOOKBACK_NS
        ? timeNs - DYNAMIC_TRANSFORM_LOOKBACK_NS
        : 0n,
  };
}

function isTimeInRanges(
  ranges: readonly McapFrameTransformTimeRange[],
  timeNs: bigint
) {
  return ranges.some(
    (range) => range.startTimeNs <= timeNs && timeNs <= range.endTimeNs
  );
}
