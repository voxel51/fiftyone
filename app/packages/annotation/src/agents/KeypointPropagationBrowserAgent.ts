/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type {
  AnnotationAgent,
  AnnotationAgentLifecycle,
  AnnotationAgentLifecycleListener,
  AnnotationAgentLifecycleStatus,
  InferenceResult,
  ModelMetadata,
  PropagatedKeypoint,
  PropagationContext,
  PropagationInferenceResult,
} from "./types";
import { AgentTaskType, InferenceCapability } from "./types";
import {
  objectId,
  type SyntheticKeyframe,
  type SyntheticKeypoint,
} from "@fiftyone/utilities";

/** Exclusive integer range `[start, end)` as an array. */
function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
}

/**
 * Narrows a propagation keyframe to flat per-node geometry. A keypoint's
 * `points` is `[x, y][]` where a polyline's is `[x, y][][]`, so the first
 * coordinate of the first point distinguishes them; empty geometry (which
 * neither agent can lerp) is rejected.
 */
const isKeypointKeyframe = (
  keyframe: SyntheticKeyframe,
): keyframe is SyntheticKeypoint => {
  const points = (keyframe as SyntheticKeypoint).points;
  return (
    Array.isArray(points) &&
    points.length > 0 &&
    Array.isArray(points[0]) &&
    typeof points[0][0] === "number"
  );
};

const isFinitePair = (point: [number, number]): boolean =>
  Number.isFinite(point[0]) && Number.isFinite(point[1]);

/**
 * Per-node linear interpolation with hole preservation: a node lerps only
 * when both bracketing keyframes place it; if either side is a `[NaN, NaN]`
 * hole (occluded / skipped), the whole span is a hole for that node — honest
 * "position unknown" rather than a guess. Node count mismatches (possible via
 * SDK edits) emit holes for the unmatched tail.
 */
export const interpolateKeypointNodes = (
  left: [number, number][],
  right: [number, number][],
  t: number,
): [number, number][] => {
  const count = Math.max(left.length, right.length);

  return Array.from({ length: count }, (_, i) => {
    const a = left[i];
    const b = right[i];

    if (!a || !b || !isFinitePair(a) || !isFinitePair(b)) {
      return [NaN, NaN];
    }

    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });
};

/**
 * Linearly interpolates a tracked object's `Keypoint` geometry between two
 * bracketing keyframes, emitting one Keypoint per in-between frame.
 *
 * The sibling of {@link PolylinePropagationBrowserAgent} for flat per-node
 * geometry: same registry, lifecycle and dispatch path, synchronous on the
 * main thread. The one keypoint-specific rule is hole preservation — see
 * {@link interpolateKeypointNodes}.
 *
 * Each emitted Keypoint carries `keyframe: false` and the shared
 * `instance.id` from the source keyframes.
 */
export class KeypointPropagationBrowserAgent implements AnnotationAgent<PropagationInferenceResult> {
  private lifecycleStatus: AnnotationAgentLifecycleStatus = "idle";
  private readonly listeners = new Set<AnnotationAgentLifecycleListener>();

  async infer(
    context: PropagationContext,
  ): Promise<InferenceResult<PropagationInferenceResult>> {
    if (context.fromFrame >= context.toFrame) {
      throw new Error(
        `fromFrame (${context.fromFrame}) must be less than toFrame (${context.toFrame})`,
      );
    }

    this.setStatus("inferring");

    try {
      // Narrow rather than assert, so a dispatch bug surfaces here instead of
      // silently interpolating an empty shape.
      const [leftKeyframe, rightKeyframe] = context.parentKeyframes;

      if (
        !isKeypointKeyframe(leftKeyframe) ||
        !isKeypointKeyframe(rightKeyframe)
      ) {
        throw new Error(
          "propagate-linear-keypoint received a keyframe with no per-node points",
        );
      }

      const left = leftKeyframe.points;
      const right = rightKeyframe.points;
      const span: number = context.toFrame - context.fromFrame;

      const perFrame: PropagationInferenceResult["perFrame"] = [];

      range(context.fromFrame + 1, context.toFrame).forEach((n) => {
        const t: number = (n - context.fromFrame) / span;
        const keypoint: PropagatedKeypoint = {
          _id: objectId(),
          _cls: "Keypoint" as const,
          points: interpolateKeypointNodes(left, right, t),
          label: leftKeyframe.label,
          index: leftKeyframe.index,
          instance: { _cls: "Instance", _id: context.instanceId },
          keyframe: false,
        };

        perFrame.push({ frameNumber: n, detection: keypoint });
      });

      return {
        labelId: context.instanceId,
        type: "sync",
        taskType: AgentTaskType.PROPAGATE,
        response: { perFrame },
      };
    } finally {
      this.setStatus("idle");
    }
  }

  async listSupportedTasks(): Promise<AgentTaskType[]> {
    return [AgentTaskType.PROPAGATE];
  }

  async listInferenceCapabilities(): Promise<InferenceCapability[]> {
    return [];
  }

  async getModelMetadata(task: AgentTaskType): Promise<ModelMetadata | null> {
    if (task === AgentTaskType.PROPAGATE) {
      return { name: "Linear interpolation (keypoint)" };
    }
    return null;
  }

  async subscribe(): Promise<void> {
    // no-op; only supports synchronous inference
  }

  async unsubscribe(): Promise<void> {
    // no-op; only supports synchronous inference
  }

  async abort(): Promise<void> {
    // no-op; synchronous main-thread math has no abort point
  }

  onLifecycleEvent(listener: AnnotationAgentLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getLifecycleStatus(): AnnotationAgentLifecycleStatus {
    return this.lifecycleStatus;
  }

  private setStatus(status: AnnotationAgentLifecycleStatus): void {
    if (status === this.lifecycleStatus) return;
    this.lifecycleStatus = status;
    this.emit({ kind: "status", status });
  }

  private emit(event: AnnotationAgentLifecycle): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
