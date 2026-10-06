/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { ImageSpec } from "../media-factory/image";
import type { McapSpec } from "../media-factory/mcap";
import type { PcdSpec } from "../media-factory/pcd";
import type { PlySpec } from "../media-factory/ply";
import type { SceneSpec } from "../media-factory/scene";
import type { VideoSpec } from "../media-factory/video";
import type { LabelBuilders } from "./labels";

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
  /**
   * The zero-based index of the sample's group. The group's id is
   * `indexToId(groupIndex)`.
   */
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

  /**
   * A uint8 mask of the given size with every pixel set to `target`, for a
   * Segmentation's `mask`.
   */
  targetMask: (width: number, height: number, target: number) => JSONObject;

  /**
   * A float32 map of the given size with every pixel set to `value`, for a
   * Heatmap's `map`.
   */
  valueMap: (width: number, height: number, value: number) => JSONObject;

  /** Label document builders; see {@link LabelBuilders}. */
  label: LabelBuilders;
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
  | "Heatmap"
  | "Instance"
  | "Polyline"
  | "Polylines"
  | "Segmentation"
  | "TemporalDetection"
  | "TemporalDetections";

type ScalarFieldType =
  | "BooleanField"
  | "DateField"
  | "DateTimeField"
  | "DictField"
  | "FloatField"
  | "IntField"
  | "StringField";

/**
 * An embedded document type: a {@link Label}, or a
 * `DynamicEmbeddedDocument` whose attributes are declared as nested paths
 * (`"summary.one": "StringField"`).
 */
export type EmbeddedDocType = Label | "DynamicEmbeddedDocument";

type ListOf<T extends string> = `ListField<${T}>`;

/**
 * Scalar, list and embedded document field types. A typed list nests up to
 * three deep, e.g. `"ListField<ListField<ListField<FloatField>>>"` for a
 * polyline's `points3d`; `"ListField<DynamicEmbeddedDocument>"` is a list of
 * embedded documents.
 */
export type FieldType =
  | EmbeddedDocType
  | ScalarFieldType
  | "ListField"
  | ListOf<ScalarFieldType | "DynamicEmbeddedDocument">
  | ListOf<ListOf<ScalarFieldType>>
  | ListOf<ListOf<ListOf<ScalarFieldType>>>;

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

/** Keyword arguments of `fiftyone.core.camera.StaticTransform`. */
export interface StaticTransform {
  source_frame: string;

  /** @default "world" */
  target_frame?: string;

  /** `[tx, ty, tz]` @default [0, 0, 0] */
  translation?: number[];

  /** Scalar-last `[qx, qy, qz, qw]` @default [0, 0, 0, 1] */
  quaternion?: number[];
}

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
 * `dataset.app_config` settings, applied once the samples exist.
 *
 * @example
 * appConfig: {
 *   media_fields: ["filepath", "thumbnail_path"],
 *   grid_media_field: "thumbnail_path",
 *   sidebar_groups: [{ name: "summaries", paths: ["summary"], expanded: true }],
 * }
 */
export interface AppConfig {
  /** Keyword arguments of `fo.ColorScheme`. */
  color_scheme?: JSONObject;
  default_visibility_labels?: { include?: string[]; exclude?: string[] };
  grid_media_field?: string;
  media_fields?: string[];
  modal_media_field?: string;
  /** Keyword arguments of each `fo.SidebarGroupDocument`. */
  sidebar_groups?: { name: string; paths: string[]; expanded?: boolean }[];
}

/**
 * A 3D sample's media: a generated `.fo3d` scene, or a bare PCD or PLY asset
 * loaded directly as the sample's `"3d"` media.
 */
export type ThreeDSpec =
  | SceneSpec
  | { pcd: Partial<PcdSpec> }
  | { ply: PlySpec };

/**
 * Orthographic projection images of each 3D sample, computed with
 * `fiftyone.utils.utils3d.compute_orthographic_projection_images`.
 */
export interface OrthographicProjections {
  /** `(width, height)`; `-1` keeps the aspect ratio. */
  size: [number, number];
  /** @default false */
  skipFailures?: boolean;
}

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
   * Keys of text-promptable similarity indexes to compute on the dataset.
   *
   * Each is a real sklearn similarity index over deterministic random
   * embeddings, so no model loads and nothing downloads. The recorded model
   * name marks the index prompt-capable, which lights up every
   * promptable-index UI affordance. Searching by a sample id executes against
   * the stored embeddings; free-text prompts would need the real model, so
   * specs query by id.
   */
  promptableIndexes?: string[];

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
   * Static transforms between coordinate frames, each added with
   * `dataset.add_static_transform(StaticTransform(**transform))`.
   *
   * @example
   * staticTransforms: [
   *   { source_frame: "lidar", target_frame: "ego", translation: [1.5, 0, 1.2] },
   * ]
   */
  staticTransforms?: StaticTransform[];

  /**
   * `dataset.app_config` settings; see {@link AppConfig}.
   */
  appConfig?: AppConfig;

  /**
   * Extra image media fields, each a generated PNG per sample whose path is
   * stored in the named `StringField`. Pair with `appConfig.media_fields`.
   *
   * @example
   * mediaFields: { thumbnail_path: { fillColor: "#ff00ff", width: 128, height: 96 } }
   */
  mediaFields?: { [field: string]: PerSample<ImageSpec> };

  /**
   * Database indexes created with `dataset.create_index(spec)`, e.g. `"$**"`
   * for a wildcard index.
   */
  indexes?: string[];

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
  mediaType: "image" | "3d" | "point-cloud" | "video";
  /**
   * The indices of the groups that have a sample in this slice, for sparse
   * groups.
   * @default every group
   */
  groupIndices?: number[];
  /** Media options for this slice, for every group or by group index. */
  imageOptions?: PerSample<ImageSpec>;
  pcdOptions?: PerSample<Partial<PcdSpec>>;
  sceneOptions?: PerSample<ThreeDSpec>;
  videoOptions?: PerSample<VideoSpec>;
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

  /** Options for the point cloud of each point-cloud-slice sample. */
  pcdOptions?: PerSample<PcdSpec>;

  /** Options for the scene of each 3d-slice sample. */
  sceneOptions?: PerSample<ThreeDSpec>;

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

  /**
   * The file name of each sample's recording, without the `.mcap` extension.
   * Samples given the same name share one recording, written from the first
   * one's `mcapOptions`.
   * @default the sample index
   */
  fileNames?: PerSample<string>;
}

/**
 * Configuration options for creating a 3D dataset.
 */
export interface Dataset3dOptions extends BaseDatasetOptions {
  mediaType: "3d";

  /** @default 1 */
  numSamples?: number;

  /** Options for the scene (or bare asset) of each sample. */
  sceneOptions?: PerSample<ThreeDSpec>;

  orthographicProjections?: OrthographicProjections;
}

/**
 * Configuration options for creating a point cloud dataset, whose samples
 * are bare `.pcd` files.
 */
export interface PointCloudDatasetOptions extends BaseDatasetOptions {
  mediaType: "point-cloud";

  /** @default 1 */
  numSamples?: number;

  /**
   * Options for the point cloud of each sample.
   * @default { shape: "cube", numPoints: 216 }
   */
  pcdOptions?: PerSample<Partial<PcdSpec>>;

  orthographicProjections?: OrthographicProjections;
}

interface DatasetOptionsByMediaType {
  image: ImageDatasetOptions;
  video: VideoDatasetOptions;
  "3d": Dataset3dOptions;
  "point-cloud": PointCloudDatasetOptions;
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
  /** The sample's media type when its file extension would infer another. */
  mediaType?: "3d";
}

/** A sample `createDataset` inserted. */
export interface CreatedSample {
  id: string;
  filepath: string;
}

export interface FrameSpec {
  sampleId: string;
  frameNumber: number;
  data: JSONObject;
}
