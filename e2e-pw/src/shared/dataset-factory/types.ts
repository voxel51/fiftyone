/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { ImageSpec } from "../media-factory/image";
import type { McapSpec } from "../media-factory/mcap";
import type { SceneSpec } from "../media-factory/scene";
import type { VideoSpec } from "../media-factory/video";

/**
 * Represents a minimal, unpopulated dataset sample scaffold.
 * Passed to {@link BaseDatasetOptions.withSampleData} to be enriched with field data.
 */
export interface SampleScaffold {
  /** The sample's unique identifier, encoded as a 24-character hex string. */
  _id: string;

  /** The absolute file path to the sample's media on disk (e.g. `/tmp/<uuid>/0.png`). */
  filepath: string;

  /** The zero-based index of the sample within the dataset. */
  index: number;
}

/** A sample scaffold inside a group dataset. */
export interface GroupSampleScaffold extends SampleScaffold {
  /** The zero-based index of the sample's group. */
  groupIndex: number;

  /** The group slice the sample belongs to. */
  slice: string;

  /** Frame count of the generated clip, on video slices. */
  numFrames?: number;
}

/** A sample scaffold inside a video dataset. */
export interface VideoSampleScaffold extends SampleScaffold {
  /** Frame count of the generated clip (duration × frame rate). */
  numFrames: number;
}

/**
 * A frame about to be inserted. Passed to
 * {@link VideoDatasetOptions.withFrameData} once per (sample, frame number).
 */
export interface FrameScaffold {
  /** The owning sample's id, encoded as a 24-character hex string. */
  sampleId: string;

  /** The zero-based index of the owning sample within the dataset. */
  sampleIndex: number;

  /** The 1-based frame number. */
  frameNumber: number;

  /** Frame count of the owning sample's clip. */
  numFrames: number;
}

/**
 * A collection of utility functions passed to `withSampleData` and
 * `withFrameData` for use when constructing documents.
 */
export interface Helpers {
  /**
   * Creates a MongoDB-style object ID wrapper from an optional string.
   * If omitted, a new unique ObjectId is generated.
   * @see {@link createId}
   */
  createId: (id?: string) => { $oid: string };

  /**
   * An all-ones boolean mask of the given size, serialized the way FiftyOne
   * stores a numpy `mask` (e.g. `fo.Detection(mask=np.ones((h, w), bool))`).
   */
  mask: (width: number, height: number) => JSONObject;
}

/**
 * The set of supported FiftyOne label field types.
 * These correspond to embedded document types in the FiftyOne data model.
 */
export type Label =
  | "Classification"
  | "Classifications"
  | "Detection"
  | "Detections"
  | "Polyline"
  | "Polylines"
  | "TemporalDetection"
  | "TemporalDetections";

/**
 * All supported field types for dataset schema definitions.
 * Includes both primitive scalar types and FiftyOne {@link Label} types.
 */
export type FieldType =
  | Label
  | "BooleanField"
  | "DictField"
  | "FloatField"
  | "IntField"
  | "ListField"
  | "StringField";

/**
 * A recursive type representing any valid JSON value.
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

/**
 * A plain JSON object mapping string keys to {@link JSONValue} values.
 */
export type JSONObject = { [key: string]: JSONValue };

/**
 * An annotation label schema, as accepted by `dataset.update_label_schema`.
 */
export type LabelSchema = JSONObject;

/**
 * Field paths mapped to their types. A path under `frames.` declares a frame
 * field on a video dataset; nested paths (`ground_truth.detections.keyframe`)
 * declare embedded fields.
 */
export type Schema = { [path: string]: FieldType };

/**
 * A media spec for every sample, or a function of the sample index.
 */
export type PerSample<T> = T | ((index: number) => T);

/**
 * Options shared by every dataset creator.
 */
export interface BaseDatasetOptions<S extends SampleScaffold = SampleScaffold> {
  /**
   * The name of the dataset.
   * Used to identify and reference the dataset.
   */
  datasetName: string;

  /**
   * A map of named saved views, where each key is the view name
   * and the value is a serialized or stringified view definition.
   *
   * @example
   * {
   *   "highConfidence": 'dataset.filter("detections", F("confidence") > 0.9)',
   *   "labeled": dataset.filter("classification", F("label").exists())'
   * }
   */
  savedViews?: {
    [name: string]: string;
  };

  /**
   * Field paths mapped to their types; label types map to
   * `EmbeddedDocumentField` with the matching `embedded_doc_type`, and paths
   * under `frames.` declare frame fields on video datasets.
   *
   * @example
   * {
   *   "ground_truth": "Detection",
   *   "uniqueness": "FloatField",
   *   "frames.detections": "Detections",
   * }
   */
  schema?: Schema;

  /**
   * Annotation label schemas keyed by field path. Each is applied with
   * `dataset.update_label_schema(field, schema)` and the field is added to
   * `dataset.active_label_schemas`, all inside the single dataset-creation
   * subprocess.
   *
   * @example
   * labelSchemas: {
   *   polylines: {
   *     type: "polylines",
   *     classes: ["lane", "curb"],
   *     attributes: [],
   *     component: "dropdown",
   *   },
   * }
   */
  labelSchemas?: { [field: string]: LabelSchema };

  /**
   * Populates a sample: receives its scaffold and returns the sample's field
   * values as a `JSONObject`.
   *
   * @example
   * withSampleData: (sampleScaffold) => ({
   *   ...sampleScaffold,
   *   label: "cat",
   *   uniqueness: 0.97,
   * })
   */
  withSampleData?: (sampleScaffold: S, helpers: Helpers) => JSONObject;
}

/**
 * Configuration options for creating an image dataset.
 */
export interface ImageDatasetOptions extends BaseDatasetOptions {
  /** @default "image" */
  mediaType?: "image";

  /**
   * The number of samples to include in the dataset. At most 100
   * @default 1
   */
  numSamples?: number;

  /**
   * Whether samples should be numbered/indexed.
   * When `true`, samples are assigned sequential numbers.
   * @default false
   */
  numbered?: boolean;

  /**
   * Options for generating the image of each sample.
   * @default { fillColor: "white", width: 50, height: 50 }
   */
  imageOptions?: PerSample<ImageSpec>;
}

/**
 * A single slice in a group dataset: a name, its media type, and optional
 * media options for that slice (over the dataset-level ones).
 */
export interface GroupSliceConfig {
  name: string;
  mediaType: "image" | "3d" | "video";
  imageOptions?: ImageSpec;
  sceneOptions?: SceneSpec;
  videoOptions?: VideoSpec;
}

/**
 * Configuration options for creating a group dataset.
 */
export interface GroupDatasetOptions extends BaseDatasetOptions<GroupSampleScaffold> {
  mediaType: "group";

  /** @default 3 */
  numGroups?: number;

  /** @default left (image), right (image), 3d (fo3d) */
  slices?: GroupSliceConfig[];

  /** Options for the image of each image-slice sample. */
  imageOptions?: PerSample<ImageSpec>;

  /** Options for the scene of each 3d-slice sample. */
  sceneOptions?: PerSample<SceneSpec>;

  /** Options for the clip of each video-slice sample. */
  videoOptions?: PerSample<VideoSpec>;

  /**
   * A factory function that populates a frame of a video-slice sample with
   * data, called once per (sample, frame number). Frames are inserted only
   * when this is given.
   */
  withFrameData?: (frame: FrameScaffold, helpers: Helpers) => JSONObject;

  /**
   * Materialize per-frame images of the video slices via
   * `to_frames(sample_frames=True)`.
   * @default false
   */
  sampleFrames?: boolean;
}

/**
 * Configuration options for creating a video dataset.
 */
export interface VideoDatasetOptions extends BaseDatasetOptions<VideoSampleScaffold> {
  mediaType: "video";

  /** @default 1 */
  numSamples?: number;

  /**
   * Options for the clip of each sample.
   * @default { duration: 2, width: 64, height: 64, frameRate: 10, color: "#3050a0", container: "webm" }
   */
  videoOptions?: PerSample<VideoSpec>;

  /**
   * A factory function that populates a frame with data, called once per
   * (sample, frame number). Frames are inserted only when this is given.
   */
  withFrameData?: (frame: FrameScaffold, helpers: Helpers) => JSONObject;

  /**
   * Materialize per-frame images via `to_frames(sample_frames=True)` so
   * frame-serving surfaces (ImaVid) can render them.
   * @default false
   */
  sampleFrames?: boolean;
}

/**
 * Configuration options for creating a multimodal (MCAP) dataset.
 */
export interface MultimodalDatasetOptions extends BaseDatasetOptions {
  mediaType: "multimodal";

  /** @default 1 */
  numSamples?: number;

  /**
   * The MCAP fixture recorded for each sample.
   * @default { kind: "tiny-episode-a" }
   */
  mcapOptions?: PerSample<McapSpec>;
}

/**
 * Configuration options for creating a 3D dataset.
 */
export interface Dataset3dOptions extends BaseDatasetOptions {
  mediaType: "3d";

  /** @default 1 */
  numSamples?: number;

  /** Options for the scene of each sample. */
  sceneOptions?: PerSample<SceneSpec>;
}

interface DatasetOptionsByMediaType {
  image: ImageDatasetOptions;
  video: VideoDatasetOptions;
  "3d": Dataset3dOptions;
  group: GroupDatasetOptions;
  multimodal: MultimodalDatasetOptions;
}

export type MediaType = keyof DatasetOptionsByMediaType;

/**
 * Options for `DatasetFactory.createDataset`, discriminated on `mediaType`.
 * The `mediaType?: M` member is what lets `M` be inferred from the literal at
 * the call site, defaulting to `"image"` when it is omitted.
 */
export type DatasetOptions<M extends MediaType = "image"> =
  DatasetOptionsByMediaType[M] & { mediaType?: M };

export interface SampleSpec {
  id: string;
  filepath: string;
  data: JSONObject;
  group?: { id: string; name: string };
}

export interface FrameSpec {
  sampleId: string;
  frameNumber: number;
  data: JSONObject;
}
