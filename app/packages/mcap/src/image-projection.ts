import * as THREE from "three";
import type {
  Image2dOverlayPoint,
  Image2dOverlayPrimitive,
  Scene3dFrame,
  Scene3dPrimitive,
} from "./archetypes";
import type { DecodedFoxgloveCameraCalibration } from "./foxglove-camera-calibration-decoder";

function getProjectionMatrix(calibration: DecodedFoxgloveCameraCalibration) {
  if (calibration.p.length >= 12 && calibration.p[0] !== 0) {
    return calibration.p.slice(0, 12);
  }

  if (calibration.k.length >= 9 && calibration.k[0] !== 0) {
    return [
      calibration.k[0],
      calibration.k[1],
      calibration.k[2],
      0,
      calibration.k[3],
      calibration.k[4],
      calibration.k[5],
      0,
      calibration.k[6],
      calibration.k[7],
      calibration.k[8],
      0,
    ];
  }

  return null;
}

function projectPoint(
  point: [number, number, number],
  projectionMatrix: number[]
): Image2dOverlayPoint | null {
  const [x, y, z] = point;
  const u =
    projectionMatrix[0] * x +
    projectionMatrix[1] * y +
    projectionMatrix[2] * z +
    projectionMatrix[3];
  const v =
    projectionMatrix[4] * x +
    projectionMatrix[5] * y +
    projectionMatrix[6] * z +
    projectionMatrix[7];
  const w =
    projectionMatrix[8] * x +
    projectionMatrix[9] * y +
    projectionMatrix[10] * z +
    projectionMatrix[11];

  if (
    !Number.isFinite(u) ||
    !Number.isFinite(v) ||
    !Number.isFinite(w) ||
    w <= 0
  ) {
    return null;
  }

  return {
    x: u / w,
    y: v / w,
  };
}

function getPrimitiveColor(primitive: Scene3dPrimitive) {
  return primitive.solidColor ?? "rgba(255,255,255,1)";
}

function projectLinePrimitive(
  primitive: Extract<Scene3dPrimitive, { kind: "line-list" | "line-strip" }>,
  projectionMatrix: number[]
): Image2dOverlayPrimitive[] {
  if (primitive.kind === "line-list") {
    const points: Image2dOverlayPoint[] = [];
    for (let index = 0; index < primitive.positions.length; index += 6) {
      const start = projectPoint(
        [
          primitive.positions[index],
          primitive.positions[index + 1],
          primitive.positions[index + 2],
        ],
        projectionMatrix
      );
      const end = projectPoint(
        [
          primitive.positions[index + 3],
          primitive.positions[index + 4],
          primitive.positions[index + 5],
        ],
        projectionMatrix
      );
      if (!start || !end) {
        continue;
      }

      points.push(start, end);
    }

    return points.length
      ? [
          {
            kind: "polyline",
            id: primitive.id,
            points,
            strokeColor: getPrimitiveColor(primitive),
            strokeWidth: 2,
            mode: "line-list",
          },
        ]
      : [];
  }

  const points: Image2dOverlayPoint[] = [];
  for (let index = 0; index < primitive.positions.length; index += 3) {
    const point = projectPoint(
      [
        primitive.positions[index],
        primitive.positions[index + 1],
        primitive.positions[index + 2],
      ],
      projectionMatrix
    );
    if (point) {
      points.push(point);
    }
  }

  return points.length >= 2
    ? [
        {
          kind: "polyline",
          id: primitive.id,
          points,
          strokeColor: getPrimitiveColor(primitive),
          strokeWidth: 2,
          mode: "line-strip",
        },
      ]
    : [];
}

function projectCubePrimitive(
  primitive: Extract<Scene3dPrimitive, { kind: "cube-list" }>,
  projectionMatrix: number[]
): Image2dOverlayPrimitive[] {
  const overlays: Image2dOverlayPrimitive[] = [];
  const localCorners = [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.5, 0.5, -0.5],
    [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5],
    [0.5, -0.5, 0.5],
    [0.5, 0.5, 0.5],
    [-0.5, 0.5, 0.5],
  ] as const;
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ] as const;

  for (let index = 0; index < primitive.positions.length; index += 3) {
    const instanceIndex = index / 3;
    const center = new THREE.Vector3(
      primitive.positions[index],
      primitive.positions[index + 1],
      primitive.positions[index + 2]
    );
    const scaleOffset = instanceIndex * 3;
    const halfExtents = new THREE.Vector3(
      primitive.scales[scaleOffset] / 2,
      primitive.scales[scaleOffset + 1] / 2,
      primitive.scales[scaleOffset + 2] / 2
    );
    const rotationOffset = instanceIndex * 4;
    const rotation = primitive.rotations
      ? new THREE.Quaternion(
          primitive.rotations[rotationOffset],
          primitive.rotations[rotationOffset + 1],
          primitive.rotations[rotationOffset + 2],
          primitive.rotations[rotationOffset + 3]
        )
      : new THREE.Quaternion();
    const projectedEdges: Image2dOverlayPoint[] = [];

    const worldCorners = localCorners.map(([x, y, z]) => {
      return new THREE.Vector3(
        x * halfExtents.x * 2,
        y * halfExtents.y * 2,
        z * halfExtents.z * 2
      )
        .multiplyScalar(0.5)
        .applyQuaternion(rotation)
        .add(center);
    });

    edges.forEach(([startIndex, endIndex]) => {
      const start = projectPoint(
        worldCorners[startIndex].toArray() as [number, number, number],
        projectionMatrix
      );
      const end = projectPoint(
        worldCorners[endIndex].toArray() as [number, number, number],
        projectionMatrix
      );
      if (start && end) {
        projectedEdges.push(start, end);
      }
    });

    if (projectedEdges.length) {
      overlays.push({
        kind: "polyline",
        id: `${primitive.id}:${instanceIndex}`,
        points: projectedEdges,
        strokeColor: getPrimitiveColor(primitive),
        strokeWidth: 1.5,
        mode: "line-list",
      });
    }
  }

  return overlays;
}

function projectSpherePrimitive(
  primitive: Extract<Scene3dPrimitive, { kind: "sphere-list" }>,
  projectionMatrix: number[]
): Image2dOverlayPrimitive[] {
  const overlays: Image2dOverlayPrimitive[] = [];

  for (let index = 0; index < primitive.positions.length; index += 3) {
    const instanceIndex = index / 3;
    const center = new THREE.Vector3(
      primitive.positions[index],
      primitive.positions[index + 1],
      primitive.positions[index + 2]
    );
    const scaleOffset = instanceIndex * 3;
    const radii = new THREE.Vector3(
      primitive.scales[scaleOffset] / 2,
      primitive.scales[scaleOffset + 1] / 2,
      primitive.scales[scaleOffset + 2] / 2
    );
    const rotationOffset = instanceIndex * 4;
    const rotation = primitive.rotations
      ? new THREE.Quaternion(
          primitive.rotations[rotationOffset],
          primitive.rotations[rotationOffset + 1],
          primitive.rotations[rotationOffset + 2],
          primitive.rotations[rotationOffset + 3]
        )
      : new THREE.Quaternion();

    const projectedCenter = projectPoint(
      center.toArray() as [number, number, number],
      projectionMatrix
    );
    const projectedXAxis = projectPoint(
      center
        .clone()
        .add(new THREE.Vector3(radii.x, 0, 0).applyQuaternion(rotation))
        .toArray() as [number, number, number],
      projectionMatrix
    );
    const projectedYAxis = projectPoint(
      center
        .clone()
        .add(new THREE.Vector3(0, radii.y, 0).applyQuaternion(rotation))
        .toArray() as [number, number, number],
      projectionMatrix
    );

    if (!projectedCenter || !projectedXAxis || !projectedYAxis) {
      continue;
    }

    overlays.push({
      kind: "circle",
      id: `${primitive.id}:${instanceIndex}`,
      center: projectedCenter,
      radius: Math.hypot(
        projectedXAxis.x - projectedCenter.x,
        projectedXAxis.y - projectedCenter.y
      ),
      radiusY: Math.hypot(
        projectedYAxis.x - projectedCenter.x,
        projectedYAxis.y - projectedCenter.y
      ),
      strokeColor: getPrimitiveColor(primitive),
      strokeWidth: 1.5,
    });
  }

  return overlays;
}

export function projectSceneFrameToImageOverlays(
  frame: Scene3dFrame,
  calibration: DecodedFoxgloveCameraCalibration
) {
  const projectionMatrix = getProjectionMatrix(calibration);
  if (!projectionMatrix) {
    return [];
  }

  return frame.primitives.flatMap((primitive) => {
    if (primitive.kind === "line-list" || primitive.kind === "line-strip") {
      return projectLinePrimitive(primitive, projectionMatrix);
    }

    if (primitive.kind === "cube-list") {
      return projectCubePrimitive(primitive, projectionMatrix);
    }

    if (primitive.kind === "sphere-list") {
      return projectSpherePrimitive(primitive, projectionMatrix);
    }

    return [];
  });
}
