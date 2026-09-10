/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { OssLoader } from "src/oss/fixtures/loader";
import { createImage } from "../media-factory/image";
import { createFo3d } from "../media-factory/fo3d";
import { createPly } from "../media-factory/ply";
import { createVideo } from "../media-factory/video";
import { createId, ensureDirExists, indexToId } from "../utils";

/**
 * Represents a minimal, unpopulated dataset sample scaffold.
 * Passed to {@link DatasetOptions.withSampleData} to be enriched with field data.
 */
interface SampleScaffold {
  /** The sample's unique identifier, encoded as a 24-character hex string. */
  _id: string;

  /** The absolute file path to the sample's image on disk (e.g. `/tmp/<uuid>/0.png`). */
  filepath: string;

  /** The zero-based index of the sample within the dataset. */
  index: number;
}

/**
 * A collection of utility functions passed to {@link DatasetOptions.withSampleData}
 * for use when constructing sample data.
 */
interface Helpers {
  /**
   * Creates a MongoDB-style object ID wrapper from an optional string.
   * If omitted, a new unique ObjectId is generated.
   * @see {@link createId}
   */
  createId: (id?: string) => { $oid: string };
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
  | "Polylines";

/**
 * All supported field types for dataset schema definitions.
 * Includes both primitive scalar types and FiftyOne {@link Label} types.
 */
type FieldType =
  | Label
  | "IntField"
  | "FloatField"
  | "StringField"
  | "DictField";

/**
 * A recursive type representing any valid JSON value.
 */
type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

/**
 * A plain JSON object mapping string keys to {@link JSONValue} values.
 */
type JSONObject = { [key: string]: JSONValue };

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
 * Configuration options for creating or initializing a dataset.
 */
interface DatasetOptions {
  /**
   * The name of the dataset.
   * Used to identify and reference the dataset.
   */
  datasetName: string;

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
   * Options for generating or rendering images associated with samples.
   * @default { fillColor: "white", width: 50, height: 50 }
   */
  imageOptions?: {
    /** The background or fill color for the image (e.g. `"#ff0000"` or `"red"`). */
    fillColor: string;

    /** The width of the image in pixels. */
    width: number;

    /** The height of the image in pixels. */
    height: number;
  };

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
   *
   * @example
   * {
   *   "ground_truth": "Detection",
   *   "uniqueness": "FloatField",
   * }
   */
  schema?: {
    [path: string]: FieldType;
  };

  /**
   * Annotation label schemas keyed by field path. Each is applied with
   * `dataset.update_label_schema(field, schema)` and the field is added to
   * `dataset.active_label_schemas`, all inside the single dataset-creation
   * subprocess — no follow-up SDK calls needed.
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
  labelSchemas?: { [field: string]: JSONObject };

  /**
   * A factory function that populates a sample with data.
   * Receives an empty `SampleScaffold` and should return a `JSONObject`
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
  withSampleData?: (
    sampleScaffold: SampleScaffold,
    helpers: Helpers,
  ) => JSONObject;
}

/**
 * Creates a FiftyOne dataset with generated image samples.
 *
 * This is an IIFE-initialized async function that holds a shared {@link OssLoader}
 * instance across calls. It:
 *
 * 1. Generates `numSamples` PNG images in a temporary directory.
 * 2. Builds a FiftyOne dataset via embedded Python code, inserting samples
 *    directly into the underlying MongoDB collection for performance.
 * 3. Applies any additional schema fields and saved views.
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
const createDataset = (() => {
  const loader = new OssLoader();
  return async ({
    datasetName,
    imageOptions = {
      fillColor: "white",
      width: 50,
      height: 50,
    },
    labelSchemas = {},
    numSamples = 1,
    numbered = false,
    savedViews = {},
    schema = {},
    withSampleData = () => ({}),
  }: DatasetOptions) => {
    if (!Number.isInteger(numSamples)) {
      throw new Error(
        `Expected 'numSamples' to be an integer, but got ${numSamples}`,
      );
    }

    if (numSamples < 1 || numSamples > 100) {
      throw new Error(
        `'numSamples' must be >0 and <=100, but got ${numSamples}`,
      );
    }

    const promises = new Array<Promise<void>>();
    const sampleData = new Array<string>();
    const outputDir = path.join(os.tmpdir(), datasetName);
    await ensureDirExists(outputDir);

    for (let index = 0; index < numSamples; index++) {
      const filepath = path.join(outputDir, `${index}.png`);
      promises.push(
        createImage({
          outputPath: filepath,
          watermarkString: numbered ? index.toString() : undefined,
          ...imageOptions,
        }),
      );
      const _id = indexToId(index);
      const sampleScaffold = {
        _id,
        filepath,
        index,
      };
      sampleData.push(
        `sample_data.append(json_util.loads('${JSON.stringify(
          withSampleData(sampleScaffold, { createId }),
        )}'))`,
      );
    }

    await Promise.all(promises);
    const addFields = [];
    for (const path in schema) {
      let embeddedDocType: Label | "None" = "None";
      let fieldType: string = schema[path];

      if (isLabelType(fieldType)) {
        embeddedDocType = fieldType;
        fieldType = "EmbeddedDocumentField";
      }

      addFields.push(`
    dataset.add_sample_field(
        "${path}", fo.${fieldType},
        embedded_doc_type=${
          embeddedDocType !== "None" ? "fo." : ""
        }${embeddedDocType}
    )`);
    }

    await loader.executePythonCode(`
    from datetime import datetime
    import json
    import os

    from bson import ObjectId, json_util

    import fiftyone as fo

    dataset = fo.Dataset("${datasetName}")
    dataset.add_sample_field("index", fo.IntField)
    dataset.media_type = "image"
    dataset.persistent = True

    now = datetime.now()


    # an easy hack for creating a small number of samples
    # fix me to scale this factory
    ${addFields.join("\n    ")}

    samples = []
    sample_data = []

    # also a hack
    ${sampleData.join("\n    ")}
    
    for idx in range(0, ${numSamples}):
        sample = fo.Sample(
            _id=ObjectId(f"{idx:024x}"),
            filepath=os.path.join("${outputDir}", f"{idx}.png"),
            index=idx
        )
        sample.created_at = now
        sample.last_modified_at = now
        samples.append(sample)
    
    # ensure the "fixed" IDs are used so linking by sample ID is easy works
    # requires a direct call to dataset._make_dict
    dataset._sample_collection.insert_many(
        [
            dict(**dataset._make_dict(sample, include_id=True), **data)
            for sample, data in zip(samples, sample_data)
        ]
    )
    
    ${
      Object.keys(labelSchemas).length
        ? `label_schemas = json.loads('${JSON.stringify(labelSchemas)}')
    for field_name, label_schema in label_schemas.items():
        dataset.update_label_schema(field_name, label_schema)
    dataset.active_label_schemas = list(label_schemas.keys())`
        : ""
    }

    ${Object.entries(savedViews)
      .map(([name, view]) => {
        return `dataset.save_view("${name}", ${view})`;
      })
      .join("\n")}
    `);
  };
})();

/**
 * A single slice in a group dataset: a name and its media type.
 */
export interface GroupSliceConfig {
  name: string;
  mediaType: "image" | "3d";
}

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
const createGroupDataset = (() => {
  const loader = new OssLoader();
  return async ({
    datasetName,
    numGroups = 3,
    slices = DEFAULT_GROUP_SLICES,
  }: {
    datasetName: string;
    numGroups?: number;
    slices?: GroupSliceConfig[];
  }) => {
    const outputDir = path.join(os.tmpdir(), datasetName);
    await ensureDirExists(outputDir);

    // Generate media files for each group × slice combination
    const imagePromises: Promise<void>[] = [];
    for (let i = 0; i < numGroups; i++) {
      for (const slice of slices) {
        if (slice.mediaType === "image") {
          imagePromises.push(
            createImage({
              outputPath: path.join(outputDir, `${slice.name}-${i}.png`),
              fillColor: "#22577a",
              width: 128,
              height: 128,
              hideLogs: true,
            }),
          );
        } else {
          const plyPath = path.join(outputDir, `${slice.name}-${i}.ply`);
          createPly({
            outputPath: plyPath,
            shape: "cube",
            color: [96, 208, 255],
          });
          createFo3d({
            outputPath: path.join(outputDir, `${slice.name}-${i}.fo3d`),
            plyPath,
          });
        }
      }
    }
    await Promise.all(imagePromises);

    // Build spec list for Python
    const groupSpecs = Array.from({ length: numGroups }, (_, i) => ({
      index: i,
      samples: slices.map((slice) => ({
        name: slice.name,
        mediaType: slice.mediaType,
        filepath:
          slice.mediaType === "image"
            ? path.join(outputDir, `${slice.name}-${i}.png`)
            : path.join(outputDir, `${slice.name}-${i}.fo3d`),
      })),
    }));

    const has3dSlices = slices.some((s) => s.mediaType === "3d");
    const seedMediaTypes = slices
      .map((s) =>
        s.mediaType === "3d"
          ? `"${s.name}": fom.THREE_D`
          : `"${s.name}": fom.IMAGE`,
      )
      .join(", ");
    const defaultSlice = slices[0]?.name ?? "left";

    await loader.executePythonCode(`
import json
import fiftyone as fo
${has3dSlices ? "import fiftyone.core.media as fom" : ""}

specs = json.loads(r'''${JSON.stringify(groupSpecs)}''')

dataset = fo.Dataset("${datasetName}")
dataset.add_group_field("group", default="${defaultSlice}")
dataset.persistent = True

${
  has3dSlices
    ? `
def seed_group_media_types(dataset, group_media_types):
    current = dict(dataset._doc.group_media_types or {})
    current.update(group_media_types)
    dataset._doc.group_media_types = current
    dataset.save()

seed_group_media_types(dataset, {${seedMediaTypes}})
`
    : ""
}

samples = []
for spec in specs:
    group = fo.Group()
    for sample_spec in spec["samples"]:
        kwargs = dict(
            filepath=sample_spec["filepath"],
            group=group.element(sample_spec["name"]),
        )
        if sample_spec["mediaType"] == "3d":
            kwargs["media_type"] = "3d"
        samples.append(fo.Sample(**kwargs))

dataset.add_samples(samples)
    `);
  };
})();

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
 * Shape of the solid-color clip generated for each video sample.
 */
export interface VideoOptions {
  /** Duration in seconds. */
  duration: number;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** Frame rate in frames per second. */
  frameRate: number;
  /** Background color as a CSS hex string. */
  color: string;
  /** When `true`, muxes in a sine-tone audio track. */
  audio: boolean;
  /** Container (and codec): `webm` (VP8) or `mp4` (VP9, faststart). */
  container: "webm" | "mp4";
}

const DEFAULT_VIDEO_OPTIONS: VideoOptions = {
  duration: 2,
  width: 64,
  height: 64,
  frameRate: 10,
  color: "#3050a0",
  audio: false,
  container: "webm",
};

export interface VideoDatasetOptions {
  /** Dataset name. */
  datasetName: string;
  /**
   * Number of video samples. Sample `i` is created with the fixed `_id`
   * `ObjectId(f"{i:024x}")` so it can be deep-linked via the `id` search param
   * (sample 0 => "000000000000000000000000").
   * @default 1
   */
  numSamples?: number;
  /**
   * Overrides for the generated clips, applied over
   * {@link DEFAULT_VIDEO_OPTIONS}. Pass a function to vary the clip per sample
   * index (e.g. an audio track on sample 0 only).
   */
  videoOptions?:
    | Partial<VideoOptions>
    | ((index: number) => Partial<VideoOptions>);
  /** Detection classes offered by the `detections` annotation schema. */
  classes?: string[];
  /** Temporal-detection classes offered by the `events` schema. */
  eventClasses?: string[];
  /** Seed the demo `events` TemporalDetections (approach/pass/depart). */
  withEvents?: boolean;
  /**
   * Sample indices that should carry a pre-seeded tracked frame detection
   * (a single instance, `index=1`, class `classes[0]`, on every frame) so
   * tests can exercise select/edit/track-fan-out/follow-anchor on an
   * existing track. Defaults to none (a clean slate, like `va-demo-bare`).
   */
  trackedSampleIndices?: number[];
  /**
   * Sample indices that should carry a SECOND tracked instance (`index=2`,
   * class `classes[secondTrackClassIndex]`, on every frame) alongside the
   * first — so tests can exercise multi-track ops like merge. Additive;
   * defaults to none.
   */
  secondTrackSampleIndices?: number[];
  /**
   * Class index (into `classes`) for the SECOND tracked instance. Defaults to 1
   * (a DIFFERENT class than the first track's `classes[0]`). Set to 0 to make
   * both tracks share a class — merge is gated to same-class tracks, so a
   * same-class pair is required to exercise a successful merge.
   */
  secondTrackClassIndex?: number;
  /**
   * Subset of {@link trackedSampleIndices} whose tracked detection should also
   * carry an instance mask (a full `np.ones` mask) on every frame, so tests can
   * confirm detection masks render / decode on the video surface. Seeded via a
   * real `fo.Detection` so the mask encoder ships the decodable form.
   */
  maskedSampleIndices?: number[];
  /**
   * Sample indices that should carry a pre-seeded polyline track (a single
   * instance, `index=2`, class `classes[1]`, a closed triangle on every frame)
   * plus a declared `frames.polylines` field and an active polylines schema.
   * Defaults to none.
   */
  polylineSampleIndices?: number[];
  /**
   * Declare the `frames.polylines` field + activate its schema (and seed
   * empty-but-present polylines on every frame) WITHOUT pre-seeding any track.
   * Lets a clean-slate create test enter polyline mode and draw the first
   * polyline. Implied true whenever {@link polylineSampleIndices} is non-empty.
   */
  withPolylineField?: boolean;
  /**
   * Optional string attribute declared `dynamic` in the `frames.detections`
   * schema (a dropdown over `values`) and seeded to `values[0]` on every frame
   * of the tracked detection — so tests can exercise dynamic-attribute
   * forward-fill propagation.
   */
  dynamicAttribute?: { name: string; values: string[] };
  /**
   * Multiple dynamic attributes (each a dropdown over its `values`, seeded to
   * `values[0]` on every frame of the tracked detection). Use when a test needs
   * more than one sub-track row. Takes precedence over {@link dynamicAttribute}.
   */
  dynamicAttributes?: Array<{ name: string; values: string[] }>;
}

/**
 * Creates a video-annotation dataset: one generated solid-color clip per
 * sample, declared frame fields with an active `frames.detections` annotation
 * schema (keyed by its real frame path), an active sample-level `events`
 * TemporalDetections schema, materialized per-frame images for the ImaVid
 * tile, and empty-but-present `frames.detections` on every frame so the first
 * draw's JSON patch can append.
 *
 * Clips are written to `<tmpdir>/<datasetName>/<index>.<container>` once; a
 * spec that re-seeds the same dataset per test reuses them and only the
 * dataset is rebuilt.
 *
 * @example
 * await DatasetFactory.createVideoDataset({
 *   datasetName: "my-video-dataset",
 *   videoOptions: { duration: 4 },
 *   withEvents: false,
 *   trackedSampleIndices: [0],
 * });
 */
const createVideoDataset = (() => {
  const loader = new OssLoader();
  return async ({
    datasetName,
    numSamples = 1,
    videoOptions = {},
    classes = ["vehicle", "person", "road sign"],
    eventClasses = ["approach", "pass", "depart"],
    withEvents = true,
    trackedSampleIndices = [],
    secondTrackSampleIndices = [],
    secondTrackClassIndex = 1,
    maskedSampleIndices = [],
    polylineSampleIndices = [],
    withPolylineField = false,
    dynamicAttribute,
    dynamicAttributes,
  }: VideoDatasetOptions) => {
    const outputDir = path.join(os.tmpdir(), datasetName);
    await ensureDirExists(outputDir);

    const videoPaths = new Array<string>();
    for (let index = 0; index < numSamples; index++) {
      const { container, ...clip } = {
        ...DEFAULT_VIDEO_OPTIONS,
        ...(typeof videoOptions === "function"
          ? videoOptions(index)
          : videoOptions),
      };
      const outputPath = path.join(outputDir, `${index}.${container}`);
      videoPaths.push(outputPath);
      if (!fs.existsSync(outputPath)) {
        await createVideo({ outputPath, ...clip });
      }
    }

    const pyPaths = JSON.stringify(videoPaths);
    const pyClasses = JSON.stringify(classes);
    const pyEventClasses = JSON.stringify(eventClasses);
    const pyTracked = JSON.stringify(trackedSampleIndices);
    const pySecondTracked = JSON.stringify(secondTrackSampleIndices);
    const pySecondTrackClassIndex = JSON.stringify(secondTrackClassIndex);
    const pyMasked = JSON.stringify(maskedSampleIndices);
    const pyPolyline = JSON.stringify(polylineSampleIndices);
    const pyWithPolylineField = withPolylineField ? "True" : "False";
    // Normalize the singular + plural dynamic-attribute options into one list.
    const dynAttrs =
      dynamicAttributes ?? (dynamicAttribute ? [dynamicAttribute] : []);
    const pyDynAttrs = JSON.stringify(dynAttrs);

    await loader.executePythonCode(`
import fiftyone as fo
import numpy as np
from bson import ObjectId

VIDEO_PATHS = ${pyPaths}
CLASSES = ${pyClasses}
EVENT_CLASSES = ${pyEventClasses}
WITH_EVENTS = ${withEvents ? "True" : "False"}
TRACKED = set(${pyTracked})
SECOND_TRACKED = set(${pySecondTracked})
SECOND_TRACK_CLASS = CLASSES[${pySecondTrackClassIndex}]
MASKED = set(${pyMasked})
POLYLINE_TRACKED = set(${pyPolyline})
# Declare + activate the polylines field whenever a track is seeded OR a
# clean-slate polyline-create test asked for the schema only.
POLYLINE_SCHEMA = bool(POLYLINE_TRACKED) or ${pyWithPolylineField}
DYN_ATTRS = ${pyDynAttrs}
DETECTIONS_FIELD = "detections"
FRAME_DETECTIONS_PATH = "frames." + DETECTIONS_FIELD
POLYLINES_FIELD = "polylines"
FRAME_POLYLINES_PATH = "frames." + POLYLINES_FIELD
EVENTS_FIELD = "events"

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True
dataset.media_type = "video"

# Fixed sample ids -> deep-linkable: sample i == ObjectId(f"{i:024x}").
# add_samples() regenerates ids, so force them via a raw insert of the
# sample docs (the same _make_dict trick createDataset uses).
samples = [
    fo.Sample(_id=ObjectId(f"{i:024x}"), filepath=p)
    for i, p in enumerate(VIDEO_PATHS)
]
dataset._sample_collection.insert_many(
    [dataset._make_dict(s, include_id=True) for s in samples]
)
dataset.reload()

# The surface requires populated VideoMetadata (frame_rate / total_frame_count
# / dimensions).
dataset.compute_metadata()

# (2) frame fields the propagation pipeline writes. Declare the parent
# Detections container first, then the nested specs.
dataset.add_frame_field(
    DETECTIONS_FIELD, fo.EmbeddedDocumentField, embedded_doc_type=fo.Detections
)
dataset.add_frame_field("detections.detections.keyframe", fo.BooleanField)
dataset.add_frame_field("detections.detections.propagation", fo.DictField)
for a in DYN_ATTRS:
    dataset.add_frame_field(
        "detections.detections." + a["name"], fo.StringField
    )

# Per-frame Polylines container (declared when polyline tracks are seeded or a
# clean-slate create test asked for the polylines schema).
if POLYLINE_SCHEMA:
    dataset.add_frame_field(
        POLYLINES_FIELD,
        fo.EmbeddedDocumentField,
        embedded_doc_type=fo.Polylines,
    )
    dataset.add_frame_field("polylines.polylines.keyframe", fo.BooleanField)
    dataset.add_frame_field("polylines.polylines.propagation", fo.DictField)

# (4) sample-level TemporalDetections field.
dataset.add_sample_field(
    EVENTS_FIELD, fo.EmbeddedDocumentField, embedded_doc_type=fo.TemporalDetections
)


def total_frames(sample):
    n = (
        getattr(sample.metadata, "total_frame_count", None)
        if sample.metadata
        else None
    )
    if not n:
        n = max(sample.frames.keys()) if sample.frames else 0
    return int(n)


# Materialize per-frame images (ImaVid serves frames from these).
dataset.to_frames(sample_frames=True)

# Every frame gets an empty (present) Detections so the first draw can append.
for sample in dataset.iter_samples(progress=False, autosave=True):
    for fn in range(1, total_frames(sample) + 1):
        sample.frames[fn]["detections"] = fo.Detections(detections=[])

# Pre-seed a tracked detection on requested samples (one instance, index=1,
# class CLASSES[0], on every frame). Samples in MASKED also carry a full
# instance mask so detection-mask rendering can be exercised.
for idx, sample in enumerate(dataset.iter_samples(progress=False, autosave=True)):
    if idx not in TRACKED:
        continue
    mask = np.ones((20, 20), dtype=bool) if idx in MASKED else None
    dyn_kwargs = {a["name"]: a["values"][0] for a in DYN_ATTRS}
    for fn in range(1, total_frames(sample) + 1):
        sample.frames[fn]["detections"] = fo.Detections(
            detections=[
                fo.Detection(
                    label=CLASSES[0],
                    bounding_box=[0.3, 0.3, 0.2, 0.2],
                    index=1,
                    mask=mask,
                    **dyn_kwargs,
                )
            ]
        )

# A SECOND tracked instance (index=2, class SECOND_TRACK_CLASS) appended on
# every frame of requested samples — for multi-track ops (merge).
for idx, sample in enumerate(dataset.iter_samples(progress=False, autosave=True)):
    if idx not in SECOND_TRACKED:
        continue
    for fn in range(1, total_frames(sample) + 1):
        dets = sample.frames[fn]["detections"]
        if dets is None:
            dets = fo.Detections(detections=[])
        dets.detections.append(
            fo.Detection(
                label=SECOND_TRACK_CLASS,
                bounding_box=[0.55, 0.55, 0.2, 0.2],
                index=2,
            )
        )
        sample.frames[fn]["detections"] = dets

# Pre-seed a polyline track on requested samples (one instance, index=2,
# class CLASSES[1], a closed triangle on every frame). Every frame gets an
# empty (present) Polylines first so the seed and any later append line up.
if POLYLINE_SCHEMA:
    for idx, sample in enumerate(
        dataset.iter_samples(progress=False, autosave=True)
    ):
        for fn in range(1, total_frames(sample) + 1):
            sample.frames[fn]["polylines"] = fo.Polylines(polylines=[])
        if idx not in POLYLINE_TRACKED:
            continue
        for fn in range(1, total_frames(sample) + 1):
            sample.frames[fn]["polylines"] = fo.Polylines(
                polylines=[
                    fo.Polyline(
                        label=CLASSES[1],
                        points=[[[0.2, 0.2], [0.5, 0.2], [0.35, 0.5]]],
                        closed=True,
                        filled=False,
                        index=2,
                    )
                ]
            )

# (5) demo temporal events (approach / pass / depart thirds).
if WITH_EVENTS:
    for sample in dataset.iter_samples(progress=False, autosave=True):
        n = total_frames(sample)
        a = max(1, n // 3)
        b = max(a + 1, (2 * n) // 3)
        sample[EVENTS_FIELD] = fo.TemporalDetections(
            detections=[
                fo.TemporalDetection(label=EVENT_CLASSES[0], support=[1, a]),
                fo.TemporalDetection(label=EVENT_CLASSES[1], support=[a + 1, b]),
                fo.TemporalDetection(label=EVENT_CLASSES[2], support=[b + 1, n]),
            ]
        )

# (6) stable cross-frame Instance per (label, index) track, per sample —
# across both the detection and polyline lists.
for sample in dataset.iter_samples(progress=False, autosave=True):
    by_track = {}
    for frame in sample.frames.values():
        elements = []
        if frame.detections is not None:
            elements.extend(frame.detections.detections)
        if POLYLINE_TRACKED and frame.polylines is not None:
            elements.extend(frame.polylines.polylines)
        for label in elements:
            if label.index is None:
                continue
            key = (type(label).__name__, label.label, label.index)
            inst = by_track.get(key)
            if inst is None:
                inst = fo.Instance()
                by_track[key] = inst
            current = getattr(label, "instance", None)
            if current is None or current.id != inst.id:
                label.instance = inst

# Active annotation schemas: frames.detections + events.
det_schema = {
    "type": "detections",
    "component": "dropdown",
    "attributes": [
        {"name": "id", "type": "id", "component": "text", "read_only": True},
        {"name": "tags", "type": "list<str>", "component": "text"},
        {"name": "confidence", "type": "float", "component": "text"},
        {"name": "index", "type": "int", "component": "text"},
        {"name": "mask_path", "type": "str", "component": "text"},
    ],
    "classes": CLASSES,
}
for a in DYN_ATTRS:
    det_schema["attributes"].append(
        {
            "name": a["name"],
            "type": "str",
            "component": "dropdown",
            "values": a["values"],
            "dynamic": True,
        }
    )
dataset.update_label_schema(
    FRAME_DETECTIONS_PATH, det_schema, allow_new_attrs=True
)
dataset.active_label_schemas = [FRAME_DETECTIONS_PATH]

# Active polylines schema (whenever the polylines field is declared).
if POLYLINE_SCHEMA:
    poly_schema = {
        "type": "polylines",
        "component": "dropdown",
        "attributes": [
            {"name": "id", "type": "id", "component": "text", "read_only": True},
            {"name": "index", "type": "int", "component": "text"},
        ],
        "classes": CLASSES,
    }
    dataset.update_label_schema(
        FRAME_POLYLINES_PATH, poly_schema, allow_new_attrs=True
    )
    dataset.active_label_schemas = dataset.active_label_schemas + [
        FRAME_POLYLINES_PATH
    ]

events_schema = {
    "type": "temporaldetections",
    "component": "dropdown",
    "attributes": [
        {"name": "id", "type": "id", "component": "text", "read_only": True},
    ],
    "classes": EVENT_CLASSES,
}
dataset.update_label_schema(EVENTS_FIELD, events_schema, allow_new_attrs=True)
dataset.active_label_schemas = dataset.active_label_schemas + [EVENTS_FIELD]

dataset.save()
print(
    "VIDEO_DATASET_SEED_DONE",
    dataset.name,
    "samples=", len(dataset),
    "frames0=", total_frames(dataset.first()),
)
`);
  };
})();

/** One frame's label on a tracked frame field, as persisted. */
export interface FrameTrackLabel {
  frame: number;
  /** The cross-frame `instance._id` (the track key), or null. */
  instance: string | null;
  label: string | null;
  keyframe: boolean;
  /** A box or at least one polyline vertex is stored on the frame. */
  hasGeometry: boolean;
}

/**
 * Reads back every label on a sample's tracked frame `field` (e.g.
 * `detections`, `polylines`), one row per frame, from the live DB. Use to
 * verify a track edit (split / merge / keyframe pin) round-tripped.
 *
 * @example
 * const rows = await DatasetFactory.frameTrackState(datasetName, "detections");
 */
const frameTrackState = (() => {
  const loader = new OssLoader();
  return async (
    datasetName: string,
    field: string,
    sampleIndex = 0,
  ): Promise<FrameTrackLabel[]> => {
    const resultFile = path.join(
      os.tmpdir(),
      `frame-track-state-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.json`,
    );

    await loader.executePythonCode(`
import json
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
sample = dataset.skip(${sampleIndex}).first()
rows = []
for fn, frame in sample.frames.items():
    container = frame["${field}"]
    if container is None:
        continue
    for label in getattr(container, "${field}", []) or []:
        instance = getattr(label, "instance", None)
        points = getattr(label, "points", None)
        rows.append({
            "frame": int(fn),
            "instance": str(instance._id) if instance is not None else None,
            "label": getattr(label, "label", None),
            "keyframe": bool(getattr(label, "keyframe", False)),
            "has_geometry": bool(getattr(label, "bounding_box", None))
            or bool(points and any(len(s) for s in points)),
        })

with open("${resultFile}", "w") as f:
    json.dump(rows, f)
`);

    const raw = fs.readFileSync(resultFile, "utf-8");
    fs.unlinkSync(resultFile);
    const parsed = JSON.parse(raw) as Array<{
      frame: number;
      instance: string | null;
      label: string | null;
      keyframe: boolean;
      has_geometry: boolean;
    }>;

    return parsed.map((row) => ({
      frame: row.frame,
      instance: row.instance,
      label: row.label,
      keyframe: row.keyframe,
      hasGeometry: row.has_geometry,
    }));
  };
})();

/**
 * Factory for creating FiftyOne datasets in test and fixture contexts.
 *
 * @example
 * import { DatasetFactory } from "./dataset-factory";
 *
 * await DatasetFactory.createDataset({ datasetName: "test-dataset" });
 * await DatasetFactory.createGroupDataset({ datasetName: "my-groups" });
 * await DatasetFactory.createVideoDataset({ datasetName: "my-videos" });
 * await DatasetFactory.seedDetections({ datasetName, field, detections });
 * await DatasetFactory.frameTrackState(datasetName, "detections");
 */
export const DatasetFactory = {
  createDataset,
  createGroupDataset,
  createVideoDataset,
  frameTrackState,
  seedDetections,
};
