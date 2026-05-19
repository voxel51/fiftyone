import type {
  AnnotationAgent,
  AnnotationAgentLifecycle,
  AnnotationAgentLifecycleListener,
  AnnotationAgentLifecycleStatus,
  AnnotationContext,
  InferenceResult,
  ModelMetadata,
  SegmentationInferenceResult,
  SyncInferenceResult,
  Vec2,
} from "./types";
import { AgentTaskType, InferenceCapability } from "./types";
import {
  BrowserAnnotationProvider,
  type BrowserAnnotationProviderOptions,
  PointLabel,
  type ProviderError,
  type ProviderStatus,
  type PromptPoint,
} from "../providers";
import { encodeMaskData } from "@fiftyone/lighter/src/utils/maskEncoding";
import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";

/**
 * Factory that constructs a {@link BrowserAnnotationProvider} given the
 * lifecycle callbacks the agent wants to bind. Enables provider injection
 * for tests without losing agent ownership of the callback wiring.
 */
export type BrowserAnnotationProviderFactory = (
  options: BrowserAnnotationProviderOptions
) => BrowserAnnotationProvider;

const DEFAULT_FACTORY: BrowserAnnotationProviderFactory = (options) =>
  new BrowserAnnotationProvider(options);

/**
 * Browser-side annotation agent backed by SAM2 Tiny (ONNX, runs in a web
 * worker via {@link BrowserAnnotationProvider}).
 *
 * Supports the {@link AgentTaskType.SEGMENT} task type with positive and
 * negative point prompts.
 *
 * The provider is lazily initialized on the first {@link infer} call and
 * reused for subsequent calls.
 */
export class SAM2BrowserAnnotationAgent
  implements AnnotationAgent<SegmentationInferenceResult>
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

  async infer(
    context: AnnotationContext
  ): Promise<InferenceResult<SegmentationInferenceResult>> {
    if (!context.sampleDescriptor.mediaUrl) {
      throw new Error("Missing media url");
    }

    // lazily initialize on first inference call
    await this.ensureInitialized();

    const points = this.buildPromptPoints(context);

    this.setStatus("inferring");

    try {
      const result = await this.provider.infer({
        imageUrl: getSampleSrc(context.sampleDescriptor.mediaUrl),
        points,
      });

      this.setStatus("idle");

      return {
        type: "sync",
        taskType: AgentTaskType.SEGMENT,
        response: {
          detections: [
            {
              mask: await this.normalizeMask(
                result.mask,
                result.maskWidth,
                result.maskHeight
              ),
              mask_width: result.maskWidth,
              mask_height: result.maskHeight,
              bounding_box: [
                result.bbox.x,
                result.bbox.y,
                result.bbox.w,
                result.bbox.h,
              ],
            },
          ],
        },
      } as SyncInferenceResult<SegmentationInferenceResult>;
    } catch (err) {
      // Respect a terminal error already set by the provider's onError; for
      // benign rejections (e.g. abort) return to idle so the next call can
      // proceed cleanly.
      if (this.lifecycleStatus !== "error") {
        this.setStatus("idle");
      }
      throw err;
    }
  }

  async listSupportedTasks(): Promise<AgentTaskType[]> {
    return [AgentTaskType.SEGMENT];
  }

  async listInferenceCapabilities(
    task: AgentTaskType
  ): Promise<InferenceCapability[]> {
    if (task === AgentTaskType.SEGMENT) {
      return [
        InferenceCapability.POSITIVE_POINT,
        InferenceCapability.NEGATIVE_POINT,
      ];
    }

    return [];
  }

  async getModelMetadata(task: AgentTaskType): Promise<ModelMetadata | null> {
    if (task === AgentTaskType.SEGMENT) {
      return { name: "SAM2 Tiny", version: "hiera-tiny-onnx" };
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

  /**
   * Release the web worker and all provider resources.
   */
  dispose(): void {
    this.provider.dispose();
    this.initialized = false;
    this.initializing$ = null;
    this.setStatus("idle");
  }

  /**
   * Concurrency-safe method to await provider initialization.
   *
   * @private
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initializing$) {
      this.initializing$ = this.provider
        .initialize()
        .then(() => {
          // Defer initialization state to the provider.
          // This handles potential race conditions with initialize/dispose and
          //  any silent initialization failures.
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

  /**
   * Build a list of positive and negative prompt points from the provided
   * {@link AnnotationContext}.
   *
   * @param context Annotation context containing positive and negative points
   * @private
   */
  private buildPromptPoints(context: AnnotationContext): PromptPoint[] {
    return (context.positivePoints ?? [])
      .map((point) => this.vec2ToPoint(point, PointLabel.POSITIVE))
      .concat(
        (context.negativePoints ?? []).map((point) =>
          this.vec2ToPoint(point, PointLabel.NEGATIVE)
        )
      );
  }

  private vec2ToPoint(vec: Vec2, label: PointLabel): PromptPoint {
    return { x: vec[0], y: vec[1], label };
  }

  // 0.5 is NOT > 0.5, so it becomes 0
  private normalizeMask(
    mask: Float32Array,
    width: number,
    height: number
  ): Promise<string> {
    const binary = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
      const v = mask[i];
      // Reject NaN/±Infinity loudly — silently coercing them would yield a
      // valid-looking but degraded mask. SAM2 shouldn't emit these in normal
      // operation, so treat them as a signal something is wrong.
      if (!Number.isFinite(v)) {
        throw new Error(`Invalid float at index ${i}`);
      }
      binary[i] = v > 0.5 ? 1 : 0;
    }
    return encodeMaskData(binary, [height, width]);
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
        this.setStatus("idle");
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
