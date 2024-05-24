export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface BoundingBox3D {
  dimensions: Vec3;
  location: Vec3;
  rotation: Vec3; // rotation angles in radians
}

export interface BoundingBox2D {
  tlx: number; // top-left corner of the bounding box, x
  tly: number; // top-left corner of the bounding box, y
  width: number; // width of the bounding box
  height: number; // height of the bounding box
}

export const rotatePoint = (point: Vec3, rotation: Vec3): Vec3 => {
  // https://en.wikipedia.org/wiki/Rotation_matrix

  const [x, y, z] = point;
  const [rx, ry, rz] = rotation;

  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);

  // rotation around X axis
  const y1 = cosX * y - sinX * z;
  const z1 = sinX * y + cosX * z;

  // rotation around Y axis
  const x2 = cosY * x + sinY * z1;
  const z2 = cosY * z1 - sinY * x;

  // rotation around Z axis
  const xRotated = cosZ * x2 - sinZ * y1;
  const yRotated = sinZ * x2 + cosZ * y1;
  const zRotated = z2;

  return [xRotated, yRotated, zRotated];
};

export const projectTo2D = (point: Vec3, plane: "xz" | "xy" | "yz"): Vec2 => {
  switch (plane) {
    case "xz":
      return [point[0], point[2]];
    case "xy":
      return [point[0], point[1]];
    case "yz":
      return [point[1], point[2]];
  }
};

export const getBoundingBox2D = (
  box: BoundingBox3D,
  plane: "xz" | "xy" | "yz"
) => {
  const { dimensions, location, rotation } = box;
  const [dx, dy, dz] = dimensions;
  const halfDimensions = [dx / 2, dy / 2, dz / 2] as Vec3;

  // Generate the 8 corners of the 3D bounding box
  const corners: Vec3[] = [
    // left bottom back
    [-halfDimensions[0], -halfDimensions[1], -halfDimensions[2]],
    // left bottom front
    [-halfDimensions[0], -halfDimensions[1], halfDimensions[2]],
    // left top back
    [-halfDimensions[0], halfDimensions[1], -halfDimensions[2]],
    // left top front
    [-halfDimensions[0], halfDimensions[1], halfDimensions[2]],
    // right bottom back
    [halfDimensions[0], -halfDimensions[1], -halfDimensions[2]],
    // right bottom front
    [halfDimensions[0], -halfDimensions[1], halfDimensions[2]],
    // right top back
    [halfDimensions[0], halfDimensions[1], -halfDimensions[2]],
    // right top front
    [halfDimensions[0], halfDimensions[1], halfDimensions[2]],
  ];

  // rotate first, and translate
  const transformedCorners = corners.map((corner) => {
    const newRotation = rotation;

    const rotated = rotatePoint(corner, newRotation);
    return [
      rotated[0] + location[0],
      rotated[1] + location[1],
      rotated[2] + location[2],
    ] as Vec3;
  });

  // project the 3D points to 2D based on the specified plane
  const projectedCorners: Vec2[] = transformedCorners.map((corner) =>
    projectTo2D(corner, plane)
  );

  return { projectedCorners };
};
