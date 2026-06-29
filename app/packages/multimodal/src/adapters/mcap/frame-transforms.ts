import { Quaternion, Vector3 } from "three";

import { nonEmpty } from "./strings";
import type {
  McapComposedFrameTransform,
  McapFrameTransformPolicy,
  McapFrameTransformResolution,
  McapFrameTransformResolutionKind,
  McapFrameTransformSample,
  McapFrameTransformSet,
  McapFrameTransformSetWire,
  McapFrameTransformTimeRange,
} from "./frame-transform-types";
import { compareBigInt } from "./sync";

const IDENTITY_QUATERNION = new Quaternion();
const ZERO_VECTOR = new Vector3();
const DEFAULT_FRAME_TRANSFORM_POLICY: McapFrameTransformPolicy = {
  boundaryClampNs: 50_000_000n,
  maxInterpolationGapNs: 0n,
};

/**
 * Mutable frame transform index for static and dynamic MCAP transform samples.
 */
export class McapFrameTransformStore {
  private readonly dynamicSamplesByEdge = new Map<
    string,
    McapFrameTransformSample[]
  >();
  private dynamicRanges: readonly McapFrameTransformTimeRange[] = [];
  private readonly frameIdsById = new Set<string>();
  private adjacencyCache: {
    readonly adjacency: Map<string, McapComposedFrameTransform[]>;
    readonly timeKey: string;
  } | null = null;
  private readonly staticSamplesByEdge = new Map<
    string,
    McapFrameTransformSample
  >();

  addStatic(samples: readonly McapFrameTransformSample[]): void {
    for (const sample of samples) {
      const normalized = cleanSample(sample);
      if (normalized) {
        this.staticSamplesByEdge.set(
          frameTransformEdgeKey(normalized),
          normalized,
        );
        this.addFrameIds(normalized);
        this.adjacencyCache = null;
      }
    }
  }

  addDynamic(
    samples: readonly McapFrameTransformSample[],
    range: McapFrameTransformTimeRange,
  ): void {
    const touchedEdges = new Set<string>();

    for (const sample of samples) {
      const normalized = cleanSample(sample);
      if (!normalized || normalized.timeNs === undefined) {
        continue;
      }

      const key = frameTransformEdgeKey(normalized);
      const edgeSamples = this.dynamicSamplesByEdge.get(key) ?? [];
      edgeSamples.push(normalized);
      this.dynamicSamplesByEdge.set(key, edgeSamples);
      this.addFrameIds(normalized);
      touchedEdges.add(key);
    }

    for (const key of touchedEdges) {
      this.dynamicSamplesByEdge
        .get(key)
        ?.sort(compareFrameTransformSamplesByTime);
    }

    this.dynamicRanges = sortAndMergeTimeRanges([...this.dynamicRanges, range]);
    this.adjacencyCache = null;
  }

  isTimeIndexed(timeNs: bigint): boolean {
    return this.dynamicRanges.some(
      (range) => range.startTimeNs <= timeNs && timeNs <= range.endTimeNs,
    );
  }

  frameIds(): readonly string[] {
    return [...this.frameIdsById].sort(compareStrings);
  }

  resolve({
    policy = DEFAULT_FRAME_TRANSFORM_POLICY,
    sourceFrameId,
    targetFrameId,
    timeNs,
  }: {
    readonly policy?: McapFrameTransformPolicy;
    readonly sourceFrameId: string;
    readonly targetFrameId: string;
    readonly timeNs?: bigint;
  }): McapFrameTransformResolution {
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

    const transform = resolveComposedTransform({
      adjacency: this.buildAdjacency(timeNs, policy),
      sourceFrameId: source,
      targetFrameId: target,
    });
    if (transform) {
      return {
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

  private buildAdjacency(
    timeNs: bigint | undefined,
    policy: McapFrameTransformPolicy,
  ) {
    const timeKey = frameTransformTimeKey(timeNs, policy);
    if (this.adjacencyCache?.timeKey === timeKey) {
      return this.adjacencyCache.adjacency;
    }

    const adjacency = new Map<string, McapComposedFrameTransform[]>();

    for (const childToParent of this.effectiveTransformsForTime(
      timeNs,
      policy,
    )) {
      pushAdjacency(adjacency, childToParent.sourceFrameId, childToParent);
      pushAdjacency(
        adjacency,
        childToParent.targetFrameId,
        invertFrameTransform(childToParent),
      );
    }

    this.adjacencyCache = {
      adjacency,
      timeKey,
    };

    return adjacency;
  }

  private effectiveTransformsForTime(
    timeNs: bigint | undefined,
    policy: McapFrameTransformPolicy,
  ) {
    const transforms = new Map<string, McapComposedFrameTransform>();

    for (const [edgeKey, sample] of this.staticSamplesByEdge.entries()) {
      transforms.set(edgeKey, transformFromSample(sample, "static"));
    }

    if (timeNs === undefined) {
      return [...transforms.values()];
    }

    for (const [edgeKey, edgeSamples] of this.dynamicSamplesByEdge.entries()) {
      const transform = effectiveDynamicTransformForTime(
        edgeSamples,
        timeNs,
        policy,
      );
      if (transform) {
        transforms.set(edgeKey, transform);
      }
    }

    return [...transforms.values()];
  }

  private addFrameIds(sample: McapFrameTransformSample): void {
    this.frameIdsById.add(sample.parentFrameId);
    this.frameIdsById.add(sample.childFrameId);
  }
}

/**
 * Snapshots THREE-typed samples to plain `{x,y,z[,w]}` shapes safe to send
 * across `postMessage`. Required because `structuredClone` strips THREE
 * prototypes and `Quaternion` exposes `x/y/z/w` only as getters — after the
 * hop those properties read as `undefined`. Reads the values while the
 * prototype is still attached. Pair with `hydrateMcapFrameTransformSet` on
 * the receiving side.
 */
export function dehydrateMcapFrameTransformSet(
  set: McapFrameTransformSet,
): McapFrameTransformSetWire {
  return {
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
  };
}

/**
 * Re-wraps a dehydrated frame transform set in fresh THREE instances on the
 * receiving side of `postMessage`. Safe on already-hydrated input because it
 * reads structurally.
 */
export function hydrateMcapFrameTransformSet(
  set: McapFrameTransformSetWire,
): McapFrameTransformSet {
  return {
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
  };
}

function resolveComposedTransform({
  adjacency,
  sourceFrameId,
  targetFrameId,
}: {
  readonly adjacency: ReadonlyMap<
    string,
    readonly McapComposedFrameTransform[]
  >;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
}): McapComposedFrameTransform | null {
  const queue: McapComposedFrameTransform[] = [
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
  samples: readonly McapFrameTransformSample[],
  timeNs: bigint,
  policy: McapFrameTransformPolicy,
): McapComposedFrameTransform | null {
  const { after, before } = bracketSamplesForTime(samples, timeNs);
  if (before?.timeNs === timeNs) {
    return transformFromSample(before, "exact");
  }
  if (after?.timeNs === timeNs) {
    return transformFromSample(after, "exact");
  }

  if (before && after) {
    const beforeTimeNs = before.timeNs as bigint;
    const afterTimeNs = after.timeNs as bigint;
    const gapNs = afterTimeNs - beforeTimeNs;
    if (
      policy.maxInterpolationGapNs > 0n &&
      gapNs > policy.maxInterpolationGapNs
    ) {
      return null;
    }
    if (gapNs <= 0n) {
      return transformFromSample(before, "exact");
    }

    const ratio = Number(timeNs - beforeTimeNs) / Number(gapNs);
    return {
      maxInterpolationGapNs: gapNs,
      resolutionKind: "interpolated",
      rotation: before.rotation
        .clone()
        .slerp(after.rotation, ratio)
        .normalize(),
      sourceFrameId: before.childFrameId,
      targetFrameId: before.parentFrameId,
      translation: before.translation.clone().lerp(after.translation, ratio),
    };
  }

  if (policy.boundaryClampNs <= 0n) {
    return null;
  }

  if (after?.timeNs !== undefined && after.timeNs > timeNs) {
    return after.timeNs - timeNs <= policy.boundaryClampNs
      ? transformFromSample(after, "clamped")
      : null;
  }
  if (before?.timeNs !== undefined && before.timeNs < timeNs) {
    return timeNs - before.timeNs <= policy.boundaryClampNs
      ? transformFromSample(before, "clamped")
      : null;
  }

  return null;
}

function bracketSamplesForTime(
  samples: readonly McapFrameTransformSample[],
  timeNs: bigint,
): {
  readonly after?: McapFrameTransformSample;
  readonly before?: McapFrameTransformSample;
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
  sample: McapFrameTransformSample,
  resolutionKind: McapFrameTransformResolutionKind,
): McapComposedFrameTransform {
  return {
    resolutionKind,
    rotation: sample.rotation,
    sourceFrameId: sample.childFrameId,
    targetFrameId: sample.parentFrameId,
    translation: sample.translation,
  };
}

function cleanSample(sample: McapFrameTransformSample) {
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

function sortAndMergeTimeRanges(
  ranges: readonly McapFrameTransformTimeRange[],
) {
  const sorted = [...ranges].sort((left, right) =>
    left.startTimeNs === right.startTimeNs
      ? compareBigInt(left.endTimeNs, right.endTimeNs)
      : compareBigInt(left.startTimeNs, right.startTimeNs),
  );
  const merged: McapFrameTransformTimeRange[] = [];

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

function composeFrameTransforms(
  first: McapComposedFrameTransform,
  second: McapComposedFrameTransform,
): McapComposedFrameTransform {
  const firstRotation = first.rotation.clone().normalize();
  const secondRotation = second.rotation.clone().normalize();

  return {
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
  transform: McapComposedFrameTransform,
): McapComposedFrameTransform {
  const inverseRotation = transform.rotation.clone().normalize().invert();

  return {
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
  return left.localeCompare(right);
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

function composeResolutionKinds(
  first: McapFrameTransformResolutionKind | undefined,
  second: McapFrameTransformResolutionKind | undefined,
): McapFrameTransformResolutionKind | undefined {
  const kinds = [first, second].filter(
    (kind): kind is McapFrameTransformResolutionKind => kind !== undefined,
  );
  if (kinds.includes("clamped")) return "clamped";
  if (kinds.includes("interpolated")) return "interpolated";
  if (kinds.includes("exact")) return "exact";
  if (kinds.includes("static")) return "static";
  if (kinds.includes("identity")) return "identity";
  return undefined;
}

function frameTransformTimeKey(
  timeNs: bigint | undefined,
  policy: McapFrameTransformPolicy,
) {
  return [
    timeNs === undefined ? "static" : timeNs.toString(),
    policy.maxInterpolationGapNs.toString(),
    policy.boundaryClampNs.toString(),
  ].join(":");
}
