import { DETECTION_FILED, SKIP_FIELD_TYPES } from "@fiftyone/utilities";
import { JUST_FIELD } from "@fiftyone/utilities";
import {
  CLASSIFICATION_DISABLED_SUB_PATHS,
  CLASSIFICATION_FIELD,
  DETECTION_DISABLED_SUB_PATHS,
  DETECTION_FIELD,
  DISABLED_FIELD_TYPES,
  DISABLED_LABEL_FIELDS_VISIBILITY,
  DISABLED_PATHS,
  Field,
  GEOLOCATIONS_DISABLED_SUB_PATHS,
  GEOLOCATION_DISABLED_SUB_PATHS,
  GEO_LOCATIONS_FIELD,
  GEO_LOCATION_FIELD,
  HEATMAP_DISABLED_SUB_PATHS,
  HEATMAP_FIELD,
  KEYPOINT_DISABLED_SUB_PATHS,
  KEYPOINT_FIELD,
  POLYLINE_DISABLED_SUB_PATHS,
  POLYLINE_FIELD,
  REGRESSION_DISABLED_SUB_PATHS,
  REGRESSION_FIELD,
  SEGMENTATION_DISABLED_SUB_PATHS,
  SEGMENTATION_FIELD,
  TEMPORAL_DETECTION_DISABLED_SUB_PATHS,
  TEMPORAL_DETECTION_FIELD,
} from "@fiftyone/utilities";

const isMetadataField = (path: string) => {
  return path === "metadata" || path.startsWith("metadata.");
};

export const skipField = (path: string, schema: {}) => {
  if (!path) {
    throw new Error("skipField requires a path argument");
  }

  const currentField = schema?.[path] || schema?.[path.replace("frames.", "")];
  if (!currentField) {
    return true;
  }

  const ftype = currentField.ftype;
  const parentPath = path.substring(0, path.lastIndexOf("."));
  const pathSplit = path.split(".");
  const pathLabel = `.${pathSplit[pathSplit.length - 1]}`;

  return (
    SKIP_FIELD_TYPES.includes(ftype) ||
    (parentPath &&
      schema[parentPath]?.embeddedDocType === DETECTION_FILED &&
      [".bounding_box", ".index"].includes(pathLabel))
  );
};

export const disabledField = (
  path: string,
  combinedSchema: Record<string, Field>,
  groupField?: string,
  isFrameView?: boolean
): boolean => {
  const currField = combinedSchema?.[path] || ({} as Field);
  const { ftype } = currField;
  const parentPath = path.substring(0, path.lastIndexOf("."));
  const parentField = combinedSchema?.[parentPath];
  const parentFType = parentField?.ftype;
  const pathSplit = path.split(".");

  const shortPath = pathSplit[pathSplit.length - 1];

  // ex: 'id' and 'filepath' are always disabled
  if (DISABLED_PATHS.includes(path)) {
    return true;
  }

  // ex: ObjectIdType and VectorType are always disabled
  if (DISABLED_FIELD_TYPES.includes(ftype)) {
    return true;
  }

  // ex: in a dataset with 'dataset.group_field="group"'
  //  field 'group' (and children) will be disabled.
  if ([path, parentPath || path].includes(groupField)) {
    return true;
  }

  if (isFrameView && path === "frame_number") {
    return true;
  }

  // metadata and all its children are disabled
  if (isMetadataField(path)) {
    return true;
  }

  // All label
  if (DISABLED_LABEL_FIELDS_VISIBILITY.includes(ftype)) {
    return true;
  }

  // field Detection has reserved subpaths. ex: tags, id, mask
  if (
    parentFType === DETECTION_FIELD &&
    DETECTION_DISABLED_SUB_PATHS.includes(pathSplit[pathSplit.length - 1])
  ) {
    return true;
  }

  // field Polyline has reserved subpaths. ex: "points", "closed", "filled",
  if (
    parentFType === POLYLINE_FIELD &&
    POLYLINE_DISABLED_SUB_PATHS.includes(shortPath)
  ) {
    return true;
  }

  // field Classification has reserved subpaths. ex: "logits"
  if (
    parentFType === CLASSIFICATION_FIELD &&
    CLASSIFICATION_DISABLED_SUB_PATHS.includes(shortPath)
  ) {
    return true;
  }

  // field Regression has reserved subpaths. ex: "value", "id"
  if (
    parentFType === REGRESSION_FIELD &&
    REGRESSION_DISABLED_SUB_PATHS.includes(shortPath)
  ) {
    return true;
  }

  // field Keypoint has reserved subpaths. ex: "point", "index"
  if (
    parentFType === KEYPOINT_FIELD &&
    KEYPOINT_DISABLED_SUB_PATHS.includes(shortPath)
  ) {
    return true;
  }

  // field Segmentation has reserved subpaths. ex: "mask", "mask_path"
  if (
    parentFType === SEGMENTATION_FIELD &&
    SEGMENTATION_DISABLED_SUB_PATHS.includes(shortPath)
  ) {
    return true;
  }

  // field Heatmap has reserved subpaths. ex: "map_path", "Range"
  if (
    parentFType === HEATMAP_FIELD &&
    HEATMAP_DISABLED_SUB_PATHS.includes(shortPath)
  ) {
    return true;
  }

  // field TemporalDetection has reserved subpaths. ex: "support", "tags"
  if (
    parentFType === TEMPORAL_DETECTION_FIELD &&
    TEMPORAL_DETECTION_DISABLED_SUB_PATHS.includes(shortPath)
  ) {
    return true;
  }

  // field Geolocation has reserved subpaths. ex: "polygon", "line", "point"
  if (
    parentFType === GEO_LOCATION_FIELD &&
    GEOLOCATION_DISABLED_SUB_PATHS.includes(shortPath)
  ) {
    return true;
  }

  // field Geolocations has reserved subpaths. ex: "polygons", "line", "point"
  if (
    parentFType === GEO_LOCATIONS_FIELD &&
    GEOLOCATIONS_DISABLED_SUB_PATHS.includes(shortPath)
  ) {
    return true;
  }

  return false;
};
