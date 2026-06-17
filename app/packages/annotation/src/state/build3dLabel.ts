import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "@fiftyone/looker-3d";
import type { LabelData } from "@fiftyone/utilities";

/**
 * Attributes used purely for internal annotation/UI functionality. They are
 * never persistable label-data fields (color/selection are view state; `type`
 * and `isNew` are sidebar bookkeeping; `path`/`sampleId` are addressing the ref
 * already carries; `id` is the legacy alias of `_id`). Stripped before writing
 * into {@link Sample}. Mirrors the legacy reserved set from the 3D delta
 * supplier.
 */
export const reservedLabelAttributes = [
  "color",
  "id",
  "isNew",
  "path",
  "selected",
  "sampleId",
  "type",
] as const;

/**
 * Drop the {@link reservedLabelAttributes} from a label-data partial — the
 * sanitizer for any path that commits a working/overlay-shaped label into the
 * engine or {@link Sample}.
 */
export const stripReservedLabelAttributes = <T extends Record<string, unknown>>(
  data: T
): T => {
  const out = { ...data };
  for (const key of reservedLabelAttributes) {
    delete out[key];
  }
  return out;
};

/**
 * Derive the persistable label document from a reconciled 3D label, shaped for
 * {@link Sample.updateLabel}.
 *
 * Internal-only attributes are stripped. Labels without a `label` value are
 * still persisted (matching the legacy `buildAnnotationLabel` after it dropped
 * its `requireLabel` gate).
 *
 * @param label Reconciled 3D detection or polyline
 */
export const build3dLabel = (
  label: ReconciledDetection3D | ReconciledPolyline3D
): LabelData | undefined => {
  if (label._cls !== "Detection" && label._cls !== "Polyline") {
    return undefined;
  }

  return stripReservedLabelAttributes(
    label as unknown as Record<string, unknown>
  ) as unknown as LabelData;
};
