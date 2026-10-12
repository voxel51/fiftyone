/**
 * Field-access rows for the attribute list: "shape" (the drawn
 * geometry) and "label" (the class input). They sit above the
 * attributes in the Active section and carry a read-only toggle, but
 * can never be hidden while the annotation itself is visible. Stored
 * on the field's content as the ``bbox`` / ``label`` keys
 * (``editable`` / ``read_only``). Custom schemas only: the dataset
 * default has no per-field access policy.
 */

import type { FieldSchema } from "../../useSchemaManager";

export type AccessKnob = "bbox" | "label";

export const KNOB_LABELS: Record<AccessKnob, { title: string; hint: string }> =
  {
    bbox: {
      title: "shape",
      hint: "The drawn geometry (box, polyline, points)",
    },
    label: { title: "label", hint: "The class input" },
  };

const SPATIAL_TYPES = new Set([
  "detection",
  "detections",
  "polyline",
  "polylines",
  "keypoint",
  "keypoints",
  "segmentation",
]);

/** Which access rows apply to a field's schema (by type/classes). */
export const accessKnobsFor = (
  config: FieldSchema | undefined,
): AccessKnob[] => {
  const type = String(config?.type ?? "").toLowerCase();
  const isSpatial = SPATIAL_TYPES.has(type);
  const hasClasses = (config?.classes?.length ?? 0) > 0;
  const out: AccessKnob[] = [];
  if (isSpatial) out.push("bbox");
  if (hasClasses || type === "classification" || isSpatial) out.push("label");
  return out;
};

/** Whether a knob is read-only on the field's content. */
export const knobIsReadOnly = (
  config: FieldSchema | undefined,
  knob: AccessKnob,
): boolean =>
  (config as Record<string, unknown> | undefined)?.[knob] === "read_only";
