export const getTransformedCoordinates = (
  location,
  dimensions,
  scalingFactors,
  orthographicProjectionParams,
  { round = true }
) => {
  // location of centroid of box
  const [x, y] = location;

  const [lx, ly] = dimensions;

  const [_, __, xminCartesian, xmaxCartesian, yminCartesian, ymaxCartesian] =
    orthographicProjectionParams;

  const canvasXMin =
    scalingFactors.xScale * (x - lx / 2 + (xmaxCartesian - xminCartesian) / 2);
  const canvasYMin =
    scalingFactors.yScale * (y - ly / 2 + (ymaxCartesian - yminCartesian) / 2);

  const canvasXMax =
    scalingFactors.xScale * (x + lx / 2 + (xmaxCartesian - xminCartesian) / 2);
  const canvasYMax =
    scalingFactors.yScale * (y + ly / 2 + (ymaxCartesian - yminCartesian) / 2);

  if (round) {
    return [
      Math.round(canvasXMin),
      Math.round(canvasXMax),
      Math.round(canvasYMin),
      Math.round(canvasYMax),
    ];
  }

  return [canvasXMin, canvasXMax, canvasYMin, canvasYMax];
};

export const applyRotation = (x, y, z, rotX, rotY, rotZ) => {
  const cosx = Math.cos(rotX);
  const cosy = Math.cos(rotY);
  const cosz = Math.cos(rotZ);
  const sinx = Math.sin(rotX);
  const siny = Math.sin(rotY);
  const sinz = Math.sin(rotZ);

  // Apply rotation in x-axis
  const y1 = y * cosx - z * sinx;
  const z1 = y * sinx + z * cosx;

  // Apply rotation in y-axis
  const x2 = x * cosy - z1 * siny;
  const z2 = x * siny + z1 * cosy;

  // Apply rotation in z-axis
  const x3 = x2 * cosz - y1 * sinz;
  const y3 = x2 * sinz + y1 * cosz;

  return [x3, y3, z2];
};
