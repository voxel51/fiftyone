import * as THREE from "three";
import type {
  Points3dBounds,
  Scene3dFrame,
  Scene3dInstancePrimitive,
  Scene3dPrimitive,
} from "./archetypes";
import type {
  MultimodalCatalog,
  MultimodalTransformDescriptor,
  MultimodalUpAxis,
} from "./types";
import type {
  DecodedNavSatFixSample,
  DecodedPoseSample,
  DecodedTransform,
} from "./ros-decoder";

export type TransformSample = DecodedTransform & {
  timestampNs: number;
};

export type FrameGraph = Map<
  string,
  Array<{ targetFrameId: string; matrix: THREE.Matrix4 }>
>;

export function buildTransformGraph(
  transformSamples: TransformSample[]
): FrameGraph {
  const latestByEdge = new Map<string, TransformSample>();
  transformSamples.forEach((sample) => {
    if (!sample.parentFrameId || !sample.childFrameId) {
      return;
    }

    latestByEdge.set(`${sample.parentFrameId}->${sample.childFrameId}`, sample);
  });

  const graph: FrameGraph = new Map();
  latestByEdge.forEach((sample) => {
    const matrix = toTransformMatrix(sample);
    const inverseMatrix = matrix.clone().invert();
    const parentNeighbors = graph.get(sample.parentFrameId) ?? [];
    parentNeighbors.push({
      targetFrameId: sample.childFrameId,
      matrix,
    });
    graph.set(sample.parentFrameId, parentNeighbors);
    const childNeighbors = graph.get(sample.childFrameId) ?? [];
    childNeighbors.push({
      targetFrameId: sample.parentFrameId,
      matrix: inverseMatrix,
    });
    graph.set(sample.childFrameId, childNeighbors);
  });

  return graph;
}

export function resolveTransformMatrix(
  graph: FrameGraph,
  sourceFrameId: string | null | undefined,
  targetFrameId: string | null | undefined
) {
  if (!sourceFrameId || !targetFrameId || sourceFrameId === targetFrameId) {
    return new THREE.Matrix4().identity();
  }

  const queue: Array<{ frameId: string; matrix: THREE.Matrix4 }> = [
    { frameId: sourceFrameId, matrix: new THREE.Matrix4().identity() },
  ];
  const visited = new Set<string>([sourceFrameId]);

  while (queue.length) {
    const current = queue.shift()!;
    const neighbors = graph.get(current.frameId) ?? [];

    for (const neighbor of neighbors) {
      if (visited.has(neighbor.targetFrameId)) {
        continue;
      }

      const nextMatrix = current.matrix.clone().premultiply(neighbor.matrix);
      if (neighbor.targetFrameId === targetFrameId) {
        return nextMatrix;
      }

      visited.add(neighbor.targetFrameId);
      queue.push({
        frameId: neighbor.targetFrameId,
        matrix: nextMatrix,
      });
    }
  }

  return null;
}

/** Applies one rigid transform to every primitive in a render-ready 3D scene. */
export function applyTransformToScene3dFrame(
  frame: Scene3dFrame,
  matrix: THREE.Matrix4,
  targetFrameId?: string | null
): Scene3dFrame {
  const transformedPrimitives = frame.primitives.map((primitive) =>
    applyTransformToScene3dPrimitive(primitive, matrix, targetFrameId)
  );

  return composeScene3dFrame({
    id: frame.id,
    frameId: targetFrameId ?? frame.frameId ?? null,
    primitives: transformedPrimitives,
  });
}

/** Merges one or more decoded 3D stream frames into a single panel scene. */
export function mergeScene3dFrames(
  frames: Array<{
    frame: Scene3dFrame;
    streamId: string;
    color: string;
  }>
): {
  frame: Scene3dFrame | null;
  colorMode: "intensity" | "rgb";
} {
  if (!frames.length) {
    return { frame: null, colorMode: "rgb" };
  }

  if (frames.length === 1) {
    return {
      frame: frames[0].frame,
      colorMode: hasIntensityPrimitives(frames[0].frame) ? "intensity" : "rgb",
    };
  }

  return {
    colorMode: "rgb",
    frame: composeScene3dFrame({
      id: frames.map(({ frame }) => frame.id).join("|"),
      frameId: null,
      primitives: frames.flatMap(({ frame, color }) =>
        frame.primitives.map((primitive) =>
          applySolidColorToPrimitive(primitive, color)
        )
      ),
    }),
  };
}

export function getStreamColor(streamId: string) {
  const palette = [
    "#ff7a59",
    "#5ec2ff",
    "#95df72",
    "#ffcf5a",
    "#c79cff",
    "#f58fb0",
  ];
  let hash = 0;
  for (let index = 0; index < streamId.length; index += 1) {
    hash = (hash * 31 + streamId.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length];
}

export function getRelevantTransforms(
  catalog: MultimodalCatalog,
  frameIds: Array<string | null | undefined>
): MultimodalTransformDescriptor[] {
  const frameIdSet = new Set(frameIds.filter(Boolean));
  return catalog.transforms.filter((transform) => {
    return (
      frameIdSet.has(transform.parentFrameId) ||
      frameIdSet.has(transform.childFrameId)
    );
  });
}

export function createFollowPoseFromPose(
  pose: DecodedPoseSample | null | undefined
) {
  if (!pose) {
    return null;
  }

  return {
    position: pose.position,
    orientation: pose.orientation,
  };
}

export function transformPoseSample(
  pose: DecodedPoseSample,
  matrix: THREE.Matrix4
): DecodedPoseSample {
  const position = new THREE.Vector3(...pose.position).applyMatrix4(matrix);
  let orientation = pose.orientation;

  if (orientation) {
    const rotation = new THREE.Quaternion();
    matrix.decompose(new THREE.Vector3(), rotation, new THREE.Vector3());
    orientation = rotation
      .multiply(new THREE.Quaternion(...orientation))
      .toArray() as [number, number, number, number];
  }

  return {
    frameId: pose.frameId,
    position: [position.x, position.y, position.z],
    orientation,
  };
}

export function createFollowPoseFromNavSat(
  sample: DecodedNavSatFixSample | null | undefined,
  anchor: DecodedNavSatFixSample | null | undefined
) {
  if (!sample || !anchor) {
    return null;
  }

  const [east, north, up] = geodeticToEnu(sample, anchor);
  return {
    position: [east, north, up] as [number, number, number],
    orientation: null,
  };
}

export function getUpVector(upAxis: MultimodalUpAxis) {
  if (upAxis === "x") {
    return [1, 0, 0] as [number, number, number];
  }

  if (upAxis === "y") {
    return [0, 1, 0] as [number, number, number];
  }

  return [0, 0, 1] as [number, number, number];
}

function createEmptyBounds(): Points3dBounds {
  return {
    min: [0, 0, 0],
    max: [0, 0, 0],
  };
}

function hasIntensityPrimitives(frame: Scene3dFrame) {
  return frame.primitives.some(
    (primitive) =>
      primitive.kind === "points" && Boolean(primitive.intensity?.length)
  );
}

/** Recomputes a stable 3D scene frame from a collection of primitives. */
export function composeScene3dFrame({
  id,
  frameId,
  primitives,
}: {
  id: string;
  frameId?: string | null;
  primitives: Scene3dPrimitive[];
}): Scene3dFrame {
  const bounds = createEmptyBounds();
  let didInitializeBounds = false;
  let pointCount = 0;

  primitives.forEach((primitive) => {
    const positions = primitive.positions;
    pointCount +=
      primitive.kind === "points" ? primitive.pointCount : positions.length / 3;

    for (let index = 0; index < positions.length; index += 3) {
      updateBounds(
        bounds,
        positions[index],
        positions[index + 1],
        positions[index + 2],
        !didInitializeBounds
      );
      didInitializeBounds = true;
    }
  });

  return {
    id,
    pointCount,
    primitives,
    bounds: didInitializeBounds ? bounds : createEmptyBounds(),
    frameId: frameId ?? null,
  };
}

function transformPositions(
  positions: Float32Array,
  matrix: THREE.Matrix4
): Float32Array {
  const transformed = new Float32Array(positions.length);
  const point = new THREE.Vector3();

  for (let index = 0; index < positions.length; index += 3) {
    point.set(positions[index], positions[index + 1], positions[index + 2]);
    point.applyMatrix4(matrix);
    transformed[index] = point.x;
    transformed[index + 1] = point.y;
    transformed[index + 2] = point.z;
  }

  return transformed;
}

function transformInstanceRotations(
  primitive: Scene3dInstancePrimitive,
  matrix: THREE.Matrix4
) {
  const rotation = new THREE.Quaternion();
  matrix.decompose(new THREE.Vector3(), rotation, new THREE.Vector3());
  if (
    rotation.x === 0 &&
    rotation.y === 0 &&
    rotation.z === 0 &&
    rotation.w === 1 &&
    primitive.rotations
  ) {
    return primitive.rotations;
  }

  const instanceCount = primitive.positions.length / 3;
  const rotations = new Float32Array(instanceCount * 4);
  const identity = new THREE.Quaternion();
  const nextRotation = new THREE.Quaternion();

  for (let index = 0; index < instanceCount; index += 1) {
    const offset = index * 4;
    const currentRotation = primitive.rotations
      ? nextRotation.set(
          primitive.rotations[offset],
          primitive.rotations[offset + 1],
          primitive.rotations[offset + 2],
          primitive.rotations[offset + 3]
        )
      : identity;
    const value = rotation.clone().multiply(currentRotation);
    rotations[offset] = value.x;
    rotations[offset + 1] = value.y;
    rotations[offset + 2] = value.z;
    rotations[offset + 3] = value.w;
  }

  return rotations;
}

/** Applies one rigid transform to a single render-ready 3D primitive. */
export function applyTransformToScene3dPrimitive(
  primitive: Scene3dPrimitive,
  matrix: THREE.Matrix4,
  targetFrameId?: string | null
): Scene3dPrimitive {
  if (primitive.kind === "sphere-list" || primitive.kind === "cube-list") {
    return {
      ...primitive,
      frameId: targetFrameId ?? primitive.frameId ?? null,
      positions: transformPositions(primitive.positions, matrix),
      rotations: transformInstanceRotations(primitive, matrix),
    };
  }

  return {
    ...primitive,
    frameId: targetFrameId ?? primitive.frameId ?? null,
    positions: transformPositions(primitive.positions, matrix),
  };
}

function applySolidColorToPrimitive(
  primitive: Scene3dPrimitive,
  color: string
): Scene3dPrimitive {
  if (primitive.kind === "points") {
    return {
      ...primitive,
      intensity: null,
      colors: null,
      solidColor: color,
    };
  }

  return {
    ...primitive,
    colors: null,
    solidColor: color,
  };
}

function updateBounds(
  bounds: Points3dBounds,
  x: number,
  y: number,
  z: number,
  initialize: boolean
) {
  if (initialize) {
    bounds.min = [x, y, z];
    bounds.max = [x, y, z];
    return;
  }

  bounds.min[0] = Math.min(bounds.min[0], x);
  bounds.min[1] = Math.min(bounds.min[1], y);
  bounds.min[2] = Math.min(bounds.min[2], z);
  bounds.max[0] = Math.max(bounds.max[0], x);
  bounds.max[1] = Math.max(bounds.max[1], y);
  bounds.max[2] = Math.max(bounds.max[2], z);
}

function toTransformMatrix(transform: DecodedTransform) {
  const position = new THREE.Vector3(...transform.translation);
  const quaternion = new THREE.Quaternion(...transform.rotation);
  const matrix = new THREE.Matrix4();
  matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  return matrix;
}

function geodeticToEcef(sample: DecodedNavSatFixSample) {
  const a = 6378137;
  const e2 = 6.69437999014e-3;
  const latitude = THREE.MathUtils.degToRad(sample.latitude);
  const longitude = THREE.MathUtils.degToRad(sample.longitude);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);
  const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);

  return [
    (n + sample.altitude) * cosLat * cosLon,
    (n + sample.altitude) * cosLat * sinLon,
    (n * (1 - e2) + sample.altitude) * sinLat,
  ] as [number, number, number];
}

function geodeticToEnu(
  sample: DecodedNavSatFixSample,
  anchor: DecodedNavSatFixSample
) {
  const sampleEcef = geodeticToEcef(sample);
  const anchorEcef = geodeticToEcef(anchor);
  const latitude = THREE.MathUtils.degToRad(anchor.latitude);
  const longitude = THREE.MathUtils.degToRad(anchor.longitude);
  const dx = sampleEcef[0] - anchorEcef[0];
  const dy = sampleEcef[1] - anchorEcef[1];
  const dz = sampleEcef[2] - anchorEcef[2];
  const east = -Math.sin(longitude) * dx + Math.cos(longitude) * dy;
  const north =
    -Math.sin(latitude) * Math.cos(longitude) * dx -
    Math.sin(latitude) * Math.sin(longitude) * dy +
    Math.cos(latitude) * dz;
  const up =
    Math.cos(latitude) * Math.cos(longitude) * dx +
    Math.cos(latitude) * Math.sin(longitude) * dy +
    Math.sin(latitude) * dz;

  return [east, north, up] as [number, number, number];
}
