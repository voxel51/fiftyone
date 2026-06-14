import {
  objectId,
  type PropagationMethod,
  type SyntheticBox,
} from "@fiftyone/utilities";
import {
  BrowserAnnotationProvider,
  type BrowserAnnotationProviderOptions,
  propagate,
  propagateSam2VideoBrowser,
  pointsFromBox,
  type PropagationStrategy,
  type ProviderError,
  type ProviderStatus,
} from "../providers";
import type {
  AnnotationAgent,
  AnnotationAgentLifecycle,
  AnnotationAgentLifecycleListener,
  AnnotationAgentLifecycleStatus,
  InferenceResult,
  ModelMetadata,
  PropagatedDetection,
  PropagationInferenceResult,
} from "./types";
import { AgentTaskType, InferenceCapability } from "./types";

/** Factory for the underlying provider; injectable for tests. */
export type BrowserAnnotationProviderFactory = (
  options: BrowserAnnotationProviderOptions
) => BrowserAnnotationProvider;

const DEFAULT_FACTORY: BrowserAnnotationProviderFactory = (options) =>
  new BrowserAnnotationProvider(options);

/**
 * Inputs for a SAM2 tracking run. Frame numbers are 1-based (matching the
 * labels stream / mongo frame numbers); `getFrameBitmap` resolves a 1-based
 * frame number to its decoded bitmap (the ImaVid image stream serves these
 * from cache — no `<video>` element).
 *
 * Two modes: a *bracketed* run between two keyframes (pass `endKeyframe`), or
 * a *forward* run from a single seed keyframe to a horizon (omit it; the
 * caller sets `toFrame` to the clip end).
 */
export interface Sam2PropagateArgs {
  /** Cross-frame `Instance._id` stamped on every emitted detection. */
  instanceId: string;
  /** The keyframe at/before the playhead; seeds the track. */
  seedKeyframe: SyntheticBox;
  /**
   * Bracketed mode only — the keyframe at `toFrame` that caps the run and is
   * left untouched. Omit for a forward run, where `toFrame` is a tracked
   * frame (the clip end) that should be written like any other.
   */
  endKeyframe?: SyntheticBox;
  fromFrame: number;
  toFrame: number;
  /** Stable per-video id; prefixes the per-frame encoder-embedding cache. */
  videoKey: string;
  /** Decoded frame bitmap for a 1-based frame number. */
  getFrameBitmap: (frameNumber: number) => Promise<ImageBitmap>;
  /** Per in-between frame, the localised detection to write into the cache. */
  onDetection: (frameNumber: number, detection: PropagatedDetection) => void;
  /** Per-frame progress over the inclusive `[fromFrame, toFrame]` span. */
  onProgress?: (done: number, total: number) => void;
  /** Polled before each frame; return `true` to stop early. */
  shouldAbort?: () => boolean;
  /** Next-frame prompt strategy; defaults to "centroid-1". */
  strategy?: PropagationStrategy;
}

/**
 * Browser-side propagation agent backed by SAM2 Tiny (ONNX, web worker via
 * {@link BrowserAnnotationProvider}). Unlike {@link PropagationBrowserAgent}
 * (pure lerp math), this re-runs SAM2 per frame to track the object, so it
 * needs frame pixels and runs genuinely asynchronously.
 *
 * It registers under the agent registry for lifecycle / metadata parity, but
 * is driven through the dedicated {@link propagate} method rather than the
 * generic `infer` — the latter can't carry a frame source. The provider is
 * lazily initialised on the first run and reused thereafter; its status
 * events are bridged onto the agent lifecycle so the UI can show progress.
 */
export class SAM2PropagationBrowserAgent
  implements AnnotationAgent<PropagationInferenceResult>
{
  private readonly provider: BrowserAnnotationProvider;
  private initialized = false;
  private initializing$: Promise<void> | null = null;
  private lifecycleStatus: AnnotationAgentLifecycleStatus = "idle";
  private readonly listeners = new Set<AnnotationAgentLifecycleListener>();

  constructor(factory: BrowserAnnotationProviderFactory = DEFAULT_FACTORY) {
    this.provider = factory({
      onStatus: (status) => this.handleProviderStatus(status),
      onProgress: (progress) => {
        this.setStatus("downloading-weights");
        this.emit({ kind: "progress", ...progress });
      },
      onError: (error) => this.handleProviderError(error),
    });
  }

  /**
   * Track `instanceId` from `seedKeyframe` to `endKeyframe`, emitting one
   * Detection per in-between frame via `onDetection` as each lands. The
   * bracket endpoints are left untouched — they're user keyframes.
   */
  async propagate(args: Sam2PropagateArgs): Promise<void> {
    if (args.fromFrame >= args.toFrame) {
      throw new Error("fromFrame must be less than toFrame");
    }

    await this.ensureInitialized();

    const runId = objectId();
    // Provenance records the source keyframes' mongo `_id`s (not the
    // cross-frame-stable synthetic overlay id, which is identical for both
    // ends of a track); fall back to the synthetic id only if unpersisted.
    // A forward run has a single parent (the seed); a bracketed run has two.
    const parentKeyframes: [string, ...string[]] = args.endKeyframe
      ? [
          args.seedKeyframe._id ?? args.seedKeyframe.id,
          args.endKeyframe._id ?? args.endKeyframe.id,
        ]
      : [args.seedKeyframe._id ?? args.seedKeyframe.id];

    this.setStatus("inferring");

    const onFrameResult = (
      frameIdx: number,
      result: { bbox: { x: number; y: number; w: number; h: number } },
      method: PropagationMethod
    ) => {
      if (frameIdx === args.fromFrame) return;
      if (args.endKeyframe && frameIdx === args.toFrame) return;
      args.onDetection(frameIdx, {
        _id: objectId(),
        _cls: "Detection",
        bounding_box: [
          result.bbox.x,
          result.bbox.y,
          result.bbox.w,
          result.bbox.h,
        ],
        label: args.seedKeyframe.label,
        index: args.seedKeyframe.index,
        instance: { _cls: "Instance", _id: args.instanceId },
        keyframe: false,
        propagation: {
          method,
          run_id: runId,
          parent_keyframes: parentKeyframes,
        },
      });
    };

    try {
      if (args.strategy === "sam2-video-browser") {
        await propagateSam2VideoBrowser(this.provider, {
          getFrameBitmap: args.getFrameBitmap,
          seedFrameIdx: args.fromFrame,
          endFrameIdx: args.toFrame,
          seedPoints: pointsFromBox(args.seedKeyframe.bounding_box),
          videoKey: args.videoKey,
          shouldAbort: args.shouldAbort,
          onProgress: args.onProgress,
          onFrame: (frameIdx, result) =>
            onFrameResult(frameIdx, result, "sam2-video-browser"),
        });
      } else {
        await propagate(this.provider, {
          getFrameBitmap: args.getFrameBitmap,
          keyframeA: {
            frameIdx: args.fromFrame,
            points: pointsFromBox(args.seedKeyframe.bounding_box),
          },
          keyframeB: {
            frameIdx: args.toFrame,
            points: [],
          },
          videoKey: args.videoKey,
          strategy: args.strategy ?? "centroid-5",
          shouldAbort: args.shouldAbort,
          onProgress: args.onProgress,
          onFrame: (frameIdx, result) =>
            onFrameResult(frameIdx, result, "sam2"),
        });
      }

      if (this.lifecycleStatus !== "error") {
        this.setStatus("idle");
      }
    } catch (err) {
      if (this.lifecycleStatus !== "error") {
        this.setStatus("idle");
      }
      throw err;
    }
  }

  async infer(): Promise<InferenceResult<PropagationInferenceResult>> {
    throw new Error(
      "SAM2PropagationBrowserAgent requires the dedicated propagate() entry " +
        "point (it needs a frame source) and is not invocable via infer()."
    );
  }

  async listSupportedTasks(): Promise<AgentTaskType[]> {
    return [AgentTaskType.PROPAGATE];
  }

  async listInferenceCapabilities(): Promise<InferenceCapability[]> {
    return [];
  }

  async getModelMetadata(task: AgentTaskType): Promise<ModelMetadata | null> {
    if (task === AgentTaskType.PROPAGATE) {
      return { name: "SAM2 tracking", version: "hiera-tiny-onnx" };
    }
    return null;
  }

  async subscribe(): Promise<void> {
    // no-op; streams via the propagate() callbacks rather than the async path.
  }

  async unsubscribe(): Promise<void> {
    // no-op
  }

  async abort(): Promise<void> {
    this.provider.abort();
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

  /** Release the web worker and all provider resources. */
  dispose(): void {
    this.provider.dispose();
    this.initialized = false;
    this.initializing$ = null;
    this.setStatus("idle");
  }

  /** Concurrency-safe provider initialization (lazy, on first run). */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initializing$) {
      this.initializing$ = this.provider
        .initialize()
        .then(() => {
          this.initialized = this.provider.isInitialized();
          if (!this.initialized) {
            this.initializing$ = null;
          }
        })
        .catch((err) => {
          this.initializing$ = null;
          throw err;
        });
    }

    await this.initializing$;
  }

  private handleProviderStatus(status: ProviderStatus): void {
    switch (status) {
      case "loading":
        this.setStatus("initializing");
        return;
      case "encoding":
        this.setStatus("encoding-image");
        return;
      case "ready":
        // Don't clobber "inferring" — the worker posts "ready" after each
        // per-frame decode, which would otherwise flicker the lifecycle.
        if (this.lifecycleStatus !== "inferring") {
          this.setStatus("idle");
        }
        return;
      case "failure":
        this.setStatus("error");
        return;
    }
  }

  private handleProviderError(error: ProviderError): void {
    this.setStatus("error");
    this.emit({ kind: "error", error });
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
