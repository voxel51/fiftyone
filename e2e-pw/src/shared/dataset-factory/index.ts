/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { OssLoader } from "src/oss/fixtures/loader";
import { createBlankImage } from "../media-factory/image";

/**
 * Represents a minimal, unpopulated dataset sample scaffold.
 * Passed to {@link DatasetOptions.withSampleData} to be enriched with field data.
 */
interface BlankSample {
  /** The sample's unique identifier, encoded as a 24-character hex string. */
  _id: string;

  /** The absolute file path to the sample's image on disk (e.g. `/tmp/<uuid>/0.png`). */
  filepath: string;

  /** The zero-based index of the sample within the dataset. */
  index: number;
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
type FieldType = Label | "IntField" | "FloatField" | "StringField";

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
 * Converts a non-negative integer into a 24-character zero-padded hex string,
 * suitable for use as a MongoDB-compatible ObjectId.
 *
 * Negative integers are converted to their unsigned 32-bit representation
 * before encoding.
 *
 * @param integer - The integer to convert. Must be a whole number.
 * @returns A 24-character hexadecimal string.
 * @throws {TypeError} If `integer` is not an integer.
 *
 * @example
 * indexToId(0)   // "000000000000000000000000"
 * indexToId(255) // "0000000000000000000000ff"
 */
function indexToId(integer: number) {
  if (!Number.isInteger(integer))
    throw new TypeError("value is not an integer");

  return (integer < 0 ? integer >>> 0 : integer).toString(16).padStart(24, "0");
}

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
   * The number of samples to include in the dataset.
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
   *   "confidence": "FloatField",
   * }
   */
  schema?: {
    [path: string]: FieldType;
  };

  /**
   * A factory function that populates a blank sample with data.
   * Receives an empty `BlankSample` and should return a `JSONObject`
   * representing the fully populated sample.
   *
   * @param blankSample - The unpopulated sample scaffold.
   * @returns A `JSONObject` containing the sample's field values.
   *
   * @example
   * withSampleData: (blankSample) => ({
   *   ...blankSample,
   *   label: "cat",
   *   confidence: 0.97,
   * })
   */
  withSampleData?: (blankSample: BlankSample) => JSONObject;
}

/**
 * Creates a blank FiftyOne dataset with generated image samples.
 *
 * This is an IIFE-initialized async function that holds a shared {@link OssLoader}
 * instance across calls. It:
 *
 * 1. Generates `numSamples` blank PNG images in a temporary directory.
 * 2. Builds a FiftyOne dataset via embedded Python code, inserting samples
 *    directly into the underlying MongoDB collection for performance.
 * 3. Applies any additional schema fields and saved views.
 *
 * @param options - {@link DatasetOptions} controlling dataset creation.
 * @returns A `Promise` that resolves when the dataset and all samples have been created.
 * @throws {Error} If `numSamples` is less than 1 or not an integer.
 *
 * @example
 * await DatasetFactory.createBlankDataset({
 *   datasetName: "my-dataset",
 *   numSamples: 10,
 *   numbered: true,
 *   imageOptions: { fillColor: "black", width: 128, height: 128 },
 *   schema: { ground_truth: "Detection", confidence: "FloatField" },
 *   withSampleData: ({ index }) => ({ confidence: index * 0.1 }),
 * });
 */
const createBlankDataset = (() => {
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
    schema,
    withSampleData = () => ({}),
  }: DatasetOptions) => {
    if (numSamples < 1 || !Number.isInteger(numSamples)) {
      throw new Error(
        `Expected 'numSamples' to be an integer, but got ${numSamples}`
      );
    }

    const promises = new Array<Promise<void>>();
    const sampleData = new Array<string>();

    for (let index = 0; index < numSamples; index++) {
      const filepath = `/tmp/${datasetName}/${index}.png`;
      promises.push(
        createBlankImage({
          outputPath: filepath,
          watermarkString: numbered ? index.toString() : undefined,
          ...imageOptions,
        })
      );
      const _id = indexToId(index);
      const blankSample = {
        _id,
        filepath,
        index,
      };
      sampleData.push(
        `sample_data.append(json.loads('${JSON.stringify(
          withSampleData(blankSample)
        )}'))`
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
        embedded_doc_type=fo.${embeddedDocType}
    )`);
    }

    await loader.executePythonCode(`
    from bson import ObjectId
    import fiftyone as fo
    import json

    dataset = fo.Dataset("${datasetName}")
    dataset.media_type = "image"

    ${addFields.join("\n")}

    samples = []
    sample_data = []

    ${sampleData.join("\n")}
    
    for idx in range(0, ${numSamples}):
        samples.append(
            fo.Sample(
                _id=ObjectId(f"{idx:024x}"),
                filepath=f"/tmp/${datasetName}/{idx}.png",
                index=idx
            )
        )
    
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
 * Factory for creating FiftyOne datasets in test and fixture contexts.
 *
 * @example
 * import { DatasetFactory } from "./dataset-factory";
 *
 * await DatasetFactory.createBlankDataset({ datasetName: "test-dataset" });
 */
export const DatasetFactory = {
  createBlankDataset,
};
