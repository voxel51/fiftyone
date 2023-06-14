import {
  CLASSIFICATIONS_FIELD,
  CLASSIFICATION_FIELD,
  DETECTIONS_FIELD,
  DETECTION_FIELD,
  DISABLED_FIELDS_VISIBILITY,
  DISABLED_FIELD_TYPES,
  DISABLED_LABEL_FIELDS_VISIBILITY,
  DISABLED_PATHS,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_PATH,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  Field,
  GEO_LOCATIONS_FIELD,
  GEO_LOCATION_FIELD,
  HEATMAP_FIELD,
  KEYPOINT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  POLYLINES_FIELD,
  POLYLINE_FIELD,
  REGRESSION_FIELD,
  RESERVED_FIELD_KEYS,
  SEGMENTATION_FIELD,
  TEMPORAL_DETECTION_FIELD,
  VALID_LABEL_TYPES,
  VECTOR_FIELD,
} from "@fiftyone/utilities";

export const isMetadataField = (path: string) => {
  return path === "metadata" || path.startsWith("metadata.");
};

export const disabledField = (
  path: string,
  combinedSchema: Record<string, Field>,
  groupField?: string,
  isFrameView?: boolean
): boolean => {
  const currField = combinedSchema?.[path] || ({} as Field);
  const { ftype, embeddedDocType } = currField;
  const parentPath = path.substring(0, path.lastIndexOf("."));
  const parentField = combinedSchema?.[parentPath];
  const parentEmbeddedDocType = parentField?.embeddedDocType;
  const pathSplit = path.split(".");
  const embeddedDocTypeSplit = embeddedDocType?.split(".");
  const hasDynamicEmbeddedDocument = [
    DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
    DYNAMIC_EMBEDDED_DOCUMENT_PATH,
  ].includes(embeddedDocType);

  return (
    DISABLED_PATHS.includes(path) ||
    DISABLED_FIELD_TYPES.includes(ftype) ||
    [path, parentPath || path].includes(groupField) ||
    (isFrameView && path === "frame_number") ||
    isMetadataField(path) ||
    DISABLED_LABEL_FIELDS_VISIBILITY.includes(ftype)
  );
  // ([
  //   TEMPORAL_DETECTION_FIELD,
  //   DETECTION_FIELD,
  //   DETECTIONS_FIELD,
  //   CLASSIFICATION_FIELD,
  //   CLASSIFICATIONS_FIELD,
  //   KEYPOINT_FIELD,
  //   REGRESSION_FIELD,
  //   HEATMAP_FIELD,
  //   SEGMENTATION_FIELD,
  //   GEO_LOCATIONS_FIELD,
  //   GEO_LOCATION_FIELD,
  //   POLYLINE_FIELD,
  //   POLYLINES_FIELD,
  // ].includes(parentEmbeddedDocType) &&
  // [
  //   "tags",
  //   "label",
  //   "bounding_box",
  //   "mask",
  //   "confidence",
  //   "index",
  //   "points",
  //   "closed",
  //   "filled",
  //   "logits",
  //   "mask_path",
  //   "map",
  //   "map_path",
  //   "Range",
  //   "Confidence",
  //   "support",
  //   "point",
  //   "line",
  //   "Polygon",
  //   "points",
  //   "polygons",
  // ].includes(pathSplit[pathSplit.length - 1]) ||
  // (parentPath &&
  //   parentPath !== path &&
  //   ftype === LIST_FIELD &&
  //   (hasDynamicEmbeddedDocument ||
  //     VALID_LABEL_TYPES.includes(
  //       embeddedDocType?.includes(".")
  //         ? embeddedDocTypeSplit[embeddedDocTypeSplit.length - 1]
  //         : embeddedDocType
  //     )))
};
