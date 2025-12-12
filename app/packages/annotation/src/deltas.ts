import { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import { DetectionLabel } from "@fiftyone/looker/src/overlays/detection";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import {
  AnnotationLabel,
  ClassificationAnnotationLabel,
  DetectionAnnotationLabel,
  PolylineAnnotationLabel,
  Sample,
} from "@fiftyone/state";
import { JSONDeltas } from "@fiftyone/core/src/client";
import {
  extractNestedField,
  generateJsonPatch,
} from "@fiftyone/core/src/utils/json";
import { Field, Schema } from "@fiftyone/utilities";

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
 * Operation type.
 */
export type OpType = "mutate" | "delete";

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
 * Build JSON-patch-compatible deltas for the specified changes to the sample.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 * @param schema Field schema
 * @param opType Operation type
 */
export const buildLabelDeltas = (
  sample: Sample,
  label: AnnotationLabel,
  schema: Field,
  opType: OpType
) => {
  if (opType === "mutate") {
    return buildMutationDeltas(sample, label, schema);
  } else if (opType === "delete") {
    return buildDeletionDeltas(sample, label, schema);
  } else {
    throw new Error(`Unsupported opType ${opType}`);
  }
};

/**
 * Build a list of JSON deltas for mutating the given sample and label.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 * @param schema Field schema
 */
export const buildMutationDeltas = (
  sample: Sample,
  label: AnnotationLabel,
  schema: Field
): JSONDeltas => {
  // Need to branch on single element vs. list-based mutations due to
  // inferred data model differences.
  // Specifically, the list-like fields are expected to belong to some parent
  // element with an implied structure.
  if (label.type === "Detection") {
    if (isFieldType(schema, "Detections")) {
      return buildDetectionsMutationDelta(sample, label);
    } else if (isFieldType(schema, "Detection")) {
      return buildDetectionMutationDelta(sample, label);
    }
  } else if (label.type === "Classification") {
    if (isFieldType(schema, "Classifications")) {
      return buildClassificationsMutationDeltas(sample, label);
    } else if (isFieldType(schema, "Classification")) {
      return buildClassificationMutationDeltas(sample, label);
    }
  } else if (label.type === "Polyline") {
    if (isFieldType(schema, "Polylines")) {
      return buildPolylinesMutationDeltas(sample, label);
    } else if (isFieldType(schema, "Polyline")) {
      return buildPolylineMutationDeltas(sample, label);
    }
  }

  throw new Error(
    `Unsupported label type '${label.type}' for path '${label.path}'`
  );
};

/**
 * Build a list of JSON deltas for deleting the given label from the sample.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 * @param schema Field schema
 */
export const buildDeletionDeltas = (
  sample: Sample,
  label: AnnotationLabel,
  schema: Field
): JSONDeltas => {
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
      return [{ op: "remove", path: "" }];
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
      return [{ op: "remove", path: "" }];
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
      return [{ op: "remove", path: "" }];
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
const buildSingleMutationDelta = <T extends AnnotationLabel["data"]>(
  sample: Sample,
  path: string,
  data: T
): JSONDeltas => {
  const existingLabel = <T>extractNestedField(sample, path) ?? {};
  return generateJsonPatch(existingLabel, data);
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
  label: DetectionAnnotationLabel
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
 */
export const buildDetectionsMutationDelta = (
  sample: Sample,
  label: DetectionAnnotationLabel
): JSONDeltas => {
  const existingLabel = <DetectionsParent>(
    extractNestedField(sample, label.path)
  ) ?? {
    detections: [],
  };

  const newArray = [...existingLabel.detections];
  upsertArrayElement(
    newArray,
    makeDetectionLabel(label),
    (det) => det._id === label.data._id
  );

  const newLabel = {
    ...existingLabel,
    detections: newArray,
  };

  return generateJsonPatch(existingLabel, newLabel);
};

/**
 * Build a list of JSON deltas for the given sample and classification label.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 */
export const buildClassificationMutationDeltas = (
  sample: Sample,
  label: ClassificationAnnotationLabel
): JSONDeltas => {
  return buildSingleMutationDelta(sample, label.path, label.data);
};

/**
 * Build a list of JSON deltas for the given sample and classification label.
 *
 * This method assumes that the detection exists as part of a parent
 * `fo.Classifications` field.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 */
export const buildClassificationsMutationDeltas = (
  sample: Sample,
  label: ClassificationAnnotationLabel
): JSONDeltas => {
  const existingLabel = <ClassificationsParent>(
    extractNestedField(sample, label.path)
  ) ?? {
    classifications: [],
  };

  const newArray = [...existingLabel.classifications];
  upsertArrayElement(
    newArray,
    { ...label.data },
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
  label: PolylineAnnotationLabel
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
  label: PolylineAnnotationLabel
): JSONDeltas => {
  const existingLabel = <{ polylines: PolylineLabel[] }>(
    extractNestedField(sample, label.path)
  ) ?? {
    polylines: [],
  };

  const newArray = [...existingLabel.polylines];
  upsertArrayElement(
    newArray,
    { ...label.data },
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
 * Build a JSON-patch-compatible path from the sample root.
 *
 * @param labelPath Dot-delimited path to label field
 * @param operationPath Slash-delimited JSON-patch path to mutation field
 */
export const buildJsonPath = (
  labelPath: string,
  operationPath: string
): string => {
  const parts = labelPath.split(".");
  parts.push(
    ...operationPath
      .split("/")
      .filter((segment) => segment !== "/" && segment.length > 0)
  );

  return `/${parts.join("/")}`;
};

/**
 * Get the field schema for the given path.
 *
 * @param schema Sample schema
 * @param path Field path
 */
export const getFieldSchema = (schema: Schema, path: string): Field | null => {
  if (!schema || !path) {
    return null;
  }

  const pathParts = path.split(".");
  const root = schema[pathParts[0]];
  return getFieldSchemaHelper(root, pathParts.slice(1));
};

/**
 * Recursive helper for {@link getFieldSchema}.
 */
const getFieldSchemaHelper = (
  field: Field,
  pathParts: string[]
): Field | null => {
  if (!field) {
    return null;
  }

  if (!pathParts || pathParts.length === 0) {
    return field;
  }

  const nextField = field.fields?.[pathParts[0]];
  return getFieldSchemaHelper(nextField, pathParts.slice(1));
};

/**
 * Create a {@link DetectionLabel} from a {@link DetectionAnnotationLabel}.
 *
 * @param label Source label
 */
const makeDetectionLabel = (
  label: DetectionAnnotationLabel
): DetectionLabel => {
  const bounds = label.overlay.getRelativeBounds();

  return {
    ...label.data,
    bounding_box: [
      bounds.x || 0,
      bounds.y || 0,
      bounds.width || 0,
      bounds.height || 0,
    ],
  };
};
