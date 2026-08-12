import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
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
  TransformTopologySampleResult,
  TransformTopologyScanResult,
} from "../../../ports";
import { emptyReadWorkUsage } from "../../../ports/read-work-usage";
import { errorMessage } from "../../../utils/errors";

const MIB = 1024 * 1024;
export const MAX_STORES_PER_CAPABILITY = 8;

/** One bounded topology grant. Continuations are never automatic. */
export const TRANSFORM_TOPOLOGY_GRANT_BUDGET = {
  maxMessages: 10_000,
  maxSourceBytes: 16 * MIB,
  maxUncompressedBytes: 32 * MIB,
  maxWallTimeMs: 500,
} as const;

export type TransformTopologyScanStatus =
  | "complete"
  | "error"
  | "idle"
  | "partial"
  | "running";

type TransformTopologyOperation = "analyze" | "scan";

/** Persistent source-scoped evidence and recording-scan coverage. */
export interface TransformTopologyScanState {
  readonly continuation: ReadContinuation | undefined;
  readonly edges: readonly EpisodeTransformTopologyEdgeObservation[];
  readonly error: string | null;
  readonly frameUses: readonly EpisodeTransformTopologyFrameUse[];
  readonly loading: boolean;
  readonly operation: TransformTopologyOperation | undefined;
  readonly sampledRequestTimesNs: readonly bigint[];
  readonly sampledTimesNs: readonly bigint[];
  readonly scanCanProgress: boolean;
  readonly status: TransformTopologyScanStatus;
  readonly stopReason: BudgetedReadStopReason | undefined;
  readonly unavailableSpanCount: number;
  readonly usage: ReadWorkUsage;
}

interface TransformTopologyScanController extends TransformTopologyScanState {
  readonly analyzeMore: (timeNs: bigint | undefined) => void;
  readonly canAnalyzeMore: boolean;
  readonly retry: () => void;
}

interface TransformTopologyStore {
  readonly analyzeMore: (timeNs: bigint | undefined) => void;
  readonly capability: TransformTopologyCapability | null;
  readonly dispose: () => void;
  readonly getSnapshot: () => TransformTopologyScanState;
  readonly retry: () => void;
  readonly start: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

interface TransformTopologySource {
  readonly store: TransformTopologyStore;
}

const INITIAL_STATE: TransformTopologyScanState = {
  continuation: undefined,
  edges: [],
  error: null,
  frameUses: [],
  loading: false,
  operation: undefined,
  sampledRequestTimesNs: [],
  sampledTimesNs: [],
  scanCanProgress: true,
  status: "idle",
  stopReason: undefined,
  unavailableSpanCount: 0,
  usage: emptyReadWorkUsage(),
};

const UNAVAILABLE_STORE = createUnavailableStore();
const TransformTopologyContext = createContext<TransformTopologySource>({
  store: UNAVAILABLE_STORE,
});
// Store ownership deliberately sits outside React so an authorized bounded
// grant can finish and retain evidence while its tile is unmounted.
const STORES_BY_CAPABILITY = new WeakMap<
  TransformTopologyCapability,
  Map<string, TransformTopologyStore>
>();
const STORE_MOUNT_COUNTS = new WeakMap<TransformTopologyStore, number>();

/** Makes one session/source-scoped topology controller available to tiles. */
export const TransformTopologyProvider: React.FC<{
  readonly capability: TransformTopologyCapability | null;
  readonly children: React.ReactNode;
  readonly sourceKey: string | null;
}> = ({ capability, children, sourceKey }) => {
  const store = useMemo(
    () => topologyStoreFor(capability, sourceKey),
    [capability, sourceKey],
  );
  // This effect commits store recency and mount ownership after render.
  useEffect(
    () => retainTopologyStore(capability, sourceKey, store),
    [capability, sourceKey, store],
  );
  const value = useMemo(() => ({ store }), [store]);
  return (
    <TransformTopologyContext.Provider value={value}>
      {children}
    </TransformTopologyContext.Provider>
  );
};

/** Capability presence without authorizing any source read. */
export function useTransformTopologyCapability(): boolean {
  return useContext(TransformTopologyContext).store.capability !== null;
}

/** Demand-driven view of persistent topology analysis for this session/source. */
export function useTransformTopologyScan(
  sampleTimeNs?: bigint,
): TransformTopologyScanController {
  const { store } = useContext(TransformTopologyContext);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  // This effect authorizes the source's one initial bounded scan on demand.
  useEffect(() => store.start(), [store]);
  const continuationAvailable =
    state.continuation !== undefined && state.scanCanProgress;
  const sampleAvailable =
    sampleTimeNs !== undefined &&
    store.capability?.sample !== undefined &&
    state.status === "partial" &&
    !state.sampledRequestTimesNs.includes(sampleTimeNs);
  return {
    ...state,
    analyzeMore: store.analyzeMore,
    canAnalyzeMore:
      state.operation === "analyze" ||
      (state.error === null && (continuationAvailable || sampleAvailable)),
    retry: store.retry,
  };
}

function topologyStoreFor(
  capability: TransformTopologyCapability | null,
  sourceKey: string | null,
): TransformTopologyStore {
  if (!capability || !sourceKey) return UNAVAILABLE_STORE;
  // Synchronous registration lets remounts share one store before effects run.
  // It starts no I/O; recency, retention, and eviction happen after commit.
  const stores = STORES_BY_CAPABILITY.get(capability) ?? new Map();
  STORES_BY_CAPABILITY.set(capability, stores);
  const existing = stores.get(sourceKey);
  if (existing) return existing;
  const store = createTransformTopologyStore(capability);
  stores.set(sourceKey, store);
  return store;
}

function retainTopologyStore(
  capability: TransformTopologyCapability | null,
  sourceKey: string | null,
  store: TransformTopologyStore,
): (() => void) | undefined {
  if (!capability || !sourceKey || store === UNAVAILABLE_STORE) return;
  const stores = STORES_BY_CAPABILITY.get(capability);
  if (!stores || stores.get(sourceKey) !== store) return;
  STORE_MOUNT_COUNTS.set(store, (STORE_MOUNT_COUNTS.get(store) ?? 0) + 1);
  stores.delete(sourceKey);
  stores.set(sourceKey, store);
  evictInactiveTopologyStores(stores);
  return () => {
    const mounts = Math.max(0, (STORE_MOUNT_COUNTS.get(store) ?? 1) - 1);
    STORE_MOUNT_COUNTS.set(store, mounts);
    evictInactiveTopologyStores(stores);
  };
}

function evictInactiveTopologyStores(
  stores: Map<string, TransformTopologyStore>,
): void {
  while (stores.size > MAX_STORES_PER_CAPABILITY) {
    const oldestInactive = [...stores].find(
      ([, store]) => (STORE_MOUNT_COUNTS.get(store) ?? 0) === 0,
    );
    if (!oldestInactive) return;
    const [sourceKey, store] = oldestInactive;
    store.dispose();
    stores.delete(sourceKey);
  }
}

function createTransformTopologyStore(
  capability: TransformTopologyCapability,
): TransformTopologyStore {
  let snapshot = INITIAL_STATE;
  let started = false;
  let requestId = 0;
  let activeController: AbortController | null = null;
  let scanEdges: readonly EpisodeTransformTopologyEdgeObservation[] = [];
  let scanFrameUses: readonly EpisodeTransformTopologyFrameUse[] = [];
  let retryPlan: AnalyzePlan | null = null;
  const samplesByTime = new Map<bigint, TransformTopologySampleResult>();
  const sampledRequestTimes = new Set<bigint>();
  const listeners = new Set<() => void>();

  const publish = (next: TransformTopologyScanState) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const publishEvidence = (patch: Partial<TransformTopologyScanState>) => {
    const evidence = visibleEvidence(scanEdges, scanFrameUses, samplesByTime);
    publish({ ...snapshot, ...patch, ...evidence });
  };

  const applyScanResult = (
    result: TransformTopologyScanResult,
    patch: Partial<TransformTopologyScanState>,
  ) => {
    scanEdges = mergeScanEdges(scanEdges, result.edges);
    scanFrameUses = mergeFrameUses(scanFrameUses, result.frameUses);
    const unavailableSpanCount =
      snapshot.unavailableSpanCount + countUnavailableSpans(result);
    const complete =
      result.stopReason === "source-exhausted" &&
      result.continuation === undefined &&
      unavailableSpanCount === 0;
    publishEvidence({
      continuation: result.continuation,
      status: complete ? "complete" : "partial",
      stopReason: result.stopReason,
      unavailableSpanCount,
      usage: addUsage(snapshot.usage, result.usage),
      ...patch,
    });
  };

  const runScan = async (continuation: ReadContinuation | undefined) => {
    if (snapshot.loading) return;
    retryPlan = null;
    const activeRequest = ++requestId;
    const controller = new AbortController();
    activeController = controller;
    publish({
      ...snapshot,
      error: null,
      loading: true,
      operation: "scan",
      status: hasTopology(snapshot) ? snapshot.status : "running",
    });
    try {
      const result = await capability.scan({
        budget: TRANSFORM_TOPOLOGY_GRANT_BUDGET,
        ...(continuation ? { continuation } : {}),
        signal: controller.signal,
      });
      if (requestId !== activeRequest) return;
      applyScanResult(result, {
        error: null,
        loading: false,
        operation: undefined,
      });
    } catch (error: unknown) {
      if (requestId !== activeRequest) return;
      publish({
        ...snapshot,
        error: errorMessage(error),
        loading: false,
        operation: undefined,
        status: hasTopology(snapshot) ? "partial" : "error",
      });
    } finally {
      if (activeController === controller) activeController = null;
    }
  };

  const runAnalyzePlan = async (plan: AnalyzePlan) => {
    if (snapshot.loading || !hasAnalyzeWork(plan)) return;
    retryPlan = null;
    const activeRequest = ++requestId;
    const controller = new AbortController();
    activeController = controller;
    publish({
      ...snapshot,
      error: null,
      loading: true,
      operation: "analyze",
    });
    const failures: string[] = [];
    const failedPlan: MutableAnalyzePlan = {};

    try {
      if (plan.continuation !== undefined) {
        try {
          const result = await capability.scan({
            budget: TRANSFORM_TOPOLOGY_GRANT_BUDGET,
            continuation: plan.continuation,
            signal: controller.signal,
          });
          if (requestId !== activeRequest) return;
          // Only an explicit follow-up may prove the scan is stalled. An
          // exhausted initial account must still allow one Analyze more grant.
          applyScanResult(result, {
            error: null,
            loading: true,
            operation: "analyze",
            scanCanProgress: scanResultMadeProgress(result),
          });
        } catch (error: unknown) {
          failures.push(errorMessage(error));
          failedPlan.continuation = plan.continuation;
        }
      }

      if (plan.sampleTimeNs !== undefined && capability.sample) {
        try {
          const result = await capability.sample({
            signal: controller.signal,
            timeNs: plan.sampleTimeNs,
          });
          if (requestId !== activeRequest) return;
          samplesByTime.set(result.sampledAtNs, result);
          sampledRequestTimes.add(plan.sampleTimeNs);
          publishEvidence({
            error: failures[0] ?? null,
            loading: true,
            operation: "analyze",
            sampledRequestTimesNs: [...sampledRequestTimes],
          });
        } catch (error: unknown) {
          failures.push(errorMessage(error));
          failedPlan.sampleTimeNs = plan.sampleTimeNs;
        }
      }

      if (requestId !== activeRequest) return;
      retryPlan = hasAnalyzeWork(failedPlan) ? failedPlan : null;
      publishEvidence({
        error: failures.length > 0 ? failures.join("; ") : null,
        loading: false,
        operation: undefined,
      });
    } finally {
      if (activeController === controller) activeController = null;
    }
  };

  const analyzeMore = (timeNs: bigint | undefined) => {
    const continuation =
      snapshot.continuation !== undefined && snapshot.scanCanProgress
        ? snapshot.continuation
        : undefined;
    const sampleTimeNs =
      timeNs !== undefined &&
      capability.sample !== undefined &&
      !sampledRequestTimes.has(timeNs)
        ? timeNs
        : undefined;
    void runAnalyzePlan({
      ...(continuation ? { continuation } : {}),
      ...(sampleTimeNs !== undefined ? { sampleTimeNs } : {}),
    });
  };
  const retry = () => {
    if (retryPlan) {
      void runAnalyzePlan(retryPlan);
      return;
    }
    void runScan(snapshot.continuation);
  };
  const start = () => {
    if (started) return;
    started = true;
    void runScan(undefined);
  };

  return {
    analyzeMore,
    capability,
    dispose: () => {
      requestId += 1;
      activeController?.abort();
      activeController = null;
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    retry,
    start,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function createUnavailableStore(): TransformTopologyStore {
  return {
    analyzeMore: () => undefined,
    capability: null,
    dispose: () => undefined,
    getSnapshot: () => INITIAL_STATE,
    retry: () => undefined,
    start: () => undefined,
    subscribe: () => () => undefined,
  };
}

interface AnalyzePlan {
  readonly continuation?: ReadContinuation;
  readonly sampleTimeNs?: bigint;
}

interface MutableAnalyzePlan {
  continuation?: ReadContinuation;
  sampleTimeNs?: bigint;
}

function hasAnalyzeWork(plan: AnalyzePlan): boolean {
  return plan.continuation !== undefined || plan.sampleTimeNs !== undefined;
}

function scanResultMadeProgress(result: TransformTopologyScanResult): boolean {
  return (
    result.continuation === undefined ||
    result.edges.length > 0 ||
    result.frameUses.length > 0 ||
    result.usage.chunksOpened > 0 ||
    result.usage.logicalSourceBytes > 0 ||
    result.usage.logicalUncompressedBytes > 0 ||
    result.usage.messagesDecoded > 0 ||
    [...result.coverageByStream.values()].some(
      (windows) => windows.length > 0,
    ) ||
    (result.unavailableByStream !== undefined &&
      [...result.unavailableByStream.values()].some(
        (windows) => windows.length > 0,
      ))
  );
}

function visibleEvidence(
  scanEdges: readonly EpisodeTransformTopologyEdgeObservation[],
  scanFrameUses: readonly EpisodeTransformTopologyFrameUse[],
  samplesByTime: ReadonlyMap<bigint, TransformTopologySampleResult>,
): Pick<TransformTopologyScanState, "edges" | "frameUses" | "sampledTimesNs"> {
  let edges = scanEdges;
  let frameUses = scanFrameUses;
  const samples = [...samplesByTime].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  for (const [, sample] of samples) {
    edges = mergeSampleEdges(edges, sample.edges);
    frameUses = mergeFrameUses(frameUses, sample.frameUses);
  }
  return {
    edges,
    frameUses,
    sampledTimesNs: samples.map(([timeNs]) => timeNs),
  };
}

/** Adds non-overlapping continuation observations to aggregate scan evidence. */
function mergeScanEdges(
  left: readonly EpisodeTransformTopologyEdgeObservation[],
  right: readonly EpisodeTransformTopologyEdgeObservation[],
): readonly EpisodeTransformTopologyEdgeObservation[] {
  const edges = new Map(
    left.map((edge) => [transformObservationIdentity(edge), edge]),
  );
  for (const edge of right) {
    const identity = transformObservationIdentity(edge);
    const current = edges.get(identity);
    edges.set(
      identity,
      current
        ? {
            ...current,
            firstObservedTimeNs: minDefined(
              current.firstObservedTimeNs,
              edge.firstObservedTimeNs,
            ),
            lastObservedTimeNs: maxDefined(
              current.lastObservedTimeNs,
              edge.lastObservedTimeNs,
            ),
            occurrenceCount: current.occurrenceCount + edge.occurrenceCount,
          }
        : edge,
    );
  }
  return [...edges.values()];
}

/** Adds sampled identities without inflating recording-scan occurrence counts. */
function mergeSampleEdges(
  left: readonly EpisodeTransformTopologyEdgeObservation[],
  right: readonly EpisodeTransformTopologyEdgeObservation[],
): readonly EpisodeTransformTopologyEdgeObservation[] {
  const edges = new Map(
    left.map((edge) => [transformObservationIdentity(edge), edge]),
  );
  for (const edge of right) {
    const identity = transformObservationIdentity(edge);
    const current = edges.get(identity);
    if (!current) {
      edges.set(identity, edge);
      continue;
    }
    edges.set(identity, {
      ...current,
      firstObservedTimeNs: minDefined(
        current.firstObservedTimeNs,
        edge.firstObservedTimeNs,
      ),
      lastObservedTimeNs: maxDefined(
        current.lastObservedTimeNs,
        edge.lastObservedTimeNs,
      ),
    });
  }
  return [...edges.values()];
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

function countUnavailableSpans(result: {
  readonly unavailableByStream?: ReadonlyMap<
    string,
    readonly { readonly endNs: bigint; readonly startNs: bigint }[]
  >;
}): number {
  return result.unavailableByStream
    ? [...result.unavailableByStream.values()].reduce(
        (count, windows) => count + windows.length,
        0,
      )
    : 0;
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

function minDefined(
  left: bigint | undefined,
  right: bigint | undefined,
): bigint | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left < right ? left : right;
}

function maxDefined(
  left: bigint | undefined,
  right: bigint | undefined,
): bigint | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left > right ? left : right;
}

function hasTopology(evidence: {
  readonly edges: readonly unknown[];
  readonly frameUses: readonly unknown[];
}): boolean {
  return evidence.edges.length > 0 || evidence.frameUses.length > 0;
}
