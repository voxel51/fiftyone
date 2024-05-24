import { Euler, Vector3 } from "three";

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
  const threePoint = new Vector3(...point);
  const threeRotation = new Euler(...rotation);

  return threePoint.applyEuler(threeRotation).toArray() as Vec3;
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

export const getProjectedCorners = (
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
