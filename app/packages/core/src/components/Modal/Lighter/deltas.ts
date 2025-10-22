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
import { JSONDeltas } from "../../../client";
import { extractNestedField, generateJsonPatch } from "../../../utils/json";

type PolylinesParent = {
  polylines: PolylineLabel[];
};

type DetectionsParent = {
  detections: DetectionLabel[];
};

/**
 * Operation type
 */
export type OpType = "mutate" | "delete";

/**
 * Build JSON-patch-compatible deltas for the specified changes to the sample.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 * @param opType Operation type
 */
export const buildLabelDeltas = (
  sample: Sample,
  label: AnnotationLabel,
  opType: OpType
) => {
  if (opType === "mutate") {
    return buildMutationDeltas(sample, label);
  } else if (opType === "delete") {
    return buildDeletionDeltas(sample, label);
  } else {
    throw new Error(`Unsupported opType ${opType}`);
  }
};

/**
 * Build a list of JSON deltas for mutating the given sample and label.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 */
export const buildMutationDeltas = (
  sample: Sample,
  label: AnnotationLabel
): JSONDeltas => {
  if (label.type === "Detection") {
    return buildDetectionMutationDeltas(sample, label);
  } else if (label.type === "Classification") {
    return buildClassificationMutationDeltas(sample, label);
  } else if (label.type === "Polyline") {
    return buildPolylineMutationDeltas(sample, label);
  } else {
    throw new Error(`unknown label type '${label.type}'`);
  }
};

/**
 * Build a list of JSON deltas for deleting the given label from the sample.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 */
export const buildDeletionDeltas = (
  sample: Sample,
  label: AnnotationLabel
): JSONDeltas => {
  if (label.type === "Detection") {
    const existingLabel = <DetectionsParent>(
      extractNestedField(sample, label.path)
    );

    if (!existingLabel || !Array.isArray(existingLabel.detections)) {
      // label doesn't exist
      console.warn(`can't delete label; no detections found at ${label.path}`);
      return [];
    }

    return generateJsonPatch(existingLabel, {
      ...existingLabel,
      detections: existingLabel.detections.filter(
        (det) => det._id !== label.data._id
      ),
    });
  } else if (label.type === "Classification") {
    return [{ op: "remove", path: "" }];
  } else if (label.type === "Polyline") {
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
    throw new Error(`unknown label type '${label.type}'`);
  }
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
export const buildDetectionMutationDeltas = (
  sample: Sample,
  label: DetectionAnnotationLabel
): JSONDeltas => {
  const existingLabel = <{ _cls: string; detections: DetectionLabel[] }>(
    extractNestedField(sample, label.path)
  ) ?? {
    _cls: "Detections",
    detections: [],
  };

  const newArray = [...existingLabel.detections];
  const newBounds = label.overlay.getRelativeBounds();
  upsertArrayElement(
    newArray,
    {
      ...label.data,
      // todo this shouldn't be needed,
      //  but bounding_box in label.data doesn't get updated
      bounding_box: [
        newBounds.x || 0,
        newBounds.y || 0,
        newBounds.width || 0,
        newBounds.height || 0,
      ],
    },
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
  const existingLabel =
    <ClassificationLabel>extractNestedField(sample, label.path) ?? {};

  return generateJsonPatch(existingLabel, label.data);
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
export const buildPolylineMutationDeltas = (
  sample: Sample,
  label: PolylineAnnotationLabel
): JSONDeltas => {
  const existingLabel = <{ _cls: string; polylines: PolylineLabel[] }>(
    extractNestedField(sample, label.path)
  ) ?? {
    _cls: "Polylines",
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
