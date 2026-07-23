import { Quaternion, Vector3 } from "three";

import { compareBigInt } from "../ir";
import {
  DEFAULT_OBSERVATION_STALE_THRESHOLD_NS,
  DEFAULT_TRANSFORM_INTERPOLATION_GAP_NS,
  EpisodeCadenceTracker,
} from "./temporal-policy";
import type {
  EpisodeComposedFrameTransform,
  EpisodeFrameTransformPolicy,
  EpisodeFrameTransformResolution,
  EpisodeFrameTransformResolutionKind,
  EpisodeFrameTransformSample,
  EpisodeFrameTransformSet,
  EpisodeFrameTransformSetWire,
  EpisodeFrameTransformTimeRange,
  EpisodeHeldFrameTransform,
  EpisodeHeldFrameTransformReason,
  EpisodeParentFrameTransformResolution,
} from "./frame-transform-types";

const IDENTITY_QUATERNION = new Quaternion();
const ZERO_VECTOR = new Vector3();
const DEFAULT_FRAME_TRANSFORM_POLICY: EpisodeFrameTransformPolicy = {
  boundaryClampNs: 50_000_000n,
};
const MAX_ADJACENCY_CACHE_ENTRIES = 8;

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export interface EpisodeFrameGraphSummary {
  /** Bidirectional transform components, normalized and sorted by stable id. */
  readonly components: readonly (readonly string[])[];
  readonly dataBearingReachableCountsByFrameId: ReadonlyMap<string, number>;
  readonly reachableCountsByFrameId: ReadonlyMap<string, number>;
  readonly roots: readonly string[];
  readonly tfConnectedFrameIds: readonly string[];
}

export const EMPTY_EPISODE_FRAME_GRAPH_SUMMARY: EpisodeFrameGraphSummary = {
  components: [],
  dataBearingReachableCountsByFrameId: new Map(),
  reachableCountsByFrameId: new Map(),
  roots: [],
  tfConnectedFrameIds: [],
};

interface EpisodeFrameGraphEdge {
  readonly childFrameId: string;
  readonly parentFrameId: string;
}

type EffectiveDynamicTransformResult =
  | {
      readonly status: "resolved";
      readonly transform: EpisodeComposedFrameTransform;
    }
  | { readonly status: "unavailable" };

interface EpisodeFrameTransformIndex {
  readonly adjacency: ReadonlyMap<
    string,
    readonly EpisodeComposedFrameTransform[]
  >;
  readonly parentTransformsByChildFrameId: ReadonlyMap<
    string,
    EpisodeComposedFrameTransform
  >;
}

/**
 * Mutable frame transform index for static and dynamic episode transform samples.
 */
export class EpisodeFrameTransformStore {
  private readonly dynamicCadenceByEdge = new Map<
    string,
    EpisodeCadenceTracker
  >();
  private readonly dynamicSamplesByEdge = new Map<
    string,
    EpisodeFrameTransformSample[]
  >();
  private readonly dynamicSamplesByChild = new Map<
    string,
    EpisodeFrameTransformSample[]
  >();
  private dynamicRanges: readonly EpisodeFrameTransformTimeRange[] = [];
  private graphRevision = 0;
  private readonly frameIdsById = new Set<string>();
  private readonly adjacencyCache = new Map<
    string,
    EpisodeFrameTransformIndex
  >();
  private readonly staticSamplesByEdge = new Map<
    string,
    EpisodeFrameTransformSample
  >();

  addStatic(samples: readonly EpisodeFrameTransformSample[]): void {
    for (const sample of samples) {
      const normalized = cleanSample(sample);
      if (normalized) {
        const key = frameTransformEdgeKey(normalized);
        if (
          !this.staticSamplesByEdge.has(key) &&
          !this.dynamicSamplesByEdge.has(key)
        ) {
          this.graphRevision += 1;
        }
        this.staticSamplesByEdge.set(key, normalized);
        this.addFrameIds(normalized);
        this.adjacencyCache.clear();
      }
    }
  }

  addDynamic(
    samples: readonly EpisodeFrameTransformSample[],
    range: EpisodeFrameTransformTimeRange,
  ): void {
    const touchedChildren = new Set<string>();
    const touchedEdges = new Set<string>();

    for (const sample of samples) {
      const normalized = cleanSample(sample);
      if (!normalized || normalized.timeNs === undefined) {
        continue;
      }

      const key = frameTransformEdgeKey(normalized);
      if (
        !this.dynamicSamplesByEdge.has(key) &&
        !this.staticSamplesByEdge.has(key)
      ) {
        this.graphRevision += 1;
      }
      const edgeSamples = this.dynamicSamplesByEdge.get(key) ?? [];
      edgeSamples.push(normalized);
      this.dynamicSamplesByEdge.set(key, edgeSamples);
      const childSamples =
        this.dynamicSamplesByChild.get(normalized.childFrameId) ?? [];
      childSamples.push(normalized);
      this.dynamicSamplesByChild.set(normalized.childFrameId, childSamples);
      const cadence =
        this.dynamicCadenceByEdge.get(key) ?? new EpisodeCadenceTracker();
      cadence.observe(normalized.timeNs);
      this.dynamicCadenceByEdge.set(key, cadence);
      this.addFrameIds(normalized);
      touchedChildren.add(normalized.childFrameId);
      touchedEdges.add(key);
    }

    for (const key of touchedEdges) {
      const edgeSamples = this.dynamicSamplesByEdge.get(key);
      edgeSamples?.sort(compareFrameTransformSamplesByTime);
    }
    for (const childFrameId of touchedChildren) {
      this.dynamicSamplesByChild
        .get(childFrameId)
        ?.sort(compareFrameTransformSamplesByTimeAndParent);
    }

    this.dynamicRanges = sortAndMergeTimeRanges([...this.dynamicRanges, range]);
    this.adjacencyCache.clear();
  }

  isTimeIndexed(timeNs: bigint): boolean {
    return this.dynamicRanges.some(
      (range) => range.startTimeNs <= timeNs && timeNs <= range.endTimeNs,
    );
  }

  isRangeIndexed(range: EpisodeFrameTransformTimeRange): boolean {
    return this.dynamicRanges.some(
      (indexedRange) =>
        indexedRange.startTimeNs <= range.startTimeNs &&
        range.endTimeNs <= indexedRange.endTimeNs,
    );
  }

  indexedRangeEndCovering(timeNs: bigint): bigint | null {
    const range = this.dynamicRanges.find(
      (candidate) =>
        candidate.startTimeNs <= timeNs && timeNs <= candidate.endTimeNs,
    );
    return range?.endTimeNs ?? null;
  }

  indexedRanges(): readonly EpisodeFrameTransformTimeRange[] {
    return this.dynamicRanges;
  }

  frameIds(): readonly string[] {
    return [...this.frameIdsById].sort(compareStrings);
  }

  /** Monotonic signal that changes only when a transform edge is first seen. */
  topologyRevision(): number {
    return this.graphRevision;
  }

  summarizeGraph(
    dataBearingFrameIds: ReadonlySet<string>,
  ): EpisodeFrameGraphSummary {
    const edges = this.graphEdges();
    if (edges.length === 0) {
      return EMPTY_EPISODE_FRAME_GRAPH_SUMMARY;
    }

    const childFrameIds = new Set<string>();
    const childrenByParent = new Map<string, string[]>();
    const undirectedAdjacency = new Map<string, string[]>();
    const frameIds = new Set<string>();
    const parentFrameIds = new Set<string>();

    for (const edge of edges) {
      childFrameIds.add(edge.childFrameId);
      frameIds.add(edge.childFrameId);
      frameIds.add(edge.parentFrameId);
      parentFrameIds.add(edge.parentFrameId);
      pushAdjacency(childrenByParent, edge.parentFrameId, edge.childFrameId);
      pushAdjacency(undirectedAdjacency, edge.parentFrameId, edge.childFrameId);
      pushAdjacency(undirectedAdjacency, edge.childFrameId, edge.parentFrameId);
    }

    for (const children of childrenByParent.values()) {
      children.sort(compareStrings);
    }

    const tfConnectedFrameIds = [...frameIds].sort(compareStrings);
    const components = connectedComponents(
      tfConnectedFrameIds,
      undirectedAdjacency,
    );
    const roots = [...parentFrameIds]
      .filter((frameId) => !childFrameIds.has(frameId))
      .sort(compareStrings);
    const reachableCountsByFrameId = new Map<string, number>();
    const dataBearingReachableCountsByFrameId = new Map<string, number>();

    for (const frameId of tfConnectedFrameIds) {
      const reachableFrameIds = reachableFrameIdsFrom(
        frameId,
        childrenByParent,
      );
      reachableCountsByFrameId.set(frameId, reachableFrameIds.length);
      dataBearingReachableCountsByFrameId.set(
        frameId,
        reachableFrameIds.filter((reachableFrameId) =>
          dataBearingFrameIds.has(reachableFrameId),
        ).length,
      );
    }

    return {
      components,
      dataBearingReachableCountsByFrameId,
      reachableCountsByFrameId,
      roots,
      tfConnectedFrameIds,
    };
  }

  resolve({
    policy = DEFAULT_FRAME_TRANSFORM_POLICY,
    sourceFrameId,
    targetFrameId,
    timeNs,
  }: {
    readonly policy?: EpisodeFrameTransformPolicy;
    readonly sourceFrameId: string;
    readonly targetFrameId: string;
    readonly timeNs?: bigint;
  }): EpisodeFrameTransformResolution {
    const source = nonEmpty(sourceFrameId);
    const target = nonEmpty(targetFrameId);
    if (!source || !target) {
      return {
        sourceFrameId,
        status: "missing",
        targetFrameId,
      };
    }

    if (source === target) {
      return {
        resolutionKind: "identity",
        sourceFrameId: source,
        status: "resolved",
        targetFrameId: target,
        transform: {
          resolutionKind: "identity",
          rotation: IDENTITY_QUATERNION.clone(),
          sourceFrameId: source,
          targetFrameId: target,
          translation: ZERO_VECTOR.clone(),
        },
      };
    }

    const adjacency = this.buildAdjacency(timeNs, policy);
    const transform = resolveComposedTransform({
      adjacency,
      sourceFrameId: source,
      targetFrameId: target,
    });
    if (transform) {
      return {
        ...(transform.heldEdges?.length
          ? { heldEdges: transform.heldEdges }
          : {}),
        ...(transform.maxInterpolationGapNs !== undefined
          ? { maxInterpolationGapNs: transform.maxInterpolationGapNs }
          : {}),
        resolutionKind: transform.resolutionKind,
        sourceFrameId: source,
        status: "resolved",
        targetFrameId: target,
        transform,
      };
    }

    if (timeNs !== undefined && !this.isTimeIndexed(timeNs)) {
      return {
        sourceFrameId: source,
        status: "pending",
        targetFrameId: target,
      };
    }

    return {
      sourceFrameId: source,
      status: "missing",
      targetFrameId: target,
    };
  }

  resolveParent({
    policy = DEFAULT_FRAME_TRANSFORM_POLICY,
    sourceFrameId,
    timeNs,
  }: {
    readonly policy?: EpisodeFrameTransformPolicy;
    readonly sourceFrameId: string;
    readonly timeNs?: bigint;
  }): EpisodeParentFrameTransformResolution {
    const source = nonEmpty(sourceFrameId);
    if (!source) {
      return { sourceFrameId, status: "missing" };
    }

    const transform = this.buildTransformIndex(
      timeNs,
      policy,
    ).parentTransformsByChildFrameId.get(source);
    if (transform) {
      return {
        parentFrameId: transform.targetFrameId,
        sourceFrameId: source,
        status: "resolved",
        transform,
      };
    }

    if (
      timeNs !== undefined &&
      this.dynamicSamplesByChild.has(source) &&
      !this.isTimeIndexed(timeNs)
    ) {
      return { sourceFrameId: source, status: "pending" };
    }
    return { sourceFrameId: source, status: "missing" };
  }

  private buildAdjacency(
    timeNs: bigint | undefined,
    policy: EpisodeFrameTransformPolicy,
  ) {
    return this.buildTransformIndex(timeNs, policy).adjacency;
  }

  private buildTransformIndex(
    timeNs: bigint | undefined,
    policy: EpisodeFrameTransformPolicy,
  ): EpisodeFrameTransformIndex {
    const timeKey = frameTransformTimeKey(timeNs, policy);
    const cached = this.adjacencyCache.get(timeKey);
    if (cached) {
      this.adjacencyCache.delete(timeKey);
      this.adjacencyCache.set(timeKey, cached);
      return cached;
    }

    const adjacency = new Map<string, EpisodeComposedFrameTransform[]>();
    const parentTransformsByChildFrameId = new Map<
      string,
      EpisodeComposedFrameTransform
    >();
    for (const childToParent of this.effectiveTransformsForTime(
      timeNs,
      policy,
    )) {
      parentTransformsByChildFrameId.set(
        childToParent.sourceFrameId,
        childToParent,
      );
      pushAdjacency(adjacency, childToParent.sourceFrameId, childToParent);
      pushAdjacency(
        adjacency,
        childToParent.targetFrameId,
        invertFrameTransform(childToParent),
      );
    }

    const index = { adjacency, parentTransformsByChildFrameId };
    this.adjacencyCache.set(timeKey, index);
    if (this.adjacencyCache.size > MAX_ADJACENCY_CACHE_ENTRIES) {
      const oldestKey = this.adjacencyCache.keys().next().value;
      if (oldestKey !== undefined) this.adjacencyCache.delete(oldestKey);
    }

    return index;
  }

  private effectiveTransformsForTime(
    timeNs: bigint | undefined,
    policy: EpisodeFrameTransformPolicy,
  ) {
    const transforms = new Map<string, EpisodeComposedFrameTransform>();

    for (const [edgeKey, sample] of this.staticSamplesByEdge.entries()) {
      transforms.set(edgeKey, transformFromSample(sample, "static"));
    }

    if (timeNs === undefined) {
      return [...transforms.values()];
    }

    for (const [childFrameId, childSamples] of this.dynamicSamplesByChild) {
      const { after, before } = bracketSamplesForTime(childSamples, timeNs);
      const activeSample = before ?? after;
      if (!activeSample) continue;
      // A static relationship remains authoritative until the first dynamic
      // relationship is recorded. In particular, the pre-start timestamp
      // clamp must never activate a different parent before its timestamp.
      if (
        !before &&
        after &&
        hasEffectiveTransformForChild(transforms, childFrameId)
      ) {
        continue;
      }
      const edgeKey = frameTransformEdgeKey(activeSample);
      const cadence = this.dynamicCadenceByEdge.get(edgeKey);
      const result = effectiveDynamicTransformForTime(
        { after, before },
        timeNs,
        policy,
        cadence?.interpolationGapLimitNs() ??
          DEFAULT_TRANSFORM_INTERPOLATION_GAP_NS,
        cadence?.observationStaleThresholdNs() ??
          DEFAULT_OBSERVATION_STALE_THRESHOLD_NS,
      );
      if (result.status === "resolved") {
        removeTransformsForChild(transforms, childFrameId);
        transforms.set(edgeKey, result.transform);
      }
    }

    return [...transforms.values()];
  }

  private addFrameIds(sample: EpisodeFrameTransformSample): void {
    this.frameIdsById.add(sample.parentFrameId);
    this.frameIdsById.add(sample.childFrameId);
  }

  private graphEdges(): readonly EpisodeFrameGraphEdge[] {
    const edges = new Map<string, EpisodeFrameGraphEdge>();

    for (const [key, sample] of this.staticSamplesByEdge.entries()) {
      edges.set(key, {
        childFrameId: sample.childFrameId,
        parentFrameId: sample.parentFrameId,
      });
    }

    for (const [key, samples] of this.dynamicSamplesByEdge.entries()) {
      const sample = samples[0];
      if (!sample) {
        continue;
      }
      edges.set(key, {
        childFrameId: sample.childFrameId,
        parentFrameId: sample.parentFrameId,
      });
    }

    return [...edges.values()].sort((left, right) => {
      const parentOrder = compareStrings(
        left.parentFrameId,
        right.parentFrameId,
      );
      return parentOrder === 0
        ? compareStrings(left.childFrameId, right.childFrameId)
        : parentOrder;
    });
  }
}

function connectedComponents(
  frameIds: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
): readonly (readonly string[])[] {
  const components: string[][] = [];
  const visited = new Set<string>();

  for (const frameId of frameIds) {
    if (visited.has(frameId)) continue;
    const component: string[] = [];
    const stack = [frameId];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      const neighbors = adjacency.get(current) ?? [];
      for (let index = neighbors.length - 1; index >= 0; index -= 1) {
        const neighbor = neighbors[index];
        if (neighbor && !visited.has(neighbor)) stack.push(neighbor);
      }
    }
    component.sort(compareStrings);
    components.push(component);
  }

  return components.sort((left, right) =>
    compareStrings(left[0] ?? "", right[0] ?? ""),
  );
}

/**
 * Snapshots THREE-typed samples to plain `{x,y,z[,w]}` shapes safe to send
 * across `postMessage`. Required because `structuredClone` strips THREE
 * prototypes and `Quaternion` exposes `x/y/z/w` only as getters — after the
 * hop those properties read as `undefined`. Reads the values while the
 * prototype is still attached. Pair with `hydrateEpisodeFrameTransformSet` on
 * the receiving side.
 */
export function dehydrateEpisodeFrameTransformSet(
  set: EpisodeFrameTransformSet,
): EpisodeFrameTransformSetWire {
  return {
    ...(set.encodedPayloadBytes !== undefined
      ? { encodedPayloadBytes: set.encodedPayloadBytes }
      : {}),
    ...(set.messageCount !== undefined
      ? { messageCount: set.messageCount }
      : {}),
    samples: set.samples.map((sample) => ({
      ...sample,
      rotation: {
        x: sample.rotation.x,
        y: sample.rotation.y,
        z: sample.rotation.z,
        w: sample.rotation.w,
      },
      translation: {
        x: sample.translation.x,
        y: sample.translation.y,
        z: sample.translation.z,
      },
    })),
    ...(set.streamStats !== undefined ? { streamStats: set.streamStats } : {}),
    ...(set.streams !== undefined ? { streams: set.streams } : {}),
  };
}

/**
 * Re-wraps a dehydrated frame transform set in fresh THREE instances on the
 * receiving side of `postMessage`. Safe on already-hydrated input because it
 * reads structurally.
 */
export function hydrateEpisodeFrameTransformSet(
  set: EpisodeFrameTransformSetWire,
): EpisodeFrameTransformSet {
  return {
    ...(set.encodedPayloadBytes !== undefined
      ? { encodedPayloadBytes: set.encodedPayloadBytes }
      : {}),
    ...(set.messageCount !== undefined
      ? { messageCount: set.messageCount }
      : {}),
    samples: set.samples.map((sample) => ({
      ...sample,
      rotation: new Quaternion(
        sample.rotation.x,
        sample.rotation.y,
        sample.rotation.z,
        sample.rotation.w,
      ).normalize(),
      translation: new Vector3(
        sample.translation.x,
        sample.translation.y,
        sample.translation.z,
      ),
    })),
    ...(set.streamStats !== undefined ? { streamStats: set.streamStats } : {}),
    ...(set.streams !== undefined ? { streams: set.streams } : {}),
  };
}

function resolveComposedTransform({
  adjacency,
  sourceFrameId,
  targetFrameId,
}: {
  readonly adjacency: ReadonlyMap<
    string,
    readonly EpisodeComposedFrameTransform[]
  >;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
}): EpisodeComposedFrameTransform | null {
  const queue: EpisodeComposedFrameTransform[] = [
    {
      resolutionKind: "identity",
      rotation: IDENTITY_QUATERNION.clone(),
      sourceFrameId,
      targetFrameId: sourceFrameId,
      translation: ZERO_VECTOR.clone(),
    },
  ];
  const visited = new Set([sourceFrameId]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) {
      continue;
    }

    const edges = adjacency.get(current.targetFrameId) ?? [];
    for (const edge of edges) {
      if (visited.has(edge.targetFrameId)) {
        continue;
      }

      const composed = composeFrameTransforms(current, edge);
      if (composed.targetFrameId === targetFrameId) {
        return {
          ...composed,
          sourceFrameId,
          targetFrameId,
        };
      }

      visited.add(edge.targetFrameId);
      queue.push(composed);
    }
  }

  return null;
}

function effectiveDynamicTransformForTime(
  {
    after,
    before,
  }: {
    readonly after?: EpisodeFrameTransformSample;
    readonly before?: EpisodeFrameTransformSample;
  },
  timeNs: bigint,
  policy: EpisodeFrameTransformPolicy,
  interpolationGapLimitNs: bigint,
  staleAfterNs: bigint,
): EffectiveDynamicTransformResult {
  if (before?.timeNs === timeNs) {
    return {
      status: "resolved",
      transform: transformFromSample(before, "exact"),
    };
  }
  if (after?.timeNs === timeNs) {
    return {
      status: "resolved",
      transform: transformFromSample(after, "exact"),
    };
  }

  if (before && after) {
    const beforeTimeNs = before.timeNs as bigint;
    const afterTimeNs = after.timeNs as bigint;
    const gapNs = afterTimeNs - beforeTimeNs;
    if (before.parentFrameId !== after.parentFrameId) {
      return {
        status: "resolved",
        transform: heldTransformFromSample({
          reason: "parent-change",
          sample: before,
          staleAfterNs,
          timeNs,
        }),
      };
    }
    if (gapNs <= 0n) {
      return {
        status: "resolved",
        transform: transformFromSample(before, "exact"),
      };
    }
    if (gapNs > interpolationGapLimitNs) {
      return {
        status: "resolved",
        transform: heldTransformFromSample({
          interpolationGapLimitNs,
          interpolationGapNs: gapNs,
          reason: "interpolation-gap",
          sample: before,
          staleAfterNs,
          timeNs,
        }),
      };
    }

    const ratio = Number(timeNs - beforeTimeNs) / Number(gapNs);
    return {
      status: "resolved",
      transform: {
        maxInterpolationGapNs: gapNs,
        resolutionKind: "interpolated",
        rotation: before.rotation
          .clone()
          .slerp(after.rotation, ratio)
          .normalize(),
        sourceFrameId: before.childFrameId,
        targetFrameId: before.parentFrameId,
        translation: before.translation.clone().lerp(after.translation, ratio),
      },
    };
  }

  if (before?.timeNs !== undefined && before.timeNs < timeNs) {
    return {
      status: "resolved",
      transform: heldTransformFromSample({
        reason: "after-last-sample",
        sample: before,
        staleAfterNs,
        timeNs,
      }),
    };
  }

  if (
    policy.boundaryClampNs > 0n &&
    after?.timeNs !== undefined &&
    after.timeNs > timeNs
  ) {
    return after.timeNs - timeNs <= policy.boundaryClampNs
      ? {
          status: "resolved",
          transform: transformFromSample(after, "clamped"),
        }
      : { status: "unavailable" };
  }

  return { status: "unavailable" };
}

function bracketSamplesForTime(
  samples: readonly EpisodeFrameTransformSample[],
  timeNs: bigint,
): {
  readonly after?: EpisodeFrameTransformSample;
  readonly before?: EpisodeFrameTransformSample;
} {
  let low = 0;
  let high = samples.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const sampleTimeNs = samples[middle]?.timeNs;
    if (sampleTimeNs !== undefined && sampleTimeNs < timeNs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const after = samples[low];
  if (after?.timeNs === timeNs) {
    return { after, before: after };
  }

  return {
    ...(after ? { after } : {}),
    ...(low > 0 ? { before: samples[low - 1] } : {}),
  };
}

function transformFromSample(
  sample: EpisodeFrameTransformSample,
  resolutionKind: EpisodeFrameTransformResolutionKind,
): EpisodeComposedFrameTransform {
  return {
    resolutionKind,
    rotation: sample.rotation,
    sourceFrameId: sample.childFrameId,
    targetFrameId: sample.parentFrameId,
    translation: sample.translation,
  };
}

function heldTransformFromSample({
  interpolationGapLimitNs,
  interpolationGapNs,
  reason,
  sample,
  staleAfterNs,
  timeNs,
}: {
  readonly interpolationGapLimitNs?: bigint;
  readonly interpolationGapNs?: bigint;
  readonly reason: EpisodeHeldFrameTransformReason;
  readonly sample: EpisodeFrameTransformSample;
  readonly staleAfterNs: bigint;
  readonly timeNs: bigint;
}): EpisodeComposedFrameTransform {
  const sourceTimeNs = sample.timeNs as bigint;
  const heldEdge: EpisodeHeldFrameTransform = {
    ageNs: timeNs > sourceTimeNs ? timeNs - sourceTimeNs : 0n,
    ...(interpolationGapLimitNs !== undefined
      ? { interpolationGapLimitNs }
      : {}),
    ...(interpolationGapNs !== undefined ? { interpolationGapNs } : {}),
    reason,
    sourceFrameId: sample.childFrameId,
    sourceTimeNs,
    staleAfterNs,
    targetFrameId: sample.parentFrameId,
  };

  return {
    heldEdges: [heldEdge],
    resolutionKind: "held",
    rotation: sample.rotation,
    sourceFrameId: sample.childFrameId,
    targetFrameId: sample.parentFrameId,
    translation: sample.translation,
  };
}

function cleanSample(sample: EpisodeFrameTransformSample) {
  const parentFrameId = nonEmpty(sample.parentFrameId);
  const childFrameId = nonEmpty(sample.childFrameId);
  if (!parentFrameId || !childFrameId) {
    return null;
  }

  return {
    ...sample,
    childFrameId,
    parentFrameId,
    rotation: sample.rotation.clone().normalize(),
    translation: sample.translation.clone(),
  };
}

/**
 * Stable edge key for a frame-transform sample. Accepts wire and hydrated
 * shapes so reader and store can share one definition.
 */
export function frameTransformEdgeKey(sample: {
  readonly childFrameId: string;
  readonly parentFrameId: string;
}) {
  return `${sample.parentFrameId}\0${sample.childFrameId}`;
}

/**
 * Stable order for frame-transform samples by time, treating undefined as
 * before any concrete timestamp.
 */
export function compareFrameTransformSamplesByTime(
  left: { readonly timeNs?: bigint },
  right: { readonly timeNs?: bigint },
) {
  if (left.timeNs === right.timeNs) {
    return 0;
  }
  if (left.timeNs === undefined) {
    return -1;
  }
  if (right.timeNs === undefined) {
    return 1;
  }

  return left.timeNs < right.timeNs ? -1 : 1;
}

function compareFrameTransformSamplesByTimeAndParent(
  left: EpisodeFrameTransformSample,
  right: EpisodeFrameTransformSample,
) {
  const timeOrder = compareFrameTransformSamplesByTime(left, right);
  return timeOrder === 0
    ? compareStrings(left.parentFrameId, right.parentFrameId)
    : timeOrder;
}

function removeTransformsForChild(
  transforms: Map<string, EpisodeComposedFrameTransform>,
  childFrameId: string,
) {
  for (const [key, transform] of transforms) {
    if (transform.sourceFrameId === childFrameId) {
      transforms.delete(key);
    }
  }
}

function hasEffectiveTransformForChild(
  transforms: ReadonlyMap<string, EpisodeComposedFrameTransform>,
  childFrameId: string,
) {
  for (const transform of transforms.values()) {
    if (transform.sourceFrameId === childFrameId) {
      return true;
    }
  }
  return false;
}

function sortAndMergeTimeRanges(
  ranges: readonly EpisodeFrameTransformTimeRange[],
) {
  const sorted = [...ranges].sort((left, right) =>
    left.startTimeNs === right.startTimeNs
      ? compareBigInt(left.endTimeNs, right.endTimeNs)
      : compareBigInt(left.startTimeNs, right.startTimeNs),
  );
  const merged: EpisodeFrameTransformTimeRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.startTimeNs > last.endTimeNs + 1n) {
      merged.push(range);
      continue;
    }

    merged[merged.length - 1] = {
      startTimeNs: last.startTimeNs,
      endTimeNs: maxBigInt(last.endTimeNs, range.endTimeNs),
    };
  }

  return merged;
}

function pushAdjacency<Value>(
  adjacency: Map<string, Value[]>,
  frameId: string,
  value: Value,
) {
  const values = adjacency.get(frameId);
  if (values) {
    values.push(value);
  } else {
    adjacency.set(frameId, [value]);
  }
}

function reachableFrameIdsFrom(
  frameId: string,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
) {
  const reachableFrameIds: string[] = [];
  const visited = new Set<string>();
  const stack = [frameId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    reachableFrameIds.push(current);
    const children = childrenByParent.get(current) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childFrameId = children[index];
      if (childFrameId && !visited.has(childFrameId)) {
        stack.push(childFrameId);
      }
    }
  }

  return reachableFrameIds;
}

function composeFrameTransforms(
  first: EpisodeComposedFrameTransform,
  second: EpisodeComposedFrameTransform,
): EpisodeComposedFrameTransform {
  const firstRotation = first.rotation.clone().normalize();
  const secondRotation = second.rotation.clone().normalize();

  return {
    ...composeHeldEdges(first.heldEdges, second.heldEdges),
    ...composeMaxInterpolationGapNs(
      first.maxInterpolationGapNs,
      second.maxInterpolationGapNs,
    ),
    resolutionKind: composeResolutionKinds(
      first.resolutionKind,
      second.resolutionKind,
    ),
    rotation: secondRotation.clone().multiply(firstRotation).normalize(),
    sourceFrameId: first.sourceFrameId,
    targetFrameId: second.targetFrameId,
    translation: first.translation
      .clone()
      .applyQuaternion(secondRotation)
      .add(second.translation),
  };
}

function invertFrameTransform(
  transform: EpisodeComposedFrameTransform,
): EpisodeComposedFrameTransform {
  const inverseRotation = transform.rotation.clone().normalize().invert();

  return {
    ...(transform.heldEdges?.length ? { heldEdges: transform.heldEdges } : {}),
    ...(transform.maxInterpolationGapNs !== undefined
      ? { maxInterpolationGapNs: transform.maxInterpolationGapNs }
      : {}),
    resolutionKind: transform.resolutionKind,
    rotation: inverseRotation,
    sourceFrameId: transform.targetFrameId,
    targetFrameId: transform.sourceFrameId,
    translation: transform.translation
      .clone()
      .negate()
      .applyQuaternion(inverseRotation),
  };
}

function maxBigInt(left: bigint, right: bigint) {
  return left > right ? left : right;
}

function compareStrings(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function composeMaxInterpolationGapNs(
  first: bigint | undefined,
  second: bigint | undefined,
): { readonly maxInterpolationGapNs?: bigint } {
  if (first === undefined) {
    return second === undefined ? {} : { maxInterpolationGapNs: second };
  }
  if (second === undefined) {
    return { maxInterpolationGapNs: first };
  }

  return { maxInterpolationGapNs: maxBigInt(first, second) };
}

function composeHeldEdges(
  first: readonly EpisodeHeldFrameTransform[] | undefined,
  second: readonly EpisodeHeldFrameTransform[] | undefined,
): { readonly heldEdges?: readonly EpisodeHeldFrameTransform[] } {
  if (!first?.length) {
    return second?.length ? { heldEdges: second } : {};
  }
  if (!second?.length) {
    return { heldEdges: first };
  }

  const edges = new Map<string, EpisodeHeldFrameTransform>();
  for (const edge of [...first, ...second]) {
    const key = `${edge.sourceFrameId}\0${edge.targetFrameId}\0${edge.sourceTimeNs}`;
    edges.set(key, edge);
  }
  return { heldEdges: [...edges.values()] };
}

function composeResolutionKinds(
  first: EpisodeFrameTransformResolutionKind | undefined,
  second: EpisodeFrameTransformResolutionKind | undefined,
): EpisodeFrameTransformResolutionKind | undefined {
  const kinds = [first, second].filter(
    (kind): kind is EpisodeFrameTransformResolutionKind => kind !== undefined,
  );
  if (kinds.includes("held")) return "held";
  if (kinds.includes("clamped")) return "clamped";
  if (kinds.includes("interpolated")) return "interpolated";
  if (kinds.includes("exact")) return "exact";
  if (kinds.includes("static")) return "static";
  if (kinds.includes("identity")) return "identity";
  return undefined;
}

function frameTransformTimeKey(
  timeNs: bigint | undefined,
  policy: EpisodeFrameTransformPolicy,
) {
  return [
    timeNs === undefined ? "static" : timeNs.toString(),
    policy.boundaryClampNs.toString(),
  ].join(":");
}
