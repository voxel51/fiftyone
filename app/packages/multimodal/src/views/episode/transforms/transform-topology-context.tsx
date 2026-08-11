import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  EpisodeTransformTopologyEdgeObservation,
  EpisodeTransformTopologyFrameUse,
} from "../../../ir";
import type {
  BudgetedReadStopReason,
  ReadContinuation,
  ReadWorkUsage,
  TransformTopologyCapability,
} from "../../../ports";
import { emptyReadWorkUsage } from "../../../ports/read-work-usage";
import { errorMessage } from "../../../utils/errors";

const MIB = 1024 * 1024;

/** One user-authorized topology grant. Continuations are never automatic. */
export const TRANSFORM_TOPOLOGY_GRANT_BUDGET = {
  maxMessages: 10_000,
  maxSourceBytes: 16 * MIB,
  maxUncompressedBytes: 32 * MIB,
  maxWallTimeMs: 500,
} as const;

interface TransformTopologySource {
  readonly capability: TransformTopologyCapability | null;
  readonly sourceKey: string | null;
}

const TransformTopologyContext = createContext<TransformTopologySource>({
  capability: null,
  sourceKey: null,
});

/** Makes a source-bound topology capability available to episode tiles. */
export const TransformTopologyProvider: React.FC<{
  readonly capability: TransformTopologyCapability | null;
  readonly children: React.ReactNode;
  readonly sourceKey: string | null;
}> = ({ capability, children, sourceKey }) => {
  const value = useMemo(
    () => ({ capability, sourceKey }),
    [capability, sourceKey],
  );
  return (
    <TransformTopologyContext.Provider value={value}>
      {children}
    </TransformTopologyContext.Provider>
  );
};

/** Capability presence without authorizing any source read. */
export function useTransformTopologyCapability(): boolean {
  return useContext(TransformTopologyContext).capability !== null;
}

/** Observable state for one demand-driven topology analysis. */
export interface TransformTopologyScanState {
  readonly complete: boolean;
  readonly continuation?: ReadContinuation;
  readonly edges: readonly EpisodeTransformTopologyEdgeObservation[];
  readonly error: string | null;
  readonly frameUses: readonly EpisodeTransformTopologyFrameUse[];
  readonly loading: boolean;
  readonly partial: boolean;
  readonly sampled: boolean;
  readonly stopReason?: BudgetedReadStopReason;
  readonly unavailableSpanCount: number;
  readonly usage: ReadWorkUsage;
}

interface TransformTopologyScanController extends TransformTopologyScanState {
  readonly canSample: boolean;
  readonly continueAnalysis: () => void;
  readonly continueAnyway: () => void;
  readonly retry: () => void;
}

const INITIAL_STATE: TransformTopologyScanState = {
  complete: false,
  edges: [],
  error: null,
  frameUses: [],
  loading: false,
  partial: false,
  sampled: false,
  unavailableSpanCount: 0,
  usage: emptyReadWorkUsage(),
};

/** Demand-driven scan state owned by a mounted Transforms tile. */
export function useTransformTopologyScan(): TransformTopologyScanController {
  const { capability, sourceKey } = useContext(TransformTopologyContext);
  const [state, setState] = useState<TransformTopologyScanState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const run = useCallback(
    (continuation?: ReadContinuation, replace = false) => {
      if (!capability || !sourceKey) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const requestId = ++requestRef.current;
      setState((current) => ({
        ...(replace ? INITIAL_STATE : current),
        error: null,
        loading: true,
      }));
      void capability
        .scan({
          budget: TRANSFORM_TOPOLOGY_GRANT_BUDGET,
          continuation,
          signal: controller.signal,
        })
        .then((result) => {
          if (controller.signal.aborted || requestRef.current !== requestId) {
            return;
          }
          if (controllerRef.current === controller) {
            controllerRef.current = null;
          }
          const unavailableSpanCount = result.unavailableByStream
            ? [...result.unavailableByStream.values()].reduce(
                (count, windows) => count + windows.length,
                0,
              )
            : 0;
          setState((current) => {
            const totalUnavailableSpanCount =
              (replace ? 0 : current.unavailableSpanCount) +
              unavailableSpanCount;
            const complete =
              result.stopReason === "source-exhausted" &&
              result.continuation === undefined &&
              totalUnavailableSpanCount === 0;
            return {
              complete,
              continuation: result.continuation,
              edges: replace
                ? result.edges
                : [...current.edges, ...result.edges],
              error: null,
              frameUses: replace
                ? result.frameUses
                : mergeFrameUses(current.frameUses, result.frameUses),
              loading: false,
              partial: !complete,
              sampled: false,
              stopReason: result.stopReason,
              unavailableSpanCount: totalUnavailableSpanCount,
              usage: addUsage(
                replace ? emptyReadWorkUsage() : current.usage,
                result.usage,
              ),
            };
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || requestRef.current !== requestId) {
            return;
          }
          if (controllerRef.current === controller) {
            controllerRef.current = null;
          }
          setState((current) => ({
            ...current,
            error: errorMessage(error),
            loading: false,
          }));
        });
    },
    [capability, sourceKey],
  );

  const runSample = useCallback(() => {
    if (!capability?.sample || !sourceKey) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestRef.current;
    setState((current) => ({ ...current, error: null, loading: true }));
    void capability
      .sample({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted || requestRef.current !== requestId) {
          return;
        }
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        setState((current) => ({
          ...current,
          continuation: undefined,
          edges: result.edges,
          error: null,
          frameUses: result.frameUses,
          loading: false,
          partial: true,
          sampled: true,
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestRef.current !== requestId) {
          return;
        }
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        setState((current) => ({
          ...current,
          error: errorMessage(error),
          loading: false,
        }));
      });
  }, [capability, sourceKey]);

  // Mounting the tile authorizes exactly one bounded grant for this source.
  useEffect(() => {
    setState(INITIAL_STATE);
    if (capability && sourceKey) run(undefined, true);
    return () => {
      requestRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [capability, run, sourceKey]);

  const continueAnalysis = useCallback(() => {
    const continuation = stateRef.current.continuation;
    if (continuation && !stateRef.current.loading) run(continuation);
  }, [run]);
  const continueAnyway = useCallback(() => {
    const current = stateRef.current;
    if (canSampleFrom(capability, current)) runSample();
  }, [capability, runSample]);
  const retry = useCallback(() => run(undefined, true), [run]);

  return {
    ...state,
    canSample: canSampleFrom(capability, state),
    continueAnalysis,
    continueAnyway,
    retry,
  };
}

function canSampleFrom(
  capability: TransformTopologyCapability | null,
  state: TransformTopologyScanState,
): boolean {
  return (
    capability?.sample !== undefined &&
    state.partial &&
    !state.loading &&
    !state.sampled &&
    state.continuation === undefined &&
    state.edges.length === 0
  );
}

function mergeFrameUses(
  left: readonly EpisodeTransformTopologyFrameUse[],
  right: readonly EpisodeTransformTopologyFrameUse[],
): readonly EpisodeTransformTopologyFrameUse[] {
  const byIdentity = new Map<string, EpisodeTransformTopologyFrameUse>();
  for (const use of [...left, ...right]) {
    byIdentity.set(`${use.frameId}\0${use.streamId}`, use);
  }
  return [...byIdentity.values()].sort((leftUse, rightUse) => {
    const leftKey = `${leftUse.frameId}\0${leftUse.streamId}`;
    const rightKey = `${rightUse.frameId}\0${rightUse.streamId}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function addUsage(left: ReadWorkUsage, right: ReadWorkUsage): ReadWorkUsage {
  return {
    chunksOpened: left.chunksOpened + right.chunksOpened,
    decompressedBytes: left.decompressedBytes + right.decompressedBytes,
    decompressionCacheHits:
      left.decompressionCacheHits + right.decompressionCacheHits,
    elapsedMs: left.elapsedMs + right.elapsedMs,
    logicalSourceBytes: left.logicalSourceBytes + right.logicalSourceBytes,
    logicalUncompressedBytes:
      left.logicalUncompressedBytes + right.logicalUncompressedBytes,
    messagesDecoded: left.messagesDecoded + right.messagesDecoded,
    transferredBytes: left.transferredBytes + right.transferredBytes,
  };
}
