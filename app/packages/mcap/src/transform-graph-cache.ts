import type * as THREE from "three";
import {
  buildTransformGraph,
  resolveTransformMatrix,
  type FrameGraph,
  type TransformSample,
  upsertTransformGraphSample,
} from "./transform-runtime";

/** One cached transform-sample set for a single TF stream. */
export type TransformSampleSet = {
  version: number;
  samples: TransformSample[];
};

/** One reusable TF graph snapshot for a target playback timestamp. */
export type TransformGraphSnapshot = {
  graph: FrameGraph;
  revision: number;
  resolveMatrix: (
    sourceFrameId: string | null | undefined,
    targetFrameId: string | null | undefined
  ) => THREE.Matrix4 | null;
};

type TransformGraphCacheOptions = {
  getTransformSampleSet: (streamId: string) => TransformSampleSet;
};

/**
 * Maintains an incremental TF graph that only advances when playback crosses
 * new transform samples, and rebuilds on seeks that move backward.
 */
export class MultimodalTransformGraphCache {
  private readonly getTransformSampleSet: (
    streamId: string
  ) => TransformSampleSet;
  private mergedSamples: TransformSample[] = [];
  private mergedVersionKey = "";
  private graph: FrameGraph = new Map();
  private resolvedMatrices = new Map<string, THREE.Matrix4 | null>();
  private appliedSampleCount = 0;
  private currentTimeNs = Number.NEGATIVE_INFINITY;
  private revision = 0;

  constructor(options: TransformGraphCacheOptions) {
    this.getTransformSampleSet = options.getTransformSampleSet;
  }

  /** Returns a cached graph snapshot for the requested TF streams and time. */
  getSnapshot(
    transformStreamIds: string[],
    targetTimestampNs: number
  ): TransformGraphSnapshot {
    const nextMergedSamples = this.getMergedSamples(transformStreamIds);
    if (!nextMergedSamples.length) {
      if (this.graph.size || this.appliedSampleCount !== 0) {
        this.graph = new Map();
        this.appliedSampleCount = 0;
        this.currentTimeNs = Number.NEGATIVE_INFINITY;
        this.bumpRevision();
      }

      return {
        graph: this.graph,
        revision: this.revision,
        resolveMatrix: this.resolveMatrix,
      };
    }

    if (targetTimestampNs < this.currentTimeNs) {
      this.graph = buildTransformGraph(
        nextMergedSamples.filter(
          (sample) => sample.timestampNs <= targetTimestampNs
        )
      );
      this.appliedSampleCount = countAppliedSamples(
        nextMergedSamples,
        targetTimestampNs
      );
      this.currentTimeNs = targetTimestampNs;
      this.bumpRevision();
    } else {
      let nextAppliedSampleCount = this.appliedSampleCount;

      while (nextAppliedSampleCount < nextMergedSamples.length) {
        const sample = nextMergedSamples[nextAppliedSampleCount];
        if (sample.timestampNs > targetTimestampNs) {
          break;
        }

        upsertTransformGraphSample(this.graph, sample);
        nextAppliedSampleCount += 1;
      }

      if (nextAppliedSampleCount !== this.appliedSampleCount) {
        this.appliedSampleCount = nextAppliedSampleCount;
        this.bumpRevision();
      }

      this.currentTimeNs = targetTimestampNs;
    }

    return {
      graph: this.graph,
      revision: this.revision,
      resolveMatrix: this.resolveMatrix,
    };
  }

  private readonly resolveMatrix = (
    sourceFrameId: string | null | undefined,
    targetFrameId: string | null | undefined
  ) => {
    const cacheKey = `${sourceFrameId ?? ""}->${targetFrameId ?? ""}`;
    if (this.resolvedMatrices.has(cacheKey)) {
      return this.resolvedMatrices.get(cacheKey) ?? null;
    }

    const resolvedMatrix = resolveTransformMatrix(
      this.graph,
      sourceFrameId,
      targetFrameId
    );
    this.resolvedMatrices.set(cacheKey, resolvedMatrix);
    return resolvedMatrix;
  };

  private getMergedSamples(transformStreamIds: string[]) {
    const nextVersionKey = transformStreamIds
      .map((streamId) => {
        const sampleSet = this.getTransformSampleSet(streamId);
        return `${streamId}:${sampleSet.version}`;
      })
      .join("::");
    if (nextVersionKey === this.mergedVersionKey) {
      return this.mergedSamples;
    }

    const nextMergedSamples = transformStreamIds
      .flatMap((streamId) => this.getTransformSampleSet(streamId).samples)
      .sort(
        (left, right) =>
          left.timestampNs - right.timestampNs ||
          left.cacheKey.localeCompare(right.cacheKey)
      );

    if (
      !canPreserveAppliedSamples(
        this.mergedSamples,
        nextMergedSamples,
        this.appliedSampleCount
      )
    ) {
      this.graph = new Map();
      this.appliedSampleCount = 0;
      this.currentTimeNs = Number.NEGATIVE_INFINITY;
      this.bumpRevision();
    }

    this.mergedSamples = nextMergedSamples;
    this.mergedVersionKey = nextVersionKey;
    return this.mergedSamples;
  }

  private bumpRevision() {
    this.revision += 1;
    this.resolvedMatrices.clear();
  }
}

function canPreserveAppliedSamples(
  currentSamples: TransformSample[],
  nextSamples: TransformSample[],
  appliedSampleCount: number
) {
  if (appliedSampleCount === 0) {
    return true;
  }

  if (
    appliedSampleCount > currentSamples.length ||
    appliedSampleCount > nextSamples.length
  ) {
    return false;
  }

  for (let index = 0; index < appliedSampleCount; index += 1) {
    if (currentSamples[index]?.cacheKey !== nextSamples[index]?.cacheKey) {
      return false;
    }
  }

  return true;
}

function countAppliedSamples(
  samples: TransformSample[],
  targetTimestampNs: number
) {
  let appliedSampleCount = 0;

  while (appliedSampleCount < samples.length) {
    if (samples[appliedSampleCount].timestampNs > targetTimestampNs) {
      break;
    }

    appliedSampleCount += 1;
  }

  return appliedSampleCount;
}
