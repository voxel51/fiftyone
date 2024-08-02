import { Euler, Vector3 } from "three";
import monotoneConvexHull2d from "monotone-convex-hull-2d";

export type Detection3D = {
  location: Vec3;
  dimensions: Vec3;
  rotation?: Vec3;
  convexHull?: Vec2[];
};

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export enum ProjectionPlane {
  XY = "xy",
  XZ = "xz",
  YZ = "yz",
}
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

export const getLocalBoundingBoxCorners3D = (box: BoundingBox3D): Vec3[] => {
  const { dimensions } = box;
  const [dx, dy, dz] = dimensions;
  const halfDimensions = [dx / 2, dy / 2, dz / 2] as Vec3;

  // Generate the 8 corners of the 3D bounding box
  return [
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
};

export const translatePoint = (point: Vec3, translation: Vec3): Vec3 => {
  return [
    point[0] + translation[0],
    point[1] + translation[1],
    point[2] + translation[2],
  ] as Vec3;
};

export const getGlobalPointsForCube = (
  origin: Vec3,
  corners: Vec3[],
  rotation: Vec3
): Vec3[] => {
  return corners.map((corner) => {
    const newRotation = rotation;
    // rotate first
    const rotated = rotatePoint(corner, newRotation);
    // then translate
    return translatePoint(rotated, origin);
  });
};

export const getCubeCorners = (box: BoundingBox3D) => {
  const localCorners = getLocalBoundingBoxCorners3D(box);
  const { location, rotation } = box;
  return getGlobalPointsForCube(location, localCorners, rotation);
};

export const getProjectionPlaneForNormal = (normal: Vec3): ProjectionPlane => {
  const [nx, ny, nz] = normal ?? [0, 0, 1];

  if (nx === 1 || nx === -1) {
    // project on yz plane
    return ProjectionPlane.YZ;
  } else if (ny === 1 || ny === -1) {
    // project on xz plane
    return ProjectionPlane.XZ;
  } else if (nz === 1 || nz === -1) {
    // project on xy plane
    return ProjectionPlane.XY;
  }

  return ProjectionPlane.XY;
};

export const convertDetectionToBbox3D = (label: Detection3D): BoundingBox3D => {
  const [lx, ly, lz] = label.location; // centroid of bounding box
  const [dx, dy, dz] = label.dimensions; // length of bounding box in each dimension
  const [rx, ry, rz] = label.rotation ?? [0, 0, 0]; // rotation of bounding box

  return {
    dimensions: [dx, dy, dz],
    location: [lx, ly, lz],
    rotation: [rx, ry, rz],
  } as BoundingBox3D;
};

const normalizeCanvasCoordinates = (
  points: Vec3[],
  projectionPlane: ProjectionPlane
): Vec2[] => {
  return points.map((point) => {
    const [x, y, z] = point;
    switch (projectionPlane) {
      case "xy":
        return [x, 1 - y] as Vec2;
      case "xz":
        return [x, 1 - z] as Vec2;
      case "yz":
        return [y, 1 - z] as Vec2;
    }
    throw new Error("Invalid projection plane");
  });
};

export const calculateBoundingBoxProjectionAndConvexHull = (
  orthographicProjectionParams: {
    min_bound: Vec3;
    max_bound: Vec3;
    normal: Vec3;
    height: number;
    width: number;
  },
  label: {
    location: Vec3;
    dimensions: Vec3;
    rotation?: Vec3;
    convexHull?: Vec2[];
  }
): Vec2[] => {
  // get normalized 0,1 points in global 3d space
  const { min_bound, max_bound, normal } = orthographicProjectionParams;
  const bbox3d = convertDetectionToBbox3D(label);
  const projectionPlane = getProjectionPlaneForNormal(normal);
  const cubeCorners = getCubeCorners(bbox3d);
  const normalizedCubeCorners = cubeCorners.map((corner) =>
    normalizePointInBounds3D(min_bound, max_bound, corner)
  );

  // convert to canvas style xy 0,1 points (y=1 = bottom, y=0 = top, x=0 = left, x=1 = right)
  const normalizedCanvasPoints = normalizeCanvasCoordinates(
    normalizedCubeCorners,
    projectionPlane
  );

  return computeConvexHullForCanvasPoints(normalizedCanvasPoints);
};

export const normalizePointInBounds3D = (
  min_bound: Vec3,
  max_bound: Vec3,
  point: Vec3
): Vec3 => {
  const [x, y, z] = point;
  const [xmin, ymin, zmin] = min_bound;
  const [xmax, ymax, zmax] = max_bound;

  const px = remap(x, xmin, xmax, 0, 1);
  const py = remap(y, ymin, ymax, 0, 1);
  const pz = remap(z, zmin, zmax, 0, 1);

  console.log({ z, zmin, zmax, pz });

  return [px, py, pz] as Vec3;
};

export const computeConvexHullForCanvasPoints = (corners: Vec2[]): Vec2[] => {
  const convexHullIndices = monotoneConvexHull2d(corners);
  return convexHullIndices.map((i) => corners[i]);
};

export const remap = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number => {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
};
