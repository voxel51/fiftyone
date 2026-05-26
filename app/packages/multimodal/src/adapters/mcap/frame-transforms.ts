import { Quaternion, Vector3 } from "three";

import { nonEmpty } from "./strings";
import type {
  McapComposedFrameTransform,
  McapFrameTransformResolution,
  McapFrameTransformSample,
  McapFrameTransformSet,
  McapFrameTransformTimeRange,
} from "./frame-transform-types";
import { compareBigInt } from "./sync";

const IDENTITY_QUATERNION = new Quaternion();
const ZERO_VECTOR = new Vector3();

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
          normalized
        );
        this.addFrameIds(normalized);
      }
    }
  }

  addDynamic(
    samples: readonly McapFrameTransformSample[],
    range: McapFrameTransformTimeRange
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
  }

  isTimeIndexed(timeNs: bigint): boolean {
    return this.dynamicRanges.some(
      (range) => range.startTimeNs <= timeNs && timeNs <= range.endTimeNs
    );
  }

  frameIds(): readonly string[] {
    return [...this.frameIdsById].sort(compareStrings);
  }

  resolve({
    sourceFrameId,
    targetFrameId,
    timeNs,
  }: {
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
        sourceFrameId: source,
        status: "resolved",
        targetFrameId: target,
        transform: {
          rotation: IDENTITY_QUATERNION.clone(),
          sourceFrameId: source,
          targetFrameId: target,
          translation: ZERO_VECTOR.clone(),
        },
      };
    }

    const transform = resolveComposedTransform({
      adjacency: this.buildAdjacency(timeNs),
      sourceFrameId: source,
      targetFrameId: target,
    });
    if (transform) {
      return {
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

  private buildAdjacency(timeNs: bigint | undefined) {
    const adjacency = new Map<string, McapComposedFrameTransform[]>();

    for (const sample of this.effectiveSamplesForTime(timeNs)) {
      const childToParent = {
        rotation: sample.rotation,
        sourceFrameId: sample.childFrameId,
        targetFrameId: sample.parentFrameId,
        translation: sample.translation,
      };

      pushAdjacency(adjacency, sample.childFrameId, childToParent);
      pushAdjacency(
        adjacency,
        sample.parentFrameId,
        invertFrameTransform(childToParent)
      );
    }

    return adjacency;
  }

  private effectiveSamplesForTime(timeNs: bigint | undefined) {
    const samples = new Map<string, McapFrameTransformSample>(
      this.staticSamplesByEdge
    );

    if (timeNs === undefined) {
      return [...samples.values()];
    }

    for (const [edgeKey, edgeSamples] of this.dynamicSamplesByEdge.entries()) {
      const sample = latestSampleAtOrBefore(edgeSamples, timeNs);
      if (sample) {
        samples.set(edgeKey, sample);
      }
    }

    return [...samples.values()];
  }

  private addFrameIds(sample: McapFrameTransformSample): void {
    this.frameIdsById.add(sample.parentFrameId);
    this.frameIdsById.add(sample.childFrameId);
  }
}

/**
 * Re-wraps a frame transform set in fresh THREE instances. Required after a
 * postMessage hop because structured clone strips THREE prototypes; safe to
 * call on already-hydrated input since it reads structurally.
 */
export function hydrateMcapFrameTransformSet(
  set: McapFrameTransformSet
): McapFrameTransformSet {
  return {
    samples: set.samples.map((sample) => ({
      ...sample,
      rotation: new Quaternion(
        sample.rotation.x,
        sample.rotation.y,
        sample.rotation.z,
        sample.rotation.w
      ).normalize(),
      translation: new Vector3(
        sample.translation.x,
        sample.translation.y,
        sample.translation.z
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

function latestSampleAtOrBefore(
  samples: readonly McapFrameTransformSample[],
  timeNs: bigint
) {
  let low = 0;
  let high = samples.length - 1;
  let match: McapFrameTransformSample | undefined;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const sample = samples[middle];
    const sampleTimeNs = sample?.timeNs;
    if (sampleTimeNs === undefined) {
      high = middle - 1;
      continue;
    }

    if (sampleTimeNs <= timeNs) {
      match = sample;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return match;
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
  right: { readonly timeNs?: bigint }
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
  ranges: readonly McapFrameTransformTimeRange[]
) {
  const sorted = [...ranges].sort((left, right) =>
    left.startTimeNs === right.startTimeNs
      ? compareBigInt(left.endTimeNs, right.endTimeNs)
      : compareBigInt(left.startTimeNs, right.startTimeNs)
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
  value: Value
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
  second: McapComposedFrameTransform
): McapComposedFrameTransform {
  const firstRotation = first.rotation.clone().normalize();
  const secondRotation = second.rotation.clone().normalize();

  return {
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
  transform: McapComposedFrameTransform
): McapComposedFrameTransform {
  const inverseRotation = transform.rotation.clone().normalize().invert();

  return {
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
