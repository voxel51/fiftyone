import type {
  AnnotationAgent,
  AnnotationAgentLifecycle,
  AnnotationAgentLifecycleListener,
  AnnotationAgentLifecycleStatus,
  AnnotationContext,
  InferenceResult,
  ModelMetadata,
  PropagatedDetection,
  PropagationContext,
  PropagationInferenceResult,
} from "./types";
import { AgentTaskType, InferenceCapability } from "./types";

type Bbox = [number, number, number, number];

/** Linear interpolation between `a` and `b` at fraction `t` ∈ [0, 1]. */
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/** Component-wise linear interpolation between two bboxes at fraction `t`. */
function lerpBbox(left: Bbox, right: Bbox, t: number): Bbox {
  return [
    lerp(left[0], right[0], t),
    lerp(left[1], right[1], t),
    lerp(left[2], right[2], t),
    lerp(left[3], right[3], t),
  ];
}

/** Exclusive integer range `[start, end)` as an array. */
function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
}

/**
 * Generate a 24-char hex string matching the MongoDB ObjectId format —
 * 4-byte timestamp + 8-byte random. Not a real BSON ObjectId (no machine
 * id / counter), but the wire format is identical and the DB accepts it.
 */
function generateObjectIdHex(): string {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, "0");
  const random = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return timestamp + random;
}

/**
 * Linearly interpolates a tracked object's bounding box between two
 * bracketing keyframes, emitting one Detection per in-between frame.
 *
 * Despite the `AnnotationAgent` interface and "inference" naming: this is
 * deterministic math, not AI. The agent abstraction is reused here so
 * future propagation methods (SAM2 tracking, optical flow, spline) can
 * slot into the same registry, lifecycle, and dispatch path under one
 * uniform contract. Linear runs synchronously on the main thread — a
 * worker would add latency for trivial arithmetic.
 *
 * Each emitted Detection carries `keyframe: false`, the propagation run's
 * provenance blob, and the shared `instance.id` from the source keyframes.
 */
export class PropagationBrowserAgent
  implements AnnotationAgent<PropagationInferenceResult>
{
  private lifecycleStatus: AnnotationAgentLifecycleStatus = "idle";
  private readonly listeners = new Set<AnnotationAgentLifecycleListener>();

  async infer(
    context: AnnotationContext
  ): Promise<InferenceResult<PropagationInferenceResult>> {
    const propContext = context as PropagationContext;
    if (propContext.fromFrame >= propContext.toFrame) {
      throw new Error(
        `fromFrame (${propContext.fromFrame}) must be less than toFrame (${propContext.toFrame})`
      );
    }

    this.setStatus("inferring");

    try {
      const [leftKeyframe, rightKeyframe] = propContext.parentKeyframes;
      const left: Bbox = leftKeyframe.bounding_box;
      const right: Bbox = rightKeyframe.bounding_box;
      const span: number = propContext.toFrame - propContext.fromFrame;
      const runId: string = generateObjectIdHex();

      const perFrame: PropagationInferenceResult["perFrame"] = [];
      range(propContext.fromFrame + 1, propContext.toFrame).forEach((n) => {
        const t: number = (n - propContext.fromFrame) / span;
        const detection: PropagatedDetection = {
          _id: generateObjectIdHex(),
          _cls: "Detection",
          bounding_box: lerpBbox(left, right, t),
          label: leftKeyframe.label,
          index: leftKeyframe.index,
          instance: { _cls: "Instance", _id: propContext.instanceId },
          keyframe: false,
          propagation: {
            method: "linear",
            run_id: runId,
            parent_keyframes: [leftKeyframe.id, rightKeyframe.id],
          },
        };
        perFrame.push({ frameNumber: n, detection });
      });

      return {
        labelId: propContext.instanceId,
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
      return { name: "Linear interpolation" };
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
