import { JSONDeltas } from "../../../client";
import { DetectionLabel } from "@fiftyone/looker/src/overlays/detection";
import { extractNestedField, generateJsonPatch } from "../../../utils/json";
import { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import {
  AnnotationLabel,
  ClassificationAnnotationLabel,
  DetectionAnnotationLabel,
  PolylineAnnotationLabel,
  Sample,
} from "@fiftyone/state";

/**
 * Build a list of JSON deltas for the given sample and label.
 *
 * @param sample Sample containing unmodified label data
 * @param label Current label state
 */
export const buildLabelDeltas = (
  sample: Sample,
  label: AnnotationLabel
): JSONDeltas => {
  if (label.type === "Detection") {
    return buildDetectionDeltas(sample, label);
  } else if (label.type === "Classification") {
    return buildClassificationDeltas(sample, label);
  } else if (label.type === "Polyline") {
    return buildPolylineDeltas(sample, label);
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
export const buildDetectionDeltas = (
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
        newBounds.x,
        newBounds.y,
        newBounds.width,
        newBounds.height,
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
export const buildClassificationDeltas = (
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
export const buildPolylineDeltas = (
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
 * Upsert an array element.
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
