import type {
  AnnotationAgent,
  PropagationInferenceResult,
  SAM2PropagationBrowserAgent,
} from "@fiftyone/annotation";
import {
  type LabelData,
  LabelType,
  type SyntheticBox,
  type SyntheticPolyline,
} from "@fiftyone/utilities";

/** Bbox-bearing detection fields, the only kinds SAM2 can track. */
export const isBoxFieldType = (type: LabelType): boolean =>
  type === LabelType.Detection || type === LabelType.Detections;

/** Vertex-bearing polyline fields; their vertices interpolate. */
export const isPolylineFieldType = (type: LabelType): boolean =>
  type === LabelType.Polyline || type === LabelType.Polylines;

/** Linear agent id for a field's geometry, or `null` when nothing can be lerped. */
export const linearAgentFor = (type: LabelType): string | null => {
  if (isBoxFieldType(type)) return "propagate-linear";
  if (isPolylineFieldType(type)) return "propagate-linear-polyline";
  return null;
};

/** The engine's stored polyline as the shape the polyline agent consumes. */
export const toSyntheticPolyline = (label: LabelData): SyntheticPolyline => ({
  id: label._id,
  _id: label._id,
  label: (label.label as string) ?? "",
  points: label.points as SyntheticPolyline["points"],
  closed: label.closed as boolean | undefined,
  filled: label.filled as boolean | undefined,
  index: label.index as number | undefined,
  instance: label.instance as SyntheticPolyline["instance"],
  keyframe: (label.keyframe as boolean) ?? false,
});

/** The engine's stored detection as the `SyntheticBox` the agents consume. */
export const toSyntheticBox = (label: LabelData): SyntheticBox => ({
  id: label._id,
  _id: label._id,
  label: (label.label as string) ?? "",
  bounding_box: label.bounding_box as [number, number, number, number],
  index: label.index as number | undefined,
  instance: label.instance as SyntheticBox["instance"],
  keyframe: (label.keyframe as boolean) ?? false,
});

/** Narrow the registry's broad agent type by the SAM2 `propagate()` method. */
export const isSam2Agent = (
  agent: AnnotationAgent<PropagationInferenceResult>,
): agent is SAM2PropagationBrowserAgent =>
  typeof (agent as Partial<SAM2PropagationBrowserAgent>).propagate ===
  "function";
