import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import type { DetectionLabel } from "@fiftyone/looker/src/overlays/detection";
import type { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import type { PropagationBlob, SyntheticBox } from "@fiftyone/utilities";
import type { ProviderError } from "../providers";

/** Helper type representing a `fo.Polylines`-like element. */
type PolylinesParent = { polylines: PolylineLabel[] };

/** Helper type representing a `fo.Detections`-like element. */
type DetectionsParent = { detections: DetectionLabel[] };

/** Helper type representing a `fo.Classifications`-like element. */
type ClassificationsParent = { classifications: ClassificationLabel[] };

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
  PROPAGATE = "propagate",
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
 * A uniquely-identified point.
 */
export type PointDescriptor = {
  id: string;
  point: Vec2;
};

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
  /** The URL of the media being annotated. */
  mediaUrl: string;
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
 * Inputs for a single propagation run: which track, what range to fill,
 * and the two bracketing keyframe labels to interpolate between.
 */
export type PropagationContext = AnnotationContext & {
  /** Track identity to propagate within (cross-frame `instance.id`). */
  instanceId: string;
  /** Inclusive frame range to fill between the two bracketing keyframes. */
  fromFrame: number;
  toFrame: number;
  /** The two bracketing keyframe labels the propagator interpolates between. */
  parentKeyframes: [SyntheticBox, SyntheticBox];
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
export type InferenceResult<T> = { labelId: string } & (
  | SyncInferenceResult<T>
  | AsyncInferenceResult
);

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
 * A `DetectionLabel` carrying the video-annotation dynamic attrs the
 * propagator writes on each emitted label. `bounding_box` is required —
 * propagation always emits 2D detections.
 */
export type PropagatedDetection = DetectionLabel & {
  bounding_box: [number, number, number, number];
  keyframe: boolean;
  propagation: PropagationBlob | null;
};

/**
 * Response type for propagation tasks: a flat list of per-frame Detection
 * labels the propagator wants written into the frame-labels stream cache.
 */
export type PropagationInferenceResult = {
  perFrame: Array<{ frameNumber: number; detection: PropagatedDetection }>;
};

/**
 * Union of all supported inference result types.
 */
export type InferenceResultProxy =
  | ClassificationInferenceResult
  | DetectionInferenceResult
  | PolylinesInferenceResult
  | SegmentationInferenceResult
  | PropagationInferenceResult;

/**
 * Coarse lifecycle states an {@link AnnotationAgent} may transition through.
 *
 * Agents are the source of truth for these states. Consumers should listen
 * via {@link AnnotationAgent.onLifecycleEvent} or — preferred — subscribe to
 * `annotation:agentLifecycleStatusChange` on the annotation event bus, which
 * is bridged from agent emissions.
 *
 * - `"idle"`               - no work in flight
 * - `"initializing"`       - one-time setup (e.g. spawning a worker)
 * - `"downloading-weights"`- fetching model weights; pair with progress events
 * - `"encoding-image"`     - image-level preprocessing / encoder pass
 * - `"inferring"`          - running the model
 * - `"error"`              - a terminal error occurred; see paired error event
 */
export type AnnotationAgentLifecycleStatus =
  | "idle"
  | "initializing"
  | "downloading-weights"
  | "encoding-image"
  | "inferring"
  | "error";

/**
 * Progress payload for {@link AnnotationAgentLifecycle} `"progress"` events.
 * `file` is an agent-defined identifier (e.g. `"encoder"` / `"decoder"`).
 */
export type AnnotationAgentDownloadProgress = {
  file: string;
  loaded: number;
  total: number;
};

/**
 * Single-channel lifecycle event emitted by an {@link AnnotationAgent}.
 *
 * Bridged onto distinct entries of `AnnotationEventGroup` by the canonical
 * `useRegisterAgentLifecycleEvents` hook.
 */
export type AnnotationAgentLifecycle =
  | { kind: "status"; status: AnnotationAgentLifecycleStatus }
  | ({ kind: "progress" } & AnnotationAgentDownloadProgress)
  | { kind: "error"; error: ProviderError };

/**
 * Listener for {@link AnnotationAgent.onLifecycleEvent}.
 */
export type AnnotationAgentLifecycleListener = (
  event: AnnotationAgentLifecycle
) => void;

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

  /**
   * Subscribe to coarse lifecycle events from this agent (status changes,
   * download progress, terminal errors).
   *
   * Implementations should emit a `"status"` event for every transition so
   * a single listener can drive UI without polling. Late subscribers can
   * read the current status via {@link getLifecycleStatus} and wait for the
   * next event.
   *
   * @returns A function that, when called, removes the listener.
   */
  onLifecycleEvent(listener: AnnotationAgentLifecycleListener): () => void;

  /**
   * Returns the agent's current lifecycle status. Useful for consumers that
   * mount after the agent has already transitioned and need the current
   * state without waiting for the next event.
   */
  getLifecycleStatus(): AnnotationAgentLifecycleStatus;
}
