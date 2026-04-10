import type {
  AnnotationAgent,
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
  PointLabel,
  type PromptPoint,
} from "../providers";
import { float32ToCompressedNumpy } from "../util/conversion";

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

  constructor(provider: BrowserAnnotationProvider) {
    this.provider = provider;
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

    const result = await this.provider.infer({
      imageUrl: context.sampleDescriptor.mediaUrl,
      points,
    });

    return {
      type: "sync",
      taskType: AgentTaskType.SEGMENT,
      response: {
        detections: [
          {
            mask: this.normalizeMask(
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

  /**
   * Release the web worker and all provider resources.
   */
  dispose(): void {
    this.provider.dispose();
    this.initialized = false;
    this.initializing$ = null;
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

  private normalizeMask(
    mask: Float32Array,
    width: number,
    height: number
  ): string {
    return float32ToCompressedNumpy(mask, [height, width]);
  }
}
