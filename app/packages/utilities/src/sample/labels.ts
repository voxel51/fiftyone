/**
 * Label-type taxonomy for the {@link Sample} model: the supported fiftyone
 * label types, their list-vs-single classification, and the mapping to/from
 * embedded-document type strings.
 */

export enum LabelType {
  Classification = "Classification",
  Classifications = "Classifications",
  Detection = "Detection",
  Detections = "Detections",
  Keypoint = "Keypoint",
  Keypoints = "Keypoints",
  Polyline = "Polyline",
  Polylines = "Polylines",
  Segmentation = "Segmentation",
  Heatmap = "Heatmap",
  Regression = "Regression",
  TemporalDetection = "TemporalDetection",
  TemporalDetections = "TemporalDetections",
  Unknown = "Unknown",
}

/**
 * Single-document label types whose per-frame value is addressed by its FIELD:
 * a field holds at most one per frame, so the field path is its whole
 * identity, with no per-element id to address by and no list child to persist
 * through. Must match the server's `_SINGLETON_LABEL_TYPES`.
 *
 * Detection, Polyline and Keypoint are single documents too, but their frames
 * belong to instance tracks, so they are not singletons.
 */
export const SINGLETON_LABEL_TYPES: ReadonlySet<LabelType> = new Set([
  LabelType.Classification,
  LabelType.Heatmap,
  LabelType.Regression,
  LabelType.Segmentation,
]);

/** True if the given label type is a single-document label (e.g. Segmentation). */
export const isSingletonLabelType = (type: LabelType): boolean =>
  SINGLETON_LABEL_TYPES.has(type);

/**
 * Minimal shape of a fiftyone label document.
 */
export type LabelData = {
  _id: string;
  _cls?: string;
  [key: string]: unknown;
};

/**
 * For list-label types, the parent field's child key holding the element array
 * (e.g. a `Detections` field stores its elements under `detections`).
 */
export const LIST_LABEL_CHILD: Partial<Record<LabelType, string>> = {
  [LabelType.Classifications]: "classifications",
  [LabelType.Detections]: "detections",
  [LabelType.Keypoints]: "keypoints",
  [LabelType.Polylines]: "polylines",
  [LabelType.TemporalDetections]: "detections",
};

/**
 * For single-label types, the SOURCE sample's list child when the field was
 * flattened by a generated (patches) view — a `Detection` patch comes from a
 * source `Detections` field whose elements live under `detections`. Used to
 * address the source list when persisting generated-view edits.
 */
export const GENERATED_SOURCE_LIST_CHILD: Partial<Record<LabelType, string>> = {
  [LabelType.Classification]: "classifications",
  [LabelType.Detection]: "detections",
  [LabelType.Keypoint]: "keypoints",
  [LabelType.Polyline]: "polylines",
  [LabelType.TemporalDetection]: "detections",
};

const EMBEDDED_DOC_TYPE_TO_LABEL_TYPE: Record<string, LabelType> =
  Object.fromEntries(
    (Object.values(LabelType) as LabelType[])
      .filter((t) => t !== LabelType.Unknown)
      .map((t) => [`fiftyone.core.labels.${t}`, t]),
  );

/** True if the given label type is a list label (e.g. Detections). */
export const isListLabelType = (type: LabelType): boolean =>
  type in LIST_LABEL_CHILD;

/** Resolve a label type from an embedded-document type string. */
export const embeddedDocTypeToLabelType = (
  embeddedDocType: string | null | undefined,
): LabelType => {
  if (!embeddedDocType) {
    return LabelType.Unknown;
  }

  return EMBEDDED_DOC_TYPE_TO_LABEL_TYPE[embeddedDocType] ?? LabelType.Unknown;
};
