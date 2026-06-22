import { PathType, determinePathType, getBasename } from "./paths";

export const MEDIA_TYPE_IMAGE = "image";
export const MEDIA_TYPE_VIDEO = "video";
export const MEDIA_TYPE_POINT_CLOUD = "point-cloud";
export const MEDIA_TYPE_3D = "3d";
export const MEDIA_TYPE_GROUP = "group";
export const MEDIA_TYPE_MULTIMODAL = "multimodal";

export type NativeMediaType =
  | typeof MEDIA_TYPE_3D
  | typeof MEDIA_TYPE_GROUP
  | typeof MEDIA_TYPE_IMAGE
  | typeof MEDIA_TYPE_POINT_CLOUD
  | typeof MEDIA_TYPE_VIDEO;

export type RecognizedMediaType =
  | NativeMediaType
  | typeof MEDIA_TYPE_MULTIMODAL;

/**
 * Returns true if annotation is supported for the provided media type.
 *
 * @param mediaType media type
 */
export const isAnnotationSupported = (
  mediaType: string | null | undefined
): boolean => {
  return !!mediaType && !["video", "group"].includes(mediaType);
};

const DIRECT_3D_SAMPLE_EXTENSIONS = new Set([
  ".fo3d",
  ".pcd",
  ".ply",
  ".gltf",
  ".glb",
  ".fbx",
  ".stl",
]);

const WRAPPABLE_DIRECT_3D_SAMPLE_EXTENSIONS = new Set([
  ".pcd",
  ".ply",
  ".gltf",
  ".glb",
  ".fbx",
  ".stl",
]);

const FO3D_SAMPLE_EXTENSION = ".fo3d";

const decodePath = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

const getPathCandidates = (path: string) => {
  const candidates = new Set<string>();
  const trimmedPath = path.trim();

  if (!trimmedPath) {
    return [];
  }

  if (determinePathType(trimmedPath) !== PathType.URL) {
    candidates.add(trimmedPath);
  }

  try {
    const parsed = new URL(trimmedPath, "http://localhost");
    candidates.add(decodePath(parsed.pathname));

    const filepathParam = parsed.searchParams.get("filepath");
    if (filepathParam) {
      candidates.add(decodePath(filepathParam));
    }
  } catch {
    // ignore invalid URL parsing and fall back to the original path
  }

  if (!candidates.size) {
    candidates.add(trimmedPath);
  }

  return [...candidates];
};

const stripHashAndQuery = (path: string) => {
  return path.split("#")[0].split("?")[0];
};

const extractExtensionFromPath = (path: string) => {
  const filename = getBasename(stripHashAndQuery(path))?.toLowerCase();

  if (!filename) {
    return null;
  }

  const lastDotIdx = filename.lastIndexOf(".");

  if (lastDotIdx <= 0) {
    return null;
  }

  return filename.slice(lastDotIdx);
};

/**
 * Returns the normalized file extension for a sample path or media URL.
 *
 * Supports raw filepaths as well as direct asset URLs
 */
export const getSamplePathExtension = (
  path: string | null | undefined
): string | null => {
  if (typeof path !== "string") {
    return null;
  }

  for (const candidatePath of getPathCandidates(path)) {
    const extension = extractExtensionFromPath(candidatePath);
    if (extension) {
      return extension;
    }
  }

  return null;
};

/**
 * Returns true when the provided sample path points to a supported direct 3D asset.
 */
export const isDirect3dSamplePath = (
  path: string | null | undefined
): boolean => {
  const extension = getSamplePathExtension(path);
  return extension ? DIRECT_3D_SAMPLE_EXTENSIONS.has(extension) : false;
};

/**
 * Returns true when the provided sample path points to a direct 3D asset that
 * can be wrapped into a synthetic FO3D scene.
 */
export const isWrappableDirect3dSamplePath = (
  path: string | null | undefined
): boolean => {
  const extension = getSamplePathExtension(path);
  return extension
    ? WRAPPABLE_DIRECT_3D_SAMPLE_EXTENSIONS.has(extension)
    : false;
};

/**
 * Returns true when the provided sample path points to a real FO3D scene file.
 */
export const isFo3dSamplePath = (path: string | null | undefined): boolean => {
  return getSamplePathExtension(path) === FO3D_SAMPLE_EXTENSION;
};

/**
 * Returns true if the provided media type is associated with FO3D.
 *
 * @param mediaType media type
 */
export const isFo3d = (mediaType: string): boolean => {
  return ["three_d", "3d"].includes(mediaType);
};

/**
 * Returns true if the provided media type is associated with point clouds.
 *
 * @param mediaType media type
 */
export const isPointCloud = (mediaType: string): boolean => {
  return ["pcd", "point-cloud", "point_cloud"].includes(mediaType);
};

/**
 * Returns true if the provided media type is FO3D or point cloud.
 *
 * @param mediaType media type
 */
export const is3d = (mediaType: string): boolean => {
  return isFo3d(mediaType) || isPointCloud(mediaType);
};

/**
 * Returns true if the provided media type is handled by FiftyOne's built-in
 * renderers.
 */
export const isNativeMediaType = (
  mediaType: string | null | undefined
): mediaType is NativeMediaType => {
  return (
    mediaType == null ||
    mediaType === MEDIA_TYPE_IMAGE ||
    mediaType === MEDIA_TYPE_VIDEO ||
    mediaType === MEDIA_TYPE_GROUP ||
    is3d(mediaType)
  );
};

/**
 * Returns true if the provided media type is multimodal.
 *
 * @param mediaType media type
 */
export const isMultimodal = (mediaType: string | null | undefined): boolean => {
  return mediaType === MEDIA_TYPE_MULTIMODAL;
};

/**
 * Returns true if the dataset has fields outside the Mongo sample
 * collection — i.e. fields the standard ``lightning`` resolver can't
 * see. Always false in OSS; overridden in Enterprise where multimodal
 * datasets carry parquet-backed fields alongside their Mongo doc.
 *
 * Callers use this to disable Query Performance for affected
 * datasets so the sidebar falls back to the standard aggregations
 * path.
 *
 * @param mediaType media type
 */
export const hasNonMongoFields = (
  _mediaType: string | null | undefined
): boolean => {
  return false;
};

/**
 * Returns true if the provided set contains any media types which are
 * associated with FO3D.
 *
 * @param mediaTypes media types
 */
export const setContainsFo3d = (mediaTypes: Set<string>): boolean => {
  return anyMatch(mediaTypes, isFo3d);
};

/**
 * Returns true if the provided set contains any media types which are
 * associated with point clouds.
 *
 * @param mediaTypes media types
 */
export const setContainsPointCloud = (mediaTypes: Set<string>): boolean => {
  return anyMatch(mediaTypes, isPointCloud);
};

/**
 * Returns true if the provided set contains any media types which are
 * associated with FO3D or point clouds.
 *
 * @param mediaTypes media types
 */
export const setContains3d = (mediaTypes: Set<string>): boolean => {
  return setContainsFo3d(mediaTypes) || setContainsPointCloud(mediaTypes);
};

/**
 * Returns true if the provided predicate is true for any element in the set.
 *
 * @param set set of values
 * @param predicate function to evaluate truthiness
 */
const anyMatch = <T>(
  set: Set<T>,
  predicate: (element: T) => boolean
): boolean => {
  return [...set].some(predicate);
};
