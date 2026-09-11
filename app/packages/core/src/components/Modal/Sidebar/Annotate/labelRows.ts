import type { AnnotationLabel, AnnotationLabelData } from "@fiftyone/state";
import { LabelType as EngineLabelType } from "@fiftyone/utilities";
import type { LabelType } from "./Edit/useAnnotationContext";

/** Engine label type to the singular sidebar row type it renders as. */
export const SINGULAR: Partial<Record<EngineLabelType, LabelType>> = {
  [EngineLabelType.Classification]: "Classification",
  [EngineLabelType.Classifications]: "Classification",
  [EngineLabelType.Detection]: "Detection",
  [EngineLabelType.Detections]: "Detection",
  [EngineLabelType.Keypoint]: "Keypoint",
  [EngineLabelType.Keypoints]: "Keypoint",
  [EngineLabelType.Polyline]: "Polyline",
  [EngineLabelType.Polylines]: "Polyline",
};

export const byLabelName = (a: AnnotationLabel, b: AnnotationLabel) =>
  (a.data.label ?? "").localeCompare(b.data?.label ?? "");

export const sameData = (a: AnnotationLabelData, b: AnnotationLabelData) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

export const sameEntry = (a: AnnotationLabel, b: AnnotationLabel) =>
  a.overlay === b.overlay &&
  a.path === b.path &&
  a.type === b.type &&
  sameData(a.data, b.data);

/**
 * Transitional row overlay for an engine label with no mounted Lighter
 * overlay: just enough surface (id, field, label) for list rendering.
 */
export const stubOverlay = (
  id: string,
  field: string,
  label: AnnotationLabelData,
): AnnotationLabel["overlay"] =>
  ({ id, field, label }) as unknown as AnnotationLabel["overlay"];
