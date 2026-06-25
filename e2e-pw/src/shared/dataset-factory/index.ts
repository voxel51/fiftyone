/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import os from "os";
import path from "path";
import { OssLoader } from "src/oss/fixtures/loader";
import { createImage } from "../media-factory/image";
import { createFo3d } from "../media-factory/fo3d";
import { createPly } from "../media-factory/ply";
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
type Label = "Classification" | "Classifications" | "Detection" | "Detections";

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
 * Factory for creating FiftyOne datasets in test and fixture contexts.
 *
 * @example
 * import { DatasetFactory } from "./dataset-factory";
 *
 * await DatasetFactory.createDataset({ datasetName: "test-dataset" });
 * await DatasetFactory.createGroupDataset({ datasetName: "my-groups" });
 * await DatasetFactory.seedDetections({ datasetName, field, detections });
 */
export const DatasetFactory = {
  createDataset,
  createGroupDataset,
  seedDetections,
};
