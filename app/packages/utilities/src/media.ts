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
  return ["point-cloud", "point_cloud"].includes(mediaType);
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
const anyMatch = (
  set: Set<any>,
  predicate: (element: any) => boolean
): boolean => {
  return [...set].findIndex((e) => predicate(e)) >= 0;
};
