import { MediaType } from "@fiftyone/relay";
import {
  CLASSIFICATION_DISABLED_SUB_PATHS,
  CLASSIFICATION_FIELD,
  DETECTIONS_FIELD,
  DETECTION_DISABLED_SUB_PATHS,
  DETECTION_FIELD,
  DISABLED_LABEL_FIELDS_VISIBILITY,
  DISABLED_PATHS,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  Field,
  GEOLOCATIONS_DISABLED_SUB_PATHS,
  GEOLOCATION_DISABLED_SUB_PATHS,
  GEO_LOCATIONS_FIELD,
  GEO_LOCATION_FIELD,
  HEATMAP_DISABLED_SUB_PATHS,
  HEATMAP_FIELD,
  KEYPOINT_DISABLED_SUB_PATHS,
  KEYPOINT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  POLYLINE_DISABLED_SUB_PATHS,
  POLYLINE_FIELD,
  REGRESSION_DISABLED_SUB_PATHS,
  REGRESSION_FIELD,
  SEGMENTATION_DISABLED_SUB_PATHS,
  SEGMENTATION_FIELD,
  SKIP_FIELD_TYPES,
  TEMPORAL_DETECTION_DISABLED_SUB_PATHS,
  TEMPORAL_DETECTION_FIELD,
  VALID_LABEL_TYPES,
} from "@fiftyone/utilities";

const isMetadataField = (path: string) => {
  return path === "metadata" || path.startsWith("metadata.");
};

/**
 * @param path
 * @param mediaType
 * @param frameSchema
 * @returns a new path prefixed with 'frames.' if the mediaType is 'video'
 *  else returns the original path.
 */
export const getPath = (
  path: string,
  mediaType: MediaType,
  frameSchema?: { [key: string]: Field }
) => {
  if (mediaType === "video") {
    if (!frameSchema?.[path]) {
      return path;
    }
    return `frames.${path}`;
  }
  return path;
};

export interface DatasetSchema {
  [key: string]: Field;
}

/**
 * @param path
 * @param schema
 * @param frameSchema
 * @param mediaType
 * @returns a list of full field paths and subpaths.
 */
export const getSubPaths = (
  path: string,
  schema: DatasetSchema,
  mediaType: MediaType,
  frameSchema?: DatasetSchema
) => {
  if (!path) {
    throw new Error("path is required");
  }

  if (!schema) {
    throw new Error("schema is required");
  }

  if (!mediaType) {
    throw new Error("mediaType is required");
  }

  const subPaths = new Set<string>();
  const thisPath = getPath(path, mediaType, frameSchema);
  subPaths.add(thisPath);

  Object.keys(schema).forEach((currPath: string) => {
    if (currPath.startsWith(path + ".") && !skipField(currPath, schema)) {
      subPaths.add(getPath(currPath, mediaType, frameSchema));
    }
  });

  return subPaths;
};

export const skipField = (rawPath: string, schema: {}) => {
  if (!rawPath) {
    throw new Error("path argument is required");
  }

  // we remove 'frames.' prefix for processing
  const path = rawPath.replace("frames.", "");

  const currentField = schema?.[path];
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
      [DETECTION_FIELD, DETECTIONS_FIELD].includes(
        schema[parentPath]?.embeddedDocType
      ) &&
      [".bounding_box", ".index"].includes(pathLabel))
  );
};

export const disabledField = (
  path: string,
  combinedSchema: Record<string, Field>,
  groupField?: string,
  isFrameView?: boolean,
  isClipsView?: boolean,
  isVideo?: boolean,
  isPatchesView?: boolean
): boolean => {
  const currField = combinedSchema[path] || ({} as Field);
  const { ftype, embeddedDocType } = currField;
  const parentPath = path.substring(0, path.lastIndexOf("."));
  const parentField = combinedSchema[parentPath];
  const parentFType = parentField?.ftype;
  const pathSplit = path.split(".");
  const shortPath = pathSplit[pathSplit.length - 1];
  const isTopLevelField =
    pathSplit.length === 1 ||
    (pathSplit.length === 1 && pathSplit[0] === "frames");

  // ex: 'id' and 'filepath' are always disabled
  if (DISABLED_PATHS.includes(path)) {
    return true;
  }

  if (
    (isPatchesView || isFrameView || isClipsView) &&
    ["sample_id", "frames.sample_id"].includes(path)
  ) {
    return true;
  }

  if ("frames.id" === path && ftype === OBJECT_ID_FIELD) {
    return true;
  }

  if ("frames.frame_number" === path && ftype === FRAME_NUMBER_FIELD) {
    return true;
  }

  // Clip view's top level field(s) with frameSupport type is disabled
  if (isClipsView && ftype === FRAME_SUPPORT_FIELD && isTopLevelField) {
    return true;
  }

  // ex: in a dataset with 'dataset.group_field="group"'
  //  field 'group' (and children) will be disabled.
  if ([path, parentPath || path].includes(groupField)) {
    return true;
  }

  if ((isFrameView || isVideo) && path === "frame_number") {
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

  // list of any valid labels
  if (embeddedDocType && ftype === LIST_FIELD) {
    const embeddedRoot = embeddedDocType?.substring(
      embeddedDocType.lastIndexOf(".") + 1,
      embeddedDocType.length
    );
    if (VALID_LABEL_TYPES.includes(embeddedRoot)) {
      return true;
    }
  }

  return false;
};
