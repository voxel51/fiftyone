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
  PropagatedPolyline,
  PropagationContext,
  PropagationInferenceResult,
} from "./types";
import { AgentTaskType, InferenceCapability } from "./types";
import {
  objectId,
  type SyntheticKeyframe,
  type SyntheticPolyline,
} from "@fiftyone/utilities";
import { interpolatePoints, type Ring } from "./polylineInterp";

/** Exclusive integer range `[start, end)` as an array. */
function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
}

/** Narrows a propagation keyframe to the vertex geometry this agent lerps. */
const isPolylineKeyframe = (
  keyframe: SyntheticKeyframe,
): keyframe is SyntheticPolyline =>
  Array.isArray((keyframe as SyntheticPolyline).points);

/**
 * Linearly interpolates a tracked object's `Polyline` geometry between two
 * bracketing keyframes, emitting one Polyline per in-between frame.
 *
 * The sibling of {@link PropagationBrowserAgent}, which does the same for a
 * `bounding_box`: same registry, lifecycle and dispatch path, and likewise
 * synchronous on the main thread. The geometry lives in
 * {@link interpolatePoints}.
 *
 * Each emitted Polyline carries `keyframe: false` and the shared `instance.id`
 * from the source keyframes.
 */
export class PolylinePropagationBrowserAgent implements AnnotationAgent<PropagationInferenceResult> {
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
        !isPolylineKeyframe(leftKeyframe) ||
        !isPolylineKeyframe(rightKeyframe)
      ) {
        throw new Error(
          "propagate-linear-polyline received a keyframe with no points",
        );
      }

      const left: Ring[] = leftKeyframe.points;
      const right: Ring[] = rightKeyframe.points;
      const span: number = context.toFrame - context.fromFrame;

      // `closed` / `filled` come from the left keyframe: a mismatch between the
      // two keyframes is a labelling error, not motion, so it isn't animated.
      const closed = leftKeyframe.closed ?? false;
      const filled = leftKeyframe.filled ?? false;

      const perFrame: PropagationInferenceResult["perFrame"] = [];

      range(context.fromFrame + 1, context.toFrame).forEach((n) => {
        const t: number = (n - context.fromFrame) / span;
        const polyline: PropagatedPolyline = {
          _id: objectId(),
          _cls: "Polyline" as const,
          points: interpolatePoints(left, right, t, closed),
          closed,
          filled,
          label: leftKeyframe.label,
          index: leftKeyframe.index,
          instance: { _cls: "Instance", _id: context.instanceId },
          keyframe: false,
        };

        perFrame.push({ frameNumber: n, detection: polyline });
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
      return { name: "Linear interpolation (polyline)" };
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
