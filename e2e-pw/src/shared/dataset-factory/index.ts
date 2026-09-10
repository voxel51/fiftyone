/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import os from "os";
import path from "path";
import { OssLoader } from "src/oss/fixtures/loader";
import { writeToTmpFile } from "src/oss/utils/fs";
import {
  createImage,
  DEFAULT_IMAGE_OPTIONS,
  type ImageOptions,
} from "../media-factory/image";
import { createMcapFixture, type McapFixtureKind } from "../media-factory/mcap";
import { createScene, type SceneOptions } from "../media-factory/scene";
import {
  createVideo,
  DEFAULT_VIDEO_OPTIONS,
  type VideoOptions,
} from "../media-factory/video";
import { serializeMask } from "../numpy";
import { createId, ensureDirExists, indexToId } from "../utils";

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
type Label =
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
type FieldType =
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
 * Media options for every sample, or a function of the sample index.
 */
export type PerSample<T> = Partial<T> | ((index: number) => Partial<T>);

/**
 * The set of field type strings that are considered FiftyOne label types.
 * Used by {@link isLabelType} to distinguish label fields from scalar fields.
 */
const LABEL_TYPES = new Set([
  "Classification",
  "Classifications",
  "Detection",
  "Detections",
  "Polyline",
  "Polylines",
  "TemporalDetection",
  "TemporalDetections",
]);

/**
 * Type guard that checks whether a given string is a FiftyOne {@link Label} type.
 *
 * @param fieldType - The field type string to test.
 * @returns `true` if `fieldType` is one of the known label types, `false` otherwise.
 *
 * @example
 * isLabelType("Detection")  // true
 * isLabelType("FloatField") // false
 */
function isLabelType(fieldType: string): fieldType is Label {
  return LABEL_TYPES.has(fieldType);
}

/**
 * Options shared by every dataset creator.
 */
interface BaseDatasetOptions<S extends SampleScaffold = SampleScaffold> {
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
   * Defines the schema of the dataset as a map of field paths to their types.
   * Each key is a dot-notation field path and the value is a `FieldType`.
   *
   * Label types (`Classification`, `Detection`, etc.) are automatically mapped
   * to `EmbeddedDocumentField` with the appropriate `embedded_doc_type`.
   * Paths under `frames.` declare frame fields on video datasets.
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
   * A factory function that populates a sample with data.
   * Receives an empty scaffold and should return a `JSONObject`
   * representing the fully populated sample.
   *
   * @param sampleScaffold - The unpopulated sample scaffold.
   * @returns A `JSONObject` containing the sample's field values.
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
export interface DatasetOptions extends BaseDatasetOptions {
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
  imageOptions?: PerSample<ImageOptions>;
}

/**
 * A single slice in a group dataset: a name, its media type, and optional
 * media options for that slice (over the dataset-level ones).
 */
export interface GroupSliceConfig {
  name: string;
  mediaType: "image" | "3d" | "video";
  imageOptions?: Partial<ImageOptions>;
  sceneOptions?: Partial<SceneOptions>;
  videoOptions?: Partial<VideoOptions>;
}

/**
 * Configuration options for creating a group dataset.
 */
export interface GroupDatasetOptions extends BaseDatasetOptions<GroupSampleScaffold> {
  /** @default 3 */
  numGroups?: number;

  /** @default left (image), right (image), 3d (fo3d) */
  slices?: GroupSliceConfig[];

  /** Options for the image of each image-slice sample. */
  imageOptions?: PerSample<ImageOptions>;

  /** Options for the scene of each 3d-slice sample. */
  sceneOptions?: PerSample<SceneOptions>;

  /** Options for the clip of each video-slice sample. */
  videoOptions?: PerSample<VideoOptions>;

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
  /** @default 1 */
  numSamples?: number;

  /**
   * Options for the clip of each sample.
   * @default { duration: 2, width: 64, height: 64, frameRate: 10, color: "#3050a0", container: "webm" }
   */
  videoOptions?: PerSample<VideoOptions>;

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
  /** @default 1 */
  numSamples?: number;

  /**
   * The MCAP fixture recorded for each sample.
   * @default "tiny-episode-a"
   */
  mcapKind?: PerSample<{ kind: McapFixtureKind }>;
}

/**
 * Configuration options for creating a 3D dataset.
 */
export interface Dataset3dOptions extends BaseDatasetOptions {
  /** @default 1 */
  numSamples?: number;

  /** Options for the scene of each sample. */
  sceneOptions?: PerSample<SceneOptions>;
}

interface SampleSpec {
  id: string;
  filepath: string;
  data: JSONObject;
  group?: { id: string; name: string };
}

interface FrameSpec {
  sampleId: string;
  frameNumber: number;
  data: JSONObject;
}

interface BuildOptions extends Pick<
  BaseDatasetOptions,
  "datasetName" | "labelSchemas" | "savedViews" | "schema"
> {
  mediaType: "image" | "video" | "3d" | "multimodal" | "group";
  samples: SampleSpec[];
  frames?: FrameSpec[];
  sampleFrames?: boolean;
  groupSlices?: GroupSliceConfig[];
}

const helpers: Helpers = { createId, mask: serializeMask };

const resolve = <T>(
  options: PerSample<T> | undefined,
  index: number,
): Partial<T> =>
  typeof options === "function" ? options(index) : (options ?? {});

const mediaDir = async (datasetName: string) => {
  const outputDir = path.join(os.tmpdir(), datasetName);
  await ensureDirExists(outputDir);
  return outputDir;
};

const addField = (fieldPath: string, fieldType: FieldType) => {
  const isFrameField = fieldPath.startsWith("frames.");
  const method = isFrameField ? "add_frame_field" : "add_sample_field";
  const name = isFrameField ? fieldPath.slice("frames.".length) : fieldPath;
  return isLabelType(fieldType)
    ? `dataset.${method}("${name}", fo.EmbeddedDocumentField, embedded_doc_type=fo.${fieldType})`
    : `dataset.${method}("${name}", fo.${fieldType})`;
};

/**
 * Builds a dataset from generated media: declares `schema`, inserts the sample
 * (and frame) documents directly into the underlying MongoDB collections with
 * their fixed ids, then applies `labelSchemas` and `savedViews`.
 */
const build = (() => {
  const loader = new OssLoader();
  return async ({
    datasetName,
    frames = [],
    groupSlices = [],
    labelSchemas = {},
    mediaType,
    sampleFrames = false,
    samples,
    savedViews = {},
    schema = {},
  }: BuildOptions) => {
    const payload = writeToTmpFile(
      JSON.stringify({ samples, frames, labelSchemas }),
      "json",
    );
    const hasVideo =
      mediaType === "video" ||
      groupSlices.some((slice) => slice.mediaType === "video");
    const mediaTypeCode =
      mediaType === "group"
        ? [
            `dataset.add_group_field("group", default="${groupSlices[0]?.name}")`,
            ...groupSlices.map(
              (slice) =>
                `dataset.add_group_slice("${slice.name}", "${slice.mediaType}")`,
            ),
          ].join("\n")
        : `dataset.media_type = "${mediaType}"`;

    await loader.executePythonCode(`
from datetime import datetime

from bson import ObjectId, json_util

import fiftyone as fo
from fiftyone import ViewField as F

with open("${payload}") as f:
    payload = json_util.loads(f.read())

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True
${mediaTypeCode}

${Object.entries(schema)
  .map(([fieldPath, fieldType]) => addField(fieldPath, fieldType))
  .join("\n")}

now = datetime.now()

# add_samples() regenerates ids, so the fixed ids are kept by building each
# document with _make_dict and inserting it directly
docs = []
for spec in payload["samples"]:
    kwargs = {}
    if "group" in spec:
        kwargs["group"] = fo.Group(id=spec["group"]["id"]).element(
            spec["group"]["name"]
        )
    sample = fo.Sample(
        _id=ObjectId(spec["id"]), filepath=spec["filepath"], **kwargs
    )
    sample.created_at = now
    sample.last_modified_at = now
    docs.append({**dataset._make_dict(sample, include_id=True), **spec["data"]})

dataset._sample_collection.insert_many(docs)

if payload["frames"]:
    frame_docs = []
    for spec in payload["frames"]:
        frame = fo.Frame(frame_number=spec["frameNumber"])
        frame_docs.append(
            {
                **dataset._make_dict(
                    frame, include_id=True, created_at=now, last_modified_at=now
                ),
                "_sample_id": ObjectId(spec["sampleId"]),
                **spec["data"],
            }
        )

    dataset._frame_collection.insert_many(frame_docs)

${hasVideo ? "dataset.compute_metadata()" : ""}
${
  sampleFrames
    ? mediaType === "group"
      ? 'dataset.select_group_slices(media_type="video").to_frames(sample_frames=True)'
      : "dataset.to_frames(sample_frames=True)"
    : ""
}

for field_name, label_schema in payload["labelSchemas"].items():
    dataset.update_label_schema(field_name, label_schema, allow_new_attrs=True)
${
  Object.keys(labelSchemas).length
    ? 'dataset.active_label_schemas = list(payload["labelSchemas"].keys())'
    : ""
}

${Object.entries(savedViews)
  .map(([name, view]) => `dataset.save_view("${name}", ${view})`)
  .join("\n")}
`);
  };
})();

/**
 * Creates a FiftyOne dataset with generated image samples.
 *
 * 1. Generates `numSamples` PNG images in a temporary directory.
 * 2. Builds a FiftyOne dataset via embedded Python code, inserting samples
 *    directly into the underlying MongoDB collection for performance.
 * 3. Applies any additional schema fields, label schemas and saved views.
 *
 * @param options - {@link DatasetOptions} controlling dataset creation.
 * @returns A `Promise` that resolves when the dataset and all samples have been created.
 * @throws {Error} If `numSamples` is less than 1 or not an integer.
 *
 * @example
 * await DatasetFactory.createDataset({
 *   datasetName: "my-dataset",
 *   numSamples: 10,
 *   numbered: true,
 *   imageOptions: { fillColor: "black", width: 128, height: 128 },
 *   schema: { hello: "StringField" },
 *   withSampleData: ({ index }, { createId }) => ({ _id: createId(indexToId(index)), hello: "world"  }),
 * });
 */
const createDataset = async ({
  datasetName,
  imageOptions,
  labelSchemas,
  numSamples = 1,
  numbered = false,
  savedViews,
  schema = {},
  withSampleData = () => ({}),
}: DatasetOptions) => {
  if (!Number.isInteger(numSamples)) {
    throw new Error(
      `Expected 'numSamples' to be an integer, but got ${numSamples}`,
    );
  }

  if (numSamples < 1 || numSamples > 100) {
    throw new Error(`'numSamples' must be >0 and <=100, but got ${numSamples}`);
  }

  const outputDir = await mediaDir(datasetName);
  const images = new Array<Promise<void>>();
  const samples = new Array<SampleSpec>();

  for (let index = 0; index < numSamples; index++) {
    const filepath = path.join(outputDir, `${index}.png`);
    images.push(
      createImage({
        outputPath: filepath,
        watermarkString: numbered ? index.toString() : undefined,
        ...DEFAULT_IMAGE_OPTIONS,
        ...resolve(imageOptions, index),
      }),
    );
    const _id = indexToId(index);
    samples.push({
      id: _id,
      filepath,
      data: { index, ...withSampleData({ _id, filepath, index }, helpers) },
    });
  }

  await Promise.all(images);
  await build({
    datasetName,
    mediaType: "image",
    samples,
    schema: { index: "IntField", ...schema },
    labelSchemas,
    savedViews,
  });
};

const DEFAULT_GROUP_SLICES: GroupSliceConfig[] = [
  { name: "left", mediaType: "image" },
  { name: "right", mediaType: "image" },
  { name: "3d", mediaType: "3d" },
];

/**
 * Creates a FiftyOne group dataset with configurable slices.
 *
 * Image slices are backed by generated PNGs. 3D slices are backed by a
 * PLY mesh wrapped in a `.fo3d` scene file. The default slice layout is
 * `left` (image), `right` (image), and `3d` (fo3d).
 *
 * @example
 * await DatasetFactory.createGroupDataset({
 *   datasetName: "my-groups",
 *   numGroups: 4,
 *   slices: [
 *     { name: "left", mediaType: "image" },
 *     { name: "pcd", mediaType: "3d" },
 *   ],
 * });
 */
const createGroupDataset = async ({
  datasetName,
  imageOptions = {
    fillColor: "#22577a",
    width: 128,
    height: 128,
    hideLogs: true,
  },
  labelSchemas,
  numGroups = 3,
  sampleFrames = false,
  savedViews,
  sceneOptions = { shape: "cube", color: [96, 208, 255] },
  schema,
  slices = DEFAULT_GROUP_SLICES,
  videoOptions,
  withFrameData,
  withSampleData = () => ({}),
}: GroupDatasetOptions) => {
  const outputDir = await mediaDir(datasetName);
  const images = new Array<Promise<void>>();
  const samples = new Array<SampleSpec>();
  const frames = new Array<FrameSpec>();

  let index = 0;
  for (let groupIndex = 0; groupIndex < numGroups; groupIndex++) {
    const groupId = createId().$oid;
    for (const slice of slices) {
      const outputPath = path.join(outputDir, `${slice.name}-${groupIndex}`);
      const _id = indexToId(index);
      let filepath: string;
      let numFrames: number | undefined;
      if (slice.mediaType === "image") {
        filepath = `${outputPath}.png`;
        images.push(
          createImage({
            outputPath: filepath,
            ...DEFAULT_IMAGE_OPTIONS,
            ...resolve(imageOptions, index),
            ...slice.imageOptions,
          }),
        );
      } else if (slice.mediaType === "video") {
        const options = {
          ...DEFAULT_VIDEO_OPTIONS,
          ...resolve(videoOptions, index),
          ...slice.videoOptions,
        };
        filepath = await createVideo({ outputPath, ...options });
        numFrames = Math.round(options.duration * options.frameRate);
        for (
          let frameNumber = 1;
          withFrameData && frameNumber <= numFrames;
          frameNumber++
        ) {
          frames.push({
            sampleId: _id,
            frameNumber,
            data: withFrameData(
              { sampleId: _id, sampleIndex: index, frameNumber, numFrames },
              helpers,
            ),
          });
        }
      } else {
        filepath = createScene({
          outputPath,
          ...resolve(sceneOptions, index),
          ...slice.sceneOptions,
        });
      }
      samples.push({
        id: _id,
        filepath,
        group: { id: groupId, name: slice.name },
        data: withSampleData(
          { _id, filepath, index, groupIndex, slice: slice.name, numFrames },
          helpers,
        ),
      });
      index++;
    }
  }

  await Promise.all(images);
  await build({
    datasetName,
    mediaType: "group",
    groupSlices: slices,
    samples,
    frames,
    sampleFrames,
    schema,
    labelSchemas,
    savedViews,
  });
};

/**
 * Creates a FiftyOne video dataset with generated solid-color clips, one per
 * sample, at `<tmpdir>/<datasetName>/<index>.<container>`. Frame documents
 * are inserted when `withFrameData` is given, before `compute_metadata()` and
 * the optional `to_frames(sample_frames=True)`, which fills the frame images
 * into those documents.
 *
 * @example
 * await DatasetFactory.createVideoDataset({
 *   datasetName: "my-videos",
 *   videoOptions: { duration: 4 },
 *   schema: { "frames.detections": "Detections" },
 *   withFrameData: () => ({ detections: { _cls: "Detections", detections: [] } }),
 *   sampleFrames: true,
 * });
 */
const createVideoDataset = async ({
  datasetName,
  labelSchemas,
  numSamples = 1,
  sampleFrames = false,
  savedViews,
  schema,
  videoOptions,
  withFrameData,
  withSampleData = () => ({}),
}: VideoDatasetOptions) => {
  const outputDir = await mediaDir(datasetName);
  const samples = new Array<SampleSpec>();
  const frames = new Array<FrameSpec>();

  for (let index = 0; index < numSamples; index++) {
    const options = {
      ...DEFAULT_VIDEO_OPTIONS,
      ...resolve(videoOptions, index),
    };
    const filepath = await createVideo({
      outputPath: path.join(outputDir, String(index)),
      ...options,
    });
    const numFrames = Math.round(options.duration * options.frameRate);
    const _id = indexToId(index);
    samples.push({
      id: _id,
      filepath,
      data: withSampleData({ _id, filepath, index, numFrames }, helpers),
    });
    for (
      let frameNumber = 1;
      withFrameData && frameNumber <= numFrames;
      frameNumber++
    ) {
      frames.push({
        sampleId: _id,
        frameNumber,
        data: withFrameData(
          { sampleId: _id, sampleIndex: index, frameNumber, numFrames },
          helpers,
        ),
      });
    }
  }

  await build({
    datasetName,
    mediaType: "video",
    samples,
    frames,
    sampleFrames,
    schema,
    labelSchemas,
    savedViews,
  });
};

/**
 * Creates a FiftyOne 3D dataset with one generated `.fo3d` scene (a PLY cube)
 * per sample at `<tmpdir>/<datasetName>/<index>.fo3d`.
 *
 * @example
 * await DatasetFactory.create3dDataset({
 *   datasetName: "my-scenes",
 *   schema: { detections: "Detections" },
 *   withSampleData: (_, { createId }) => ({
 *     detections: {
 *       _cls: "Detections",
 *       detections: [{ _id: createId(), _cls: "Detection", label: "car", location: [0, 0, 0] }],
 *     },
 *   }),
 * });
 */
const create3dDataset = async ({
  datasetName,
  labelSchemas,
  numSamples = 1,
  savedViews,
  sceneOptions,
  schema,
  withSampleData = () => ({}),
}: Dataset3dOptions) => {
  const outputDir = await mediaDir(datasetName);
  const samples = new Array<SampleSpec>();

  for (let index = 0; index < numSamples; index++) {
    const filepath = createScene({
      outputPath: path.join(outputDir, String(index)),
      ...resolve(sceneOptions, index),
    });
    const _id = indexToId(index);
    samples.push({
      id: _id,
      filepath,
      data: withSampleData({ _id, filepath, index }, helpers),
    });
  }

  await build({
    datasetName,
    mediaType: "3d",
    samples,
    schema,
    labelSchemas,
    savedViews,
  });
};

/**
 * Creates a FiftyOne multimodal dataset with one generated MCAP recording per
 * sample at `<tmpdir>/<datasetName>/<index>.mcap`.
 *
 * @example
 * await DatasetFactory.createMultimodalDataset({ datasetName: "my-episodes" });
 */
const createMultimodalDataset = async ({
  datasetName,
  labelSchemas,
  mcapKind,
  numSamples = 1,
  savedViews,
  schema,
  withSampleData = () => ({}),
}: MultimodalDatasetOptions) => {
  const outputDir = await mediaDir(datasetName);
  const samples = new Array<SampleSpec>();

  for (let index = 0; index < numSamples; index++) {
    const filepath = path.join(outputDir, `${index}.mcap`);
    await createMcapFixture({
      outputPath: filepath,
      kind: "tiny-episode-a",
      ...resolve(mcapKind, index),
    });
    const _id = indexToId(index);
    samples.push({
      id: _id,
      filepath,
      data: withSampleData({ _id, filepath, index }, helpers),
    });
  }

  await build({
    datasetName,
    mediaType: "multimodal",
    samples,
    schema,
    labelSchemas,
    savedViews,
  });
};

/**
 * Spec for a single detection seeded into an existing sample.
 *
 * `maskSize` (optional): attaches a square mask of all-ones with the given
 * side length, producing a mask-detection. Omit for a plain bbox detection.
 */
export interface DetectionSpec {
  label: string;
  boundingBox: [number, number, number, number];
  maskSize?: number;
}

/**
 * Writes a `fo.Detections` value onto a sample in an existing dataset.
 * Tests should prefer this over inline `executePythonCode` so the
 * generated Python stays in one auditable place.
 *
 * @example
 * await DatasetFactory.seedDetections({
 *   datasetName: "merge-fixture",
 *   field: "instances",
 *   detections: [
 *     { label: "cat", boundingBox: [0.25, 0.4, 0.2, 0.2], maskSize: 50 },
 *     { label: "cat", boundingBox: [0.55, 0.4, 0.2, 0.2], maskSize: 50 },
 *   ],
 * });
 */
const seedDetections = (() => {
  const loader = new OssLoader();
  return async ({
    datasetName,
    field,
    detections,
    sampleIndex = 0,
  }: {
    datasetName: string;
    field: string;
    detections: DetectionSpec[];
    sampleIndex?: number;
  }) => {
    const hasMask = detections.some((d) => d.maskSize);
    const detLines = detections
      .map((d, i) => {
        const mask = d.maskSize
          ? `, mask=np.ones((${d.maskSize}, ${d.maskSize}), dtype=bool)`
          : "";
        return `det_${i} = fo.Detection(label="${d.label}", bounding_box=[${d.boundingBox.join(", ")}]${mask})`;
      })
      .join("\n");
    const detRefs = detections.map((_, i) => `det_${i}`).join(", ");

    await loader.executePythonCode(`
import fiftyone as fo
${hasMask ? "import numpy as np" : ""}

dataset = fo.load_dataset("${datasetName}")
sample = list(dataset)[${sampleIndex}]

${detLines}

sample["${field}"] = fo.Detections(detections=[${detRefs}])
sample.save()
    `);
  };
})();

/**
 * Applies an annotation label schema to a field of an existing dataset and,
 * by default, activates it. Prefer {@link BaseDatasetOptions.labelSchemas}
 * when the schema is known at creation time.
 *
 * @example
 * await DatasetFactory.updateLabelSchema({
 *   datasetName,
 *   field: "ground_truth",
 *   schema: { type: "detections", classes: ["cat"], attributes: [], component: "dropdown" },
 * });
 */
const updateLabelSchema = (() => {
  const loader = new OssLoader();
  return async ({
    activate = true,
    datasetName,
    field,
    schema,
  }: {
    datasetName: string;
    field: string;
    schema: LabelSchema;
    activate?: boolean;
  }) => {
    const schemaFile = writeToTmpFile(JSON.stringify(schema), "json");

    await loader.executePythonCode(`
import json

import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")

with open("${schemaFile}") as f:
    dataset.update_label_schema("${field}", json.load(f), allow_new_attrs=True)

${
  activate
    ? `if "${field}" not in dataset.active_label_schemas:
    dataset.active_label_schemas = dataset.active_label_schemas + ["${field}"]`
    : ""
}
`);
  };
})();

/**
 * Factory for creating FiftyOne datasets in test and fixture contexts. Every
 * creator takes the same `schema`, `labelSchemas`, `withSampleData` and
 * `savedViews` options and inserts fixed-id documents directly; they differ
 * only in the media generated per sample.
 *
 * @example
 * import { DatasetFactory } from "./dataset-factory";
 *
 * await DatasetFactory.createDataset({ datasetName: "test-dataset" });
 * await DatasetFactory.createGroupDataset({ datasetName: "my-groups" });
 * await DatasetFactory.createVideoDataset({ datasetName: "my-videos" });
 * await DatasetFactory.create3dDataset({ datasetName: "my-scenes" });
 * await DatasetFactory.createMultimodalDataset({ datasetName: "my-episodes" });
 * await DatasetFactory.seedDetections({ datasetName, field, detections });
 * await DatasetFactory.updateLabelSchema({ datasetName, field, schema });
 */
export const DatasetFactory = {
  createDataset,
  createGroupDataset,
  createVideoDataset,
  create3dDataset,
  createMultimodalDataset,
  seedDetections,
  updateLabelSchema,
};
