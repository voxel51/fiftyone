/**
 * Checks whether a bounding box has finite bounds with a positive width and height.
 *
 * @param boundingBox Bounding box in the form [x, y, width, height]
 */
export const hasValidBounds = (
  boundingBox: [number, number, number, number]
): boolean => {
  return (
    boundingBox.every((num) => Number.isFinite(num)) &&
    // width
    boundingBox[2] > 0 &&
    // height
    boundingBox[3] > 0
  );
};
