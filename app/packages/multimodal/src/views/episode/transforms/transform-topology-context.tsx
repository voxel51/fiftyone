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
  readonly retry: () => void;
  readonly sampleCurrentTime: (timeNs: bigint) => void;
}

interface TransformTopologyEvidence {
  readonly edges: readonly EpisodeTransformTopologyEdgeObservation[];
  readonly frameUses: readonly EpisodeTransformTopologyFrameUse[];
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

const EMPTY_EVIDENCE: TransformTopologyEvidence = {
  edges: [],
  frameUses: [],
};

/** Demand-driven scan state owned by a mounted Transforms tile. */
export function useTransformTopologyScan(): TransformTopologyScanController {
  const { capability, sourceKey } = useContext(TransformTopologyContext);
  const [state, setState] = useState<TransformTopologyScanState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const scanEvidenceRef = useRef<TransformTopologyEvidence>(EMPTY_EVIDENCE);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const run = useCallback(() => {
    if (!capability || !sourceKey) return;
    scanEvidenceRef.current = EMPTY_EVIDENCE;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestRef.current;
    setState({
      ...INITIAL_STATE,
      error: null,
      loading: true,
    });
    void capability
      .scan({
        budget: TRANSFORM_TOPOLOGY_GRANT_BUDGET,
        continuation: undefined,
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
        const complete =
          result.stopReason === "source-exhausted" &&
          result.continuation === undefined &&
          unavailableSpanCount === 0;
        scanEvidenceRef.current = {
          edges: result.edges,
          frameUses: result.frameUses,
        };
        setState({
          complete,
          continuation: result.continuation,
          edges: result.edges,
          error: null,
          frameUses: result.frameUses,
          loading: false,
          partial: !complete,
          sampled: false,
          stopReason: result.stopReason,
          unavailableSpanCount,
          usage: result.usage,
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
  }, [capability, sourceKey]);

  const runSample = useCallback(
    (timeNs: bigint) => {
      if (!capability?.sample || !sourceKey) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const requestId = ++requestRef.current;
      setState((current) => ({ ...current, error: null, loading: true }));
      void capability
        .sample({ signal: controller.signal, timeNs })
        .then((result) => {
          if (controller.signal.aborted || requestRef.current !== requestId) {
            return;
          }
          if (controllerRef.current === controller) {
            controllerRef.current = null;
          }
          const hasScanTopology = hasTopology(scanEvidenceRef.current);
          setState((current) => ({
            ...current,
            continuation: hasScanTopology ? current.continuation : undefined,
            edges: mergeSampleEdges(current.edges, result.edges),
            error: null,
            frameUses: mergeFrameUses(current.frameUses, result.frameUses),
            loading: false,
            partial: true,
            sampled: !hasScanTopology,
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
    },
    [capability, sourceKey],
  );

  // Mounting the tile authorizes exactly one bounded grant for this source.
  useEffect(() => {
    scanEvidenceRef.current = EMPTY_EVIDENCE;
    setState(INITIAL_STATE);
    if (capability && sourceKey) run();
    return () => {
      requestRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [capability, run, sourceKey]);

  const sampleCurrentTime = useCallback(
    (timeNs: bigint) => {
      const current = stateRef.current;
      if (canSampleFrom(capability, current) && !current.loading) {
        runSample(timeNs);
      }
    },
    [capability, runSample],
  );
  const retry = useCallback(() => run(), [run]);

  return {
    ...state,
    canSample: canSampleFrom(capability, state),
    retry,
    sampleCurrentTime,
  };
}

function canSampleFrom(
  capability: TransformTopologyCapability | null,
  state: TransformTopologyScanState,
): boolean {
  return capability?.sample !== undefined && state.partial;
}

function hasTopology(evidence: TransformTopologyEvidence): boolean {
  return evidence.edges.length > 0 || evidence.frameUses.length > 0;
}

/** Adds only topology identities not already represented by scan or samples. */
function mergeSampleEdges(
  left: readonly EpisodeTransformTopologyEdgeObservation[],
  right: readonly EpisodeTransformTopologyEdgeObservation[],
): readonly EpisodeTransformTopologyEdgeObservation[] {
  const seen = new Set(left.map(transformObservationIdentity));
  const additions = right.filter((edge) => {
    const identity = transformObservationIdentity(edge);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  return additions.length > 0 ? [...left, ...additions] : left;
}

function transformObservationIdentity(
  edge: EpisodeTransformTopologyEdgeObservation,
): string {
  return [
    edge.parentFrameId,
    edge.childFrameId,
    edge.kind,
    edge.sourceName,
    edge.sourceStreamId,
  ].join("\0");
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
