import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "@fiftyone/looker-3d";
import type { LabelData } from "@fiftyone/utilities";

/**
 * Attributes used purely for internal 3D annotation functionality. They must
 * not be persisted to the sample and are stripped before writing into
 * {@link Sample}. Mirrors the legacy reserved set from the 3D delta supplier.
 */
const reservedAttributes = [
  "color",
  "id",
  "isNew",
  "path",
  "selected",
  "sampleId",
  "type",
] as const;

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

  const data = { ...label } as Record<string, unknown>;
  for (const key of reservedAttributes) {
    delete data[key];
  }

  return data as unknown as LabelData;
};
