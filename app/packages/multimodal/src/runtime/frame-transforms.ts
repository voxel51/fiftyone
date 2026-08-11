import { Quaternion, Vector3 } from "three";

import { maxBigIntPair } from "../utils/bigint";
import {
  compareFrameGraphEdges,
  compareFrameIds,
  dynamicChildFrameIdsForPlacement,
  normalizeFrameId,
  summarizeEpisodeFrameGraph,
} from "./frame-transform-graph";
import type {
  EpisodeFrameGraphEdge,
  EpisodeFrameGraphSummary,
} from "./frame-transform-graph";
import {
  frameTransformIndexedRangeEndCovering,
  isFrameTransformRangeIndexed,
  isFrameTransformTimeIndexed,
  mergeFrameTransformTimeRanges,
} from "./frame-transform-ranges";
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
const MAX_TOPOLOGY_PATH_CACHE_ENTRIES = 64;

export { EMPTY_EPISODE_FRAME_GRAPH_SUMMARY } from "./frame-transform-graph";
export type { EpisodeFrameGraphSummary } from "./frame-transform-graph";

type EffectiveDynamicTransformResult =
  | {
      readonly status: "resolved";
      readonly transform: EpisodeComposedFrameTransform;
    }
  | { readonly status: "unavailable" };

interface EpisodeFrameTransformIndex {
  readonly adjacency: ReadonlyMap<
    string,
    readonly EpisodeFrameTransformTraversal[]
  >;
}

interface EpisodeFrameTransformTopologyPathStep {
  readonly childFrameId: string;
  readonly direction: "child-to-parent" | "parent-to-child";
  readonly parentFrameId: string;
}

interface EpisodeFrameTransformTraversal extends EpisodeFrameTransformTopologyPathStep {
  readonly transform: EpisodeComposedFrameTransform;
}

interface EpisodeFrameTransformPathResolution {
  readonly path: readonly EpisodeFrameTransformTopologyPathStep[];
  readonly transform: EpisodeComposedFrameTransform;
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
  private readonly topologyPathCache = new Map<
    string,
    readonly EpisodeFrameTransformTopologyPathStep[]
  >();
  private readonly staticSamplesByEdge = new Map<
    string,
    EpisodeFrameTransformSample
  >();
  private readonly staticSamplesByChild = new Map<
    string,
    EpisodeFrameTransformSample[]
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
          this.advanceTopologyRevision();
        }
        this.staticSamplesByEdge.set(key, normalized);
        const childSamples =
          this.staticSamplesByChild.get(normalized.childFrameId) ?? [];
        const existingIndex = childSamples.findIndex(
          (candidate) => frameTransformEdgeKey(candidate) === key,
        );
        if (existingIndex >= 0) {
          childSamples[existingIndex] = normalized;
        } else {
          childSamples.push(normalized);
        }
        this.staticSamplesByChild.set(normalized.childFrameId, childSamples);
        this.addFrameIds(normalized);
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
        this.advanceTopologyRevision();
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

    this.dynamicRanges = mergeFrameTransformTimeRanges([
      ...this.dynamicRanges,
      range,
    ]);
  }

  isTimeIndexed(timeNs: bigint): boolean {
    return isFrameTransformTimeIndexed(this.dynamicRanges, timeNs);
  }

  isRangeIndexed(range: EpisodeFrameTransformTimeRange): boolean {
    return isFrameTransformRangeIndexed(this.dynamicRanges, range);
  }

  indexedRangeEndCovering(timeNs: bigint): bigint | null {
    return frameTransformIndexedRangeEndCovering(this.dynamicRanges, timeNs);
  }

  indexedRanges(): readonly EpisodeFrameTransformTimeRange[] {
    return this.dynamicRanges;
  }

  /** Dynamic child-frame inventory already observed for this source. */
  dynamicChildFrameIds(): readonly string[] {
    return [...this.dynamicSamplesByChild.keys()].sort(compareFrameIds);
  }

  /**
   * Returns the slowest observed cadence across the requested dynamic children.
   * `null` means at least one edge lacks enough evidence for a bounded point
   * lookup, so callers should use their correctness-preserving window path.
   */
  maxObservedCadenceNsForChildren(
    childFrameIds: readonly string[],
  ): bigint | null {
    let maximum: bigint | null = null;
    for (const childFrameId of new Set(childFrameIds)) {
      const samples = this.dynamicSamplesByChild.get(childFrameId);
      if (!samples || samples.length === 0) return null;
      const edgeKeys = new Set(samples.map(frameTransformEdgeKey));
      for (const edgeKey of edgeKeys) {
        const cadence = this.dynamicCadenceByEdge
          .get(edgeKey)
          ?.medianCadenceNs();
        if (cadence === undefined || cadence === null) return null;
        maximum = maximum === null || cadence > maximum ? cadence : maximum;
      }
    }
    return maximum;
  }

  /**
   * Returns the dynamic child edges on one known topology path from every
   * requested frame to the target. The result is a read hint, not a
   * correctness proof: callers must still resolve the requested placements
   * after materializing the anchors because parent relationships can change
   * over time. `null` means the observed union topology cannot prove a path.
   */
  dynamicChildFrameIdsForPlacement({
    frameIds,
    targetFrameId,
  }: {
    readonly frameIds: readonly string[];
    readonly targetFrameId: string;
  }): readonly string[] | null {
    return dynamicChildFrameIdsForPlacement({
      dynamicChildFrameIds: this.dynamicSamplesByChild,
      edges: this.graphEdges(),
      frameIds,
      targetFrameId,
    });
  }

  frameIds(): readonly string[] {
    return [...this.frameIdsById].sort(compareFrameIds);
  }

  /** Monotonic signal that changes only when a transform edge is first seen. */
  topologyRevision(): number {
    return this.graphRevision;
  }

  summarizeGraph(
    dataBearingFrameIds: ReadonlySet<string>,
  ): EpisodeFrameGraphSummary {
    return summarizeEpisodeFrameGraph(this.graphEdges(), dataBearingFrameIds);
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
    const source = normalizeFrameId(sourceFrameId);
    const target = normalizeFrameId(targetFrameId);
    if (!source || !target) {
      return {
        missingReason: "invalid-frame",
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

    const cachedTransform = this.resolveCachedTopologyPath({
      policy,
      sourceFrameId: source,
      targetFrameId: target,
      timeNs,
    });
    const resolved =
      cachedTransform ??
      resolveComposedTransform({
        adjacency: this.buildTransformIndex(timeNs, policy).adjacency,
        sourceFrameId: source,
        targetFrameId: target,
      });
    if (resolved) {
      if (!cachedTransform) {
        this.rememberTopologyPath(source, target, resolved.path);
      }
      const transform = resolved.transform;
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
      missingReason:
        this.dynamicChildFrameIdsForPlacement({
          frameIds: [source],
          targetFrameId: target,
        }) === null
          ? "disconnected"
          : "unavailable-at-time",
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
    const source = normalizeFrameId(sourceFrameId);
    if (!source) {
      return { sourceFrameId, status: "missing" };
    }

    const transforms = this.effectiveTransformsForChild(source, timeNs, policy);
    const transform = transforms[transforms.length - 1];
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

  private buildTransformIndex(
    timeNs: bigint | undefined,
    policy: EpisodeFrameTransformPolicy,
  ): EpisodeFrameTransformIndex {
    const adjacency = new Map<string, EpisodeFrameTransformTraversal[]>();
    for (const childToParent of this.effectiveTransformsForTime(
      timeNs,
      policy,
    )) {
      const childFrameId = childToParent.sourceFrameId;
      const parentFrameId = childToParent.targetFrameId;
      pushAdjacency(adjacency, childFrameId, {
        childFrameId,
        direction: "child-to-parent",
        parentFrameId,
        transform: childToParent,
      });
      pushAdjacency(adjacency, parentFrameId, {
        childFrameId,
        direction: "parent-to-child",
        parentFrameId,
        transform: invertFrameTransform(childToParent),
      });
    }

    return { adjacency };
  }

  private resolveCachedTopologyPath({
    policy,
    sourceFrameId,
    targetFrameId,
    timeNs,
  }: {
    readonly policy: EpisodeFrameTransformPolicy;
    readonly sourceFrameId: string;
    readonly targetFrameId: string;
    readonly timeNs: bigint | undefined;
  }): EpisodeFrameTransformPathResolution | null {
    const key = this.topologyPathKey(sourceFrameId, targetFrameId);
    const path = this.topologyPathCache.get(key);
    if (!path) return null;
    this.topologyPathCache.delete(key);
    this.topologyPathCache.set(key, path);

    let transform: EpisodeComposedFrameTransform = {
      resolutionKind: "identity",
      rotation: IDENTITY_QUATERNION.clone(),
      sourceFrameId,
      targetFrameId: sourceFrameId,
      translation: ZERO_VECTOR.clone(),
    };
    for (const step of path) {
      const childToParent = this.effectiveTransformsForChild(
        step.childFrameId,
        timeNs,
        policy,
      ).find((candidate) => candidate.targetFrameId === step.parentFrameId);
      if (!childToParent) return null;
      const edge =
        step.direction === "child-to-parent"
          ? childToParent
          : invertFrameTransform(childToParent);
      if (edge.sourceFrameId !== transform.targetFrameId) return null;
      transform = composeFrameTransforms(transform, edge);
    }
    if (transform.targetFrameId !== targetFrameId) return null;

    return {
      path,
      transform: { ...transform, sourceFrameId, targetFrameId },
    };
  }

  private rememberTopologyPath(
    sourceFrameId: string,
    targetFrameId: string,
    path: readonly EpisodeFrameTransformTopologyPathStep[],
  ): void {
    const key = this.topologyPathKey(sourceFrameId, targetFrameId);
    this.topologyPathCache.delete(key);
    this.topologyPathCache.set(key, path);
    if (this.topologyPathCache.size > MAX_TOPOLOGY_PATH_CACHE_ENTRIES) {
      const oldestKey = this.topologyPathCache.keys().next().value;
      if (oldestKey !== undefined) this.topologyPathCache.delete(oldestKey);
    }
  }

  private topologyPathKey(sourceFrameId: string, targetFrameId: string) {
    return `${this.graphRevision}\0${sourceFrameId}\0${targetFrameId}`;
  }

  private advanceTopologyRevision(): void {
    this.graphRevision += 1;
    this.topologyPathCache.clear();
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

  private effectiveTransformsForChild(
    childFrameId: string,
    timeNs: bigint | undefined,
    policy: EpisodeFrameTransformPolicy,
  ): readonly EpisodeComposedFrameTransform[] {
    const staticTransforms = (
      this.staticSamplesByChild.get(childFrameId) ?? []
    ).map((sample) => transformFromSample(sample, "static"));
    if (timeNs === undefined) return staticTransforms;

    const childSamples = this.dynamicSamplesByChild.get(childFrameId);
    if (!childSamples?.length) return staticTransforms;
    const { after, before } = bracketSamplesForTime(childSamples, timeNs);
    const activeSample = before ?? after;
    if (!activeSample) return staticTransforms;
    if (!before && after && staticTransforms.length > 0) {
      return staticTransforms;
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
    return result.status === "resolved" ? [result.transform] : staticTransforms;
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
        dynamic: false,
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
        dynamic: true,
        parentFrameId: sample.parentFrameId,
      });
    }

    return [...edges.values()].sort(compareFrameGraphEdges);
  }
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
    readonly EpisodeFrameTransformTraversal[]
  >;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
}): EpisodeFrameTransformPathResolution | null {
  const queue: EpisodeFrameTransformPathResolution[] = [
    {
      path: [],
      transform: {
        resolutionKind: "identity",
        rotation: IDENTITY_QUATERNION.clone(),
        sourceFrameId,
        targetFrameId: sourceFrameId,
        translation: ZERO_VECTOR.clone(),
      },
    },
  ];
  const visited = new Set([sourceFrameId]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) {
      continue;
    }

    const edges = adjacency.get(current.transform.targetFrameId) ?? [];
    for (const traversal of edges) {
      const edge = traversal.transform;
      if (visited.has(edge.targetFrameId)) {
        continue;
      }

      const composed = composeFrameTransforms(current.transform, edge);
      const path = [
        ...current.path,
        {
          childFrameId: traversal.childFrameId,
          direction: traversal.direction,
          parentFrameId: traversal.parentFrameId,
        },
      ];
      if (composed.targetFrameId === targetFrameId) {
        return {
          path,
          transform: {
            ...composed,
            sourceFrameId,
            targetFrameId,
          },
        };
      }

      visited.add(edge.targetFrameId);
      queue.push({ path, transform: composed });
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
  const parentFrameId = normalizeFrameId(sample.parentFrameId);
  const childFrameId = normalizeFrameId(sample.childFrameId);
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
    ? compareFrameIds(left.parentFrameId, right.parentFrameId)
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

  return { maxInterpolationGapNs: maxBigIntPair(first, second) };
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
