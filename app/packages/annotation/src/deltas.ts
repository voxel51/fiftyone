import { isDetection3d } from "@fiftyone/core";
import { JSONDeltas } from "@fiftyone/core/src/client";
import {
  extractNestedField,
  generateJsonPatch,
} from "@fiftyone/core/src/utils/json";
import { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import { DetectionLabel } from "@fiftyone/looker/src/overlays/detection";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import {
  AnnotationLabel,
  DetectionAnnotationLabel,
  PrimitiveValue,
  Sample,
} from "@fiftyone/state";
import { Field, Primitive } from "@fiftyone/utilities";
import { get } from "lodash";
import type { OpType } from "./types";
import { arePrimitivesEqual, isPrimitiveFieldType } from "./util";

/**
 * Helper type representing a `fo.Polylines`-like element.
 */
type PolylinesParent = {
  polylines: PolylineLabel[];
};

/**
 * Helper type representing a `fo.Detections`-like element.
 */
type DetectionsParent = {
  detections: DetectionLabel[];
};

/**
 * Helper type representing a `fo.Classifications`-like element.
 */
type ClassificationsParent = {
  classifications: ClassificationLabel[];
};

/**
 * Types of "native" labels which support delta calculation.
 */
type FieldType =
  | "Detection"
  | "Detections"
  | "Classification"
  | "Classifications"
  | "Polyline"
  | "Polylines";

const isFieldType = (field: Field, fieldType: FieldType): boolean => {
  return field?.embeddedDocType === `fiftyone.core.labels.${fieldType}`;
};

/**
 * Build the annotation path for a label.
 *
 *
 * @param label The annotation label
 * @param isGenerated Whether this is from a generated dataset
 * @returns The adjusted path for the annotation
 */
export const buildAnnotationPath = (
  label: LabelProxy,
  isGenerated: boolean
): string => {
  let basePath = label.path;
  if (isGenerated) {
    // Patches views flatten the structure so we need to adjust the path to reflect the src sample.
    if (label.type === "Detection") basePath = `${basePath}.detections`;
  }
  return basePath;
};

/**
 * Helper type encapsulating label metadata relevant to delta calculations.
 */
type LabelMetadata<T> = {
  type: Extract<FieldType, "Detection" | "Classification" | "Polyline">;
  path: string;
  data: T;
};

/**
 * {@link LabelMetadata} detection subtype which includes a 2D bounding box.
 */
type Detection2DMetadata = LabelMetadata<DetectionLabel> & {
  type: "Detection";
  boundingBox: [number, number, number, number];
};

/**
 * Proxy type for an annotation label.
 *
 * This type represents a union of valid {@link LabelMetadata} variants.
 */
export type LabelProxy =
  | LabelMetadata<ClassificationLabel | DetectionLabel | PolylineLabel>
  | Detection2DMetadata
  | PrimitiveValue;

/**
 * Build JSON-patch-compatible deltas for the specified changes to the sample.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 * @param schema Field schema
 * @param opType Operation type
 * @param isGenerated Whether this is from a generated view
 */
export const buildLabelDeltas = (
  sample: Sample,
  label: LabelProxy,
  schema: Field,
  opType: OpType,
  isGenerated = false
) => {
  if (opType === "mutate") {
    return buildMutationDeltas(sample, label, schema, isGenerated);
  } else if (opType === "delete") {
    // Primitives cannot be deleted via this path
    return buildDeletionDeltas(
      sample,
      label as Exclude<LabelProxy, PrimitiveValue>,
      schema,
      isGenerated
    );
  } else {
    throw new Error(`Unsupported opType ${opType}`);
  }
};

/**
 * Build a list of JSON deltas for mutating the given sample and label.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state (annotation label or primitive label)
 * @param schema Field schema
 * @param isGenerated Whether this is from a generated view
 */
export const buildMutationDeltas = (
  sample: Sample,
  label: LabelProxy,
  schema: Field,
  isGenerated = false
): JSONDeltas => {
  // Need to branch on single element vs. list-based mutations due to
  // inferred data model differences.
  // Specifically, the list-like fields are expected to belong to some parent
  // element with an implied structure.
  if (label.type === "Detection") {
    if (isFieldType(schema, "Detections")) {
      return buildDetectionsMutationDelta(
        sample,
        label as DetectionAnnotationLabel,
        isGenerated
      );
    } else if (isFieldType(schema, "Detection")) {
      return buildDetectionMutationDelta(
        sample,
        label as DetectionAnnotationLabel
      );
    }
  } else if (label.type === "Classification") {
    if (isFieldType(schema, "Classifications")) {
      return buildClassificationsMutationDeltas(
        sample,
        label as LabelMetadata<ClassificationLabel>
      );
    } else if (isFieldType(schema, "Classification")) {
      return buildClassificationMutationDeltas(
        sample,
        label as LabelMetadata<ClassificationLabel>
      );
    }
  } else if (label.type === "Polyline") {
    if (isFieldType(schema, "Polylines")) {
      return buildPolylinesMutationDeltas(
        sample,
        label as LabelMetadata<PolylineLabel>
      );
    } else if (isFieldType(schema, "Polyline")) {
      return buildPolylineMutationDeltas(
        sample,
        label as LabelMetadata<PolylineLabel>
      );
    }
  } else if (isPrimitiveFieldType(schema)) {
    const primitiveLabel = label as PrimitiveValue;
    return buildPrimitiveMutationDelta(
      sample,
      primitiveLabel.path,
      primitiveLabel.data,
      primitiveLabel.op
    );
  }

  throw new Error(
    `Unsupported field type '${schema?.ftype}' at path '${label.path}'`
  );
};

/**
 * Build a list of JSON deltas for deleting the given label from the sample.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 * @param schema Field schema
 * @param isGenerated Whether this is from a generated view
 */
export const buildDeletionDeltas = (
  sample: Sample,
  label: Exclude<LabelProxy, PrimitiveValue>,
  schema: Field,
  isGenerated = false
): JSONDeltas => {
  // Future-proofing for generated views: deletion is always a simple remove of the label
  // The backend handles removing from the source sample's list
  if (isGenerated) {
    return [{ op: "remove", path: "/" }];
  }

  // todo refactor to reduce code duplication
  if (label.type === "Detection") {
    if (isFieldType(schema, "Detections")) {
      const existingLabel = <DetectionsParent>(
        extractNestedField(sample, label.path)
      );

      if (!existingLabel || !Array.isArray(existingLabel.detections)) {
        // label doesn't exist
        console.warn(
          `can't delete label; no detections found at ${label.path}`
        );
        return [];
      }

      return generateJsonPatch(existingLabel, {
        ...existingLabel,
        detections: existingLabel.detections.filter(
          (det) => det._id !== label.data._id
        ),
      });
    } else if (isFieldType(schema, "Detection")) {
      return [{ op: "remove", path: "/" }];
    }
  } else if (label.type === "Classification") {
    if (isFieldType(schema, "Classifications")) {
      const existingLabel = <ClassificationsParent>(
        extractNestedField(sample, label.path)
      );

      if (!existingLabel || !Array.isArray(existingLabel.classifications)) {
        // label doesn't exist
        console.warn(
          `can't delete label; no classifications found at ${label.path}`
        );
        return [];
      }

      return generateJsonPatch(existingLabel, {
        ...existingLabel,
        classifications: existingLabel.classifications.filter(
          (cls) => cls._id !== label.data._id
        ),
      });
    } else if (isFieldType(schema, "Classification")) {
      return [{ op: "remove", path: "/" }];
    }
  } else if (label.type === "Polyline") {
    if (isFieldType(schema, "Polylines")) {
      const existingLabel = <PolylinesParent>(
        extractNestedField(sample, label.path)
      );

      if (!existingLabel || !Array.isArray(existingLabel.polylines)) {
        // label doesn't exist
        console.warn(`can't delete label; no polylines found at ${label.path}`);
        return [];
      }

      return generateJsonPatch(existingLabel, {
        ...existingLabel,
        polylines: existingLabel.polylines.filter(
          (ply) => ply._id !== label.data._id
        ),
      });
    } else {
      return [{ op: "remove", path: "/" }];
    }
  }

  throw new Error(
    `unknown label type '${label.type}' for path '${label.path}'`
  );
};

/**
 * Build mutation deltas for a "single" label, i.e. not a label belonging to
 * an array of elements.
 *
 * @param sample Sample
 * @param path Label path
 * @param data Label data
 */
const buildSingleMutationDelta = <
  T extends AnnotationLabel["data"] | Primitive
>(
  sample: Sample,
  path: string,
  data: T
): JSONDeltas => {
  const existingLabel = <T>extractNestedField(sample, path) ?? {};
  return generateJsonPatch(existingLabel, data);
};

const buildPrimitiveMutationDelta = (
  sample: Sample,
  path: string,
  data: Primitive,
  op?: OpType
): JSONDeltas => {
  const existingValue = get(sample, path) as Primitive;

  // If the value hasn't changed, return empty deltas
  if (arePrimitivesEqual(existingValue, data)) {
    return [];
  }

  const delta = { op: "replace", path: "", value: data };

  if (op === "delete") {
    delta.op = "remove";
    delete delta.value;
  } else if (op === "add") {
    delta.op = "add";
  }

  // Return a replace operation with empty path - buildJsonPath will prepend the label path
  return [delta];
};

/**
 * Build a list of JSON deltas for the given sample and detection label.
 *
 * This method assumes that the detection exists as a top-level field (i.e. not
 * part of an `fo.Detections` field).
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 */
export const buildDetectionMutationDelta = (
  sample: Sample,
  label: LabelMetadata<DetectionLabel> | Detection2DMetadata
): JSONDeltas => {
  return buildSingleMutationDelta(
    sample,
    label.path,
    makeDetectionLabel(label)
  );
};

/**
 * Build a list of JSON deltas for the given sample and detection label.
 *
 * This method assumes that the detection exists as part of a parent
 * `fo.Detections` field.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 * @param isGenerated Whether this is from a generated view
 */ export const buildDetectionsMutationDelta = (
  sample: Sample,
  label: LabelMetadata<DetectionLabel> | Detection2DMetadata,
  isGenerated = false
): JSONDeltas => {
  const existingLabel = <DetectionsParent>(
    extractNestedField(sample, label.path)
  ) ?? { detections: [] };

  const newDetection = makeDetectionLabel(label);

  if (isGenerated) {
    // Field-level single updates
    const existingDetection =
      existingLabel.detections?.find((det) => det._id === label.data._id) ?? {};
    return generateJsonPatch(existingDetection, newDetection);
  }

  // Merge with existing data so server-enriched properties (tags,
  // attributes, _cls, etc.) are preserved when the overlay only carries
  // a minimal subset of fields.
  const { detections } = existingLabel;
  const exists = detections.some((det) => det._id === label.data._id);
  const newDetections = exists
    ? detections.map((det) =>
        det._id === label.data._id ? { ...det, ...newDetection } : det
      )
    : [...detections, newDetection];

  return generateJsonPatch(existingLabel, {
    ...existingLabel,
    detections: newDetections,
  });
};

/**
 * Build a list of JSON deltas for the given sample and classification label.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 */
export const buildClassificationMutationDeltas = (
  sample: Sample,
  label: LabelMetadata<ClassificationLabel>
): JSONDeltas => {
  return buildSingleMutationDelta(sample, label.path, label.data);
};

/**
 * Build a list of JSON deltas for the given sample and classification label.
 *
 * This method assumes that the classification exists as part of a parent
 * `fo.Classifications` field.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 */
export const buildClassificationsMutationDeltas = (
  sample: Sample,
  label: LabelMetadata<ClassificationLabel>
): JSONDeltas => {
  const existingLabel = <ClassificationsParent>(
    extractNestedField(sample, label.path)
  ) ?? {
    classifications: [],
  };

  const existingClassification = existingLabel.classifications.find(
    (cls) => cls._id === label.data._id
  );

  const mergedClassification = existingClassification
    ? { ...existingClassification, ...label.data }
    : { ...label.data };

  const newArray = [...existingLabel.classifications];
  upsertArrayElement(
    newArray,
    mergedClassification,
    (cls) => cls._id === label.data._id
  );

  const newLabel = {
    ...existingLabel,
    classifications: newArray,
  };

  return generateJsonPatch(existingLabel, newLabel);
};

/**
 * Build a list of JSON deltas for the given sample and detection label.
 *
 * This method assumes that the detection exists as a top-level field (i.e. not
 * part of an `fo.Polylines` field).
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 */
export const buildPolylineMutationDeltas = (
  sample: Sample,
  label: LabelMetadata<PolylineLabel>
): JSONDeltas => {
  return buildSingleMutationDelta(sample, label.path, label.data);
};

/**
 * Build a list of JSON deltas for the given sample and polyline label.
 *
 * This method assumes that the polyline exists as part of a parent
 * `fo.Polylines` field.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 */
export const buildPolylinesMutationDeltas = (
  sample: Sample,
  label: LabelMetadata<PolylineLabel>
): JSONDeltas => {
  const existingLabel = <{ polylines: PolylineLabel[] }>(
    extractNestedField(sample, label.path)
  ) ?? {
    polylines: [],
  };

  const existingPolyline = existingLabel.polylines.find(
    (ply) => ply._id === label.data._id
  );

  const mergedPolyline = existingPolyline
    ? { ...existingPolyline, ...label.data }
    : { ...label.data };

  const newArray = [...existingLabel.polylines];
  upsertArrayElement(
    newArray,
    mergedPolyline,
    (ply) => ply._id === label.data._id
  );

  const newLabel = {
    ...existingLabel,
    polylines: newArray,
  };

  return generateJsonPatch(existingLabel, newLabel);
};

/**
 * Upsert an array element in-place.
 *
 * If the specified element (as determined by `find`) exists, it is replaced.
 * Otherwise, the element is appended to the array.
 *
 * @param array Array of elements
 * @param element Element to upsert
 * @param find Function which returns `true` for a matching element, and
 *  `false` otherwise
 */
const upsertArrayElement = <T>(
  array: T[],
  element: T,
  find: (e: T) => boolean
) => {
  const index = array.findIndex((e) => find(e));
  if (index >= 0) {
    array.splice(index, 1, element);
  } else {
    array.push(element);
  }
};

/**
 * Build a JSON-patch-compatible path from the root object.
 *
 * @param labelPath Dot-delimited path to label field
 * @param operationPath Slash-delimited JSON-patch path to mutation field
 */
export const buildJsonPath = (
  labelPath: string | null,
  operationPath: string
): string => {
  // labelPath will be null when building paths for sample field updates
  const parts = labelPath?.split(".") || [];
  parts.push(
    ...operationPath
      .split("/")
      .filter((segment) => segment !== "/" && segment.length > 0)
  );

  return `/${parts.join("/")}`;
};

/**
 * Create a {@link DetectionLabel} from a {@link LabelMetadata} instance.
 *
 * @param label Source label
 */
const makeDetectionLabel = (
  label: LabelMetadata<DetectionLabel> | Detection2DMetadata
): DetectionLabel => {
  if (isDetection3d(label.data)) {
    return label.data;
  }

  const boundingBox = (label as Detection2DMetadata).boundingBox;

  return {
    ...label.data,
    bounding_box: [
      boundingBox[0] || 0,
      boundingBox[1] || 0,
      boundingBox[2] || 0,
      boundingBox[3] || 0,
    ],
  };
};
