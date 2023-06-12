import {
  CLASSIFICATIONS_FIELD,
  CLASSIFICATION_FIELD,
  DETECTIONS_FIELD,
  DETECTION_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD_V2,
  FRAME_SUPPORT_FIELD,
  Field,
  GEO_LOCATIONS_FIELD,
  GEO_LOCATION_FIELD,
  HEATMAP_FIELD,
  KEYPOINT_FILED,
  LIST_FIELD,
  POLYLINES_FIELD,
  POLYLINE_FIELD,
  REGRESSION_FILED,
  RESERVED_FIELD_KEYS,
  SEGMENTATION_FIELD,
  TEMPORAL_DETECTION_FIELD,
  VALID_LABEL_TYPES,
  VECTOR_FIELD,
} from "@fiftyone/utilities";
import { FRAME_NUMBER_FIELD, OBJECT_ID_FIELD } from "@fiftyone/utilities";

export const disabledField = (
  path: string,
  combinedSchema: Record<string, Field>,
  groupField?: string
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
    DYNAMIC_EMBEDDED_DOCUMENT_FIELD_V2,
  ].includes(embeddedDocType);

  return (
    [
      OBJECT_ID_FIELD,
      FRAME_NUMBER_FIELD,
      FRAME_SUPPORT_FIELD,
      VECTOR_FIELD,
    ].includes(ftype) ||
    [path, parentPath].includes(groupField) ||
    RESERVED_FIELD_KEYS.includes(path) ||
    path.startsWith("metadata") ||
    ([
      TEMPORAL_DETECTION_FIELD,
      DETECTION_FIELD,
      DETECTIONS_FIELD,
      CLASSIFICATION_FIELD,
      CLASSIFICATIONS_FIELD,
      KEYPOINT_FILED,
      REGRESSION_FILED,
      HEATMAP_FIELD,
      SEGMENTATION_FIELD,
      GEO_LOCATIONS_FIELD,
      GEO_LOCATION_FIELD,
      POLYLINE_FIELD,
      POLYLINES_FIELD,
    ].includes(parentEmbeddedDocType) &&
      [
        "id",
        "tags",
        "label",
        "bounding_box",
        "mask",
        "confidence",
        "index",
        "points",
        "closed",
        "filled",
        "logits",
        "mask_path",
        "map",
        "map_path",
        "Range",
        "Confidence",
        "support",
        "point",
        "line",
        "Polygon",
        "points",
        "polygons",
      ].includes(pathSplit[pathSplit.length - 1])) ||
    [
      TEMPORAL_DETECTION_FIELD,
      DETECTION_FIELD,
      DETECTIONS_FIELD,
      CLASSIFICATION_FIELD,
      CLASSIFICATIONS_FIELD,
      KEYPOINT_FILED,
      REGRESSION_FILED,
      HEATMAP_FIELD,
      SEGMENTATION_FIELD,
      GEO_LOCATIONS_FIELD,
      GEO_LOCATION_FIELD,
      POLYLINE_FIELD,
      POLYLINES_FIELD,
    ].includes(ftype) ||
    (parentPath &&
      parentPath !== path &&
      ftype === LIST_FIELD &&
      (hasDynamicEmbeddedDocument ||
        VALID_LABEL_TYPES.includes(
          embeddedDocType?.includes(".")
            ? embeddedDocTypeSplit[embeddedDocTypeSplit.length - 1]
            : embeddedDocType
        )))
  );
};
