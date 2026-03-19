import {
  ClassificationsParent,
  DetectionsParent,
  PolylinesParent,
} from "../deltas";

/**
 * The category of annotation work an agent can perform.
 *
 * - `"classify"` - able to generate fo.Classification labels.
 * - `"detect"` - able to generate fo.Detection labels.
 * - `"segment"` - able to generate masks on fo.Detection labels.
 * - `"infer"` - catch-all for custom / multi-purpose agents.
 */
export enum AgentTaskType {
  CLASSIFY = "classify",
  DETECT = "detect",
  SEGMENT = "segment",
  INFER = "infer",
}

/**
 * An input modality that an agent accepts when running inference.
 * The UX enables or disables the corresponding tool based on which
 * capabilities the active agent advertises for the current task.
 *
 * - `"positivePoint"` - a set of positive point prompts indicating regions to include
 * - `"negativePoint"` - a set of negative point prompts indicating regions to exclude
 * - `"roi"` - a set of polygonal regions of interest to bound the labels
 * - `"textPrompt"` - a free-text description of the target object
 */
export enum InferenceCapability {
  POSITIVE_POINT = "positivePoint",
  NEGATIVE_POINT = "negativePoint",
  ROI = "roi",
  TEXT_PROMPT = "textPrompt",
}

/**
 * A 2-D vector, generally used to identify an `[x, y]` coordinate in image
 * space.
 */
export type Vec2 = [number, number];

/**
 * An ordered sequence of {@link Vec2} points that form a closed polygon.
 * Bounding boxes are represented by their four corners.
 */
export type ROI = Vec2[];

/**
 * Identifies a specific sample within a dataset.
 */
export type SampleDescriptor = {
  /** The ID of the dataset containing the sample. */
  datasetId: string;
  /** The ID of the sample within the dataset. */
  sampleId: string;
};

/**
 * Union of all inputs the UX may supply to an agent for a single inference call.
 *
 * Agents are expected to validate or silently ignore fields that are
 * irrelevant to their task and capabilities.
 */
export type AnnotationContext = {
  /** Identifies which sample is being annotated. */
  sampleDescriptor: SampleDescriptor;
  /** The type of annotation task being performed. */
  taskType: AgentTaskType;
  /** Image coordinates the user marked as belonging to the target object. */
  positivePoints?: Vec2[];
  /** Image coordinates the user marked as not belonging to the target object. */
  negativePoints?: Vec2[];
  /** Polygonal regions of interest drawn by the user. */
  regionsOfInterest?: ROI[];
  /** Free-text description of the target object. */
  textPrompt?: string;
};

/**
 * Display information about the underlying model powering an agent or task.
 */
export type ModelMetadata = {
  /** Human-readable model name. */
  name: string;
  /** Optional version string, e.g. `"1.0.0"`. */
  version?: string;
};

/**
 * Result type for a synchronous inference operation.
 */
export type SyncInferenceResult<T> = {
  type: "sync";
  taskType: AgentTaskType;
  response: T;
};

/**
 * Result type for an asynchronous inference operation.
 *
 * Async results are expected to be handled through an
 * {@link AnnotationAgent}'s `subscribe()` method.
 */
export type AsyncInferenceResult = {
  type: "async";
  /** Opaque token that identifies this in-progress inference session. */
  sessionId: string;
};

/**
 * Discriminated union of the two possible inference result types.
 *
 * Inspect `result.type` to determine whether the result is immediately
 * available (`"sync"`) or will arrive later (`"async"`).
 */
export type InferenceResult<T> = SyncInferenceResult<T> | AsyncInferenceResult;

/**
 * Response type for synchronous classification inference tasks.
 */
export type ClassificationInferenceResult = ClassificationsParent;

/**
 * Response type for synchronous detection inference tasks.
 */
export type DetectionInferenceResult = DetectionsParent;

/**
 * Response type for synchronous polylines inference tasks.
 */
export type PolylinesInferenceResult = PolylinesParent;

/**
 * Response type for synchronous segmentation inference tasks.
 */
export type SegmentationInferenceResult = DetectionsParent;

/**
 * Union of all supported inference result types.
 */
export type InferenceResultProxy =
  | ClassificationInferenceResult
  | DetectionInferenceResult
  | PolylinesInferenceResult
  | SegmentationInferenceResult;

/**
 * Contract which every annotation agent must satisfy.
 *
 * Agents are opaque to the UX — they may be client-side (e.g. a web worker)
 * or server-side (e.g. a FiftyOne operator), synchronous or asynchronous.
 * The reflective methods (`listSupportedTasks`, `listInferenceCapabilities`,
 * `getModelMetadata`) drive which tools and information the UX exposes;
 * unsupported tasks and capabilities are automatically disabled.
 *
 * @typeParam T - The shape of a completed inference result
 *  (agent/task-specific).
 */
export interface AnnotationAgent<T extends InferenceResultProxy> {
  /**
   * Runs inference for the given annotation context.
   *
   * @param context - All user inputs for this inference call.
   * @returns A `SyncInferenceResult` if the result is immediately available,
   *          or an `AsyncInferenceResult` with a `sessionId` that can be
   *          passed to `subscribe()` / `abort()`.
   */
  infer(context: AnnotationContext): Promise<InferenceResult<T>>;

  /**
   * Returns the task types this agent supports.
   */
  listSupportedTasks(): Promise<AgentTaskType[]>;

  /**
   * Returns the inference input modalities this agent supports for `task`.
   *
   * @param task - The task to query capabilities for.
   */
  listInferenceCapabilities(
    task: AgentTaskType
  ): Promise<InferenceCapability[]>;

  /**
   * Returns display metadata about the model backing this agent for `task`,
   * or `null` if no metadata is available.
   *
   * @param task - The task to query model metadata for.
   */
  getModelMetadata(task: AgentTaskType): Promise<ModelMetadata | null>;

  /**
   * Subscribes to real-time result updates for an async inference session.
   * `callback` is invoked each time a new result chunk is available.
   * Call `unsubscribe()` when the session is no longer needed.
   *
   * Only relevant for async agents; sync agents need not implement this.
   *
   * @param sessionId - The session ID from an `AsyncInferenceResult`.
   * @param callback  - Invoked with each result update.
   */
  subscribe(
    sessionId: string,
    callback: (result: SyncInferenceResult<T>) => void
  ): Promise<void>;

  /**
   * Stop receiving updates for an async inference session.
   * Does not cancel the in-progress operation; see {@link abort}.
   *
   * @param sessionId - The session ID from an `AsyncInferenceResult`.
   */
  unsubscribe(sessionId: string): Promise<void>;

  /**
   * Cancels an in-progress async inference session.
   * Implementations should stop listening for updates and signal the
   * underlying compute to stop as early as possible.
   *
   * @param sessionId - The session ID from an `AsyncInferenceResult`.
   */
  abort(sessionId: string): Promise<void>;
}
